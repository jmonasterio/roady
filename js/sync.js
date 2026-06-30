// Sync layer — MyCouch WS client + outbox drain.
//
// Phase C.10 rewrite. Replaces PouchDB.sync with:
//   - WebSocket to `/:db/_ws` for live changes (hello → catchup → change)
//   - Outbox drain posting `PUT /:db/:id` per cf-wire PutDocRequest
//   - HTTP `/changes?since=` fallback poll when the WS can't connect
//
// Wire reference: C:/github/mycouch-rs/crates/cf-wire/src/lib.rs
// Hub URL contract: `ws_url_for` in mycouch-rs hub.rs requires the WS
// envelope's `u` tag to be the RELATIVE path `/:db/_ws[?tenant=T]`.

window.Sync = {
    // --- Transport state ------------------------------------------------
    ws: null,
    url: null,                 // mycouch base URL (no trailing slash, no /db)
    status: 'idle',            // idle | connecting | active | paused | error
    closing: false,

    // --- Reconnect ------------------------------------------------------
    reconnectAttempts: 0,
    reconnectTimer: null,
    RECONNECT_MAX_MS: 30_000,
    RECONNECT_BASE_MS: 500,

    // --- Drain loop -----------------------------------------------------
    drainTimer: null,
    DRAIN_INTERVAL_MS: 800,
    DRAIN_BATCH: 20,
    OUTBOX_MAX_ATTEMPTS: 10,

    // --- Poll fallback --------------------------------------------------
    pollTimer: null,
    POLL_FALLBACK_AFTER_MS: 5_000,   // arm fallback if WS hasn't welcomed by then
    POLL_INTERVAL_MS: 10_000,
    CHANGES_LIMIT: 500,

    // ---------------------------------------------------------------
    // Public API.
    //
    // `setupSync` keeps the legacy signature `(localDb, syncUrl)` because
    // app.js still calls it that way. Both arguments are ignored beyond
    // the URL's base — `localDb` is bound via the global `DB`, and the
    // wire `db_id` is fixed (`DB.DB_ID`) regardless of any trailing path
    // in `syncUrl` (legacy code appended a Pouch IDB name there).
    // ---------------------------------------------------------------
    async setupSync(_localDb, syncUrl) {
        const base = _stripDbSuffix(String(syncUrl || ''));
        return await this.start(base);
    },

    cancelSync() {
        this.stop();
    },

    disableSync() {
        this.stop();
    },

    async start(mycouchBaseUrl) {
        if (!mycouchBaseUrl) {
            console.warn('[Sync] start: missing mycouch base URL');
            return false;
        }
        this.url = mycouchBaseUrl.replace(/\/+$/, '');
        this.closing = false;

        await window.Auth?.waitForAuth(30_000);
        if (!window.Auth?.isAuthenticated()) {
            console.error('[Sync] start: not authenticated');
            this._setStatus('error');
            return false;
        }
        this._connect();
        this._scheduleDrain(50);
        return true;
    },

    stop() {
        this.closing = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.drainTimer) clearTimeout(this.drainTimer);
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.reconnectTimer = this.drainTimer = this.pollTimer = null;
        if (this.ws) {
            try { this.ws.close(); } catch (_) {}
            this.ws = null;
        }
        this._setStatus('idle');
        window.dispatchEvent(new CustomEvent('db-sync-cancelled'));
    },

    // ---------------------------------------------------------------
    // Legacy compat for app.js.
    // ---------------------------------------------------------------
    getSyncStatus() { return this.status; },
    isSyncActive() { return this.status === 'active'; },
    hasSyncErrors() { return this.status === 'error'; },
    getSyncInfo() {
        return {
            status: this.status,
            isActive: !!this.ws,
            hasErrors: this.hasSyncErrors(),
        };
    },

    // ---------------------------------------------------------------
    // WebSocket connection lifecycle.
    // ---------------------------------------------------------------
    async _connect() {
        if (this.closing) return;
        const dbId = DB.DB_ID;
        const wsBase = this.url.replace(/^http/i, 'ws');
        const wsUrl = `${wsBase}/${dbId}/_ws`;
        // Server's ws_url_for builds the relative path `/db/_ws`, so the
        // `u` tag we sign MUST be relative — full URL would fail to verify.
        const signUrl = `/${dbId}/_ws`;

        let envelope;
        try {
            envelope = await window.Auth.signMna1(signUrl, 'GET');
        } catch (e) {
            console.error('[Sync] envelope sign failed:', e);
            this._scheduleReconnect();
            return;
        }

        this._setStatus('connecting');
        let ws;
        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            console.warn('[Sync] WS construct failed:', e.message);
            this._scheduleReconnect();
            return;
        }
        this.ws = ws;
        this._armPollFallback();

        ws.onopen = async () => {
            try {
                const lastSeq = await DB.getLastSeq();
                const clientId = await DB.getClientId();
                const hello = {
                    type: 'hello',
                    auth: envelope,
                    lastSeq: lastSeq | 0,
                };
                if (clientId) hello.clientId = clientId;
                ws.send(JSON.stringify(hello));
            } catch (e) {
                console.error('[Sync] hello failed:', e);
                try { ws.close(); } catch (_) {}
            }
        };
        ws.onmessage = (ev) => { this._onMessage(ev.data); };
        ws.onerror = (e) => {
            console.debug('[Sync] WS error event', e?.type || e);
        };
        ws.onclose = (ev) => {
            this.ws = null;
            if (this.closing) return;
            // 4401 = auth_failed / pubkey_changed (closed deliberately by hub)
            if (ev.code === 4401) {
                console.error('[Sync] WS auth rejected (code 4401):', ev.reason);
                this._setStatus('error');
            } else {
                this._setStatus('paused');
            }
            this._scheduleReconnect();
        };
    },

    _scheduleReconnect() {
        if (this.closing) return;
        this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 8);
        const ms = Math.min(
            this.RECONNECT_MAX_MS,
            this.RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
        );
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this._connect(), ms);
        this._armPollFallback();
    },

    // ---------------------------------------------------------------
    // Server frame handling.
    // ---------------------------------------------------------------
    async _onMessage(data) {
        let frame;
        try { frame = JSON.parse(data); }
        catch (e) { console.warn('[Sync] bad WS frame', e); return; }

        switch (frame.type) {
            case 'welcome':
                if (frame.clientId) await DB.setClientId(frame.clientId);
                this.reconnectAttempts = 0;
                this._cancelPollFallback();
                this._setStatus('active');
                window.dispatchEvent(new CustomEvent('db-sync-active'));
                break;

            case 'catchup': {
                for (const change of frame.changes || []) {
                    await DB.applyServerChange(change);
                }
                if (typeof frame.last_seq === 'number') {
                    await DB.setLastSeq(frame.last_seq);
                }
                window.dispatchEvent(new CustomEvent('db-sync-change', {
                    detail: { catchup: true, count: (frame.changes || []).length },
                }));
                break;
            }

            case 'change': {
                await DB.applyServerChange(frame);
                if (typeof frame.seq === 'number') {
                    await DB.setLastSeq(frame.seq);
                    this._send({ type: 'ack', seq: frame.seq });
                }
                window.dispatchEvent(new CustomEvent('db-sync-change', {
                    detail: { seq: frame.seq, doc_id: frame.doc_id },
                }));
                break;
            }

            case 'auth_required': {
                try {
                    const signUrl = `/${DB.DB_ID}/_ws`;
                    const reauth = await window.Auth.signMna1(signUrl, 'GET');
                    this._send({ type: 'reauth', auth: reauth });
                } catch (e) {
                    console.error('[Sync] reauth failed:', e);
                }
                break;
            }

            case 'error':
                console.warn('[Sync] server error frame:', frame.code, frame.message);
                if (frame.code === 'unauthorized') {
                    this._setStatus('error');
                }
                break;

            default:
                console.debug('[Sync] unknown frame', frame.type);
        }
    },

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(obj)); }
            catch (e) { console.warn('[Sync] send failed', e); }
        }
    },

    // ---------------------------------------------------------------
    // HTTP `/changes` fallback. Armed whenever the WS isn't `active`;
    // disarmed by the `welcome` handler so we don't double-pull.
    // ---------------------------------------------------------------
    _armPollFallback() {
        if (this.closing) return;
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = setTimeout(() => this._pollChanges(), this.POLL_FALLBACK_AFTER_MS);
    },

    _cancelPollFallback() {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
    },

    async _pollChanges() {
        if (this.closing) return;
        try {
            const since = await DB.getLastSeq();
            const url = `${this.url}/${DB.DB_ID}/changes?since=${since}&limit=${this.CHANGES_LIMIT}`;
            const res = await window.Auth.fetchWithAuth(url, { method: 'GET' });
            if (res.ok) {
                const body = await res.json();
                for (const ch of body.changes || []) {
                    await DB.applyServerChange(ch);
                }
                if (typeof body.last_seq === 'number') {
                    await DB.setLastSeq(body.last_seq);
                }
                window.dispatchEvent(new CustomEvent('db-sync-change', {
                    detail: { polled: true, count: (body.changes || []).length },
                }));
            } else if (res.status === 401) {
                console.error('[Sync] /changes auth rejected');
                this._setStatus('error');
            } else {
                console.debug('[Sync] /changes returned', res.status);
            }
        } catch (e) {
            console.debug('[Sync] /changes transport failed:', e.message);
        } finally {
            // Keep polling until the WS is healthy again.
            if (!this.closing && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
                this.pollTimer = setTimeout(
                    () => this._pollChanges(),
                    this.POLL_INTERVAL_MS,
                );
            }
        }
    },

    // ---------------------------------------------------------------
    // Outbox drain loop.
    //
    // Always running once `start` is called; survives WS disconnects.
    // Each entry is a single REST round-trip — no batching against
    // `/_bulk` yet (would need conflict-fanout handling we don't have).
    // ---------------------------------------------------------------
    _scheduleDrain(delay) {
        if (this.closing) return;
        if (this.drainTimer) clearTimeout(this.drainTimer);
        this.drainTimer = setTimeout(
            () => { this._drainBatch().catch(e => console.warn('[Sync] drain crashed', e)); },
            delay,
        );
    },

    async _drainBatch() {
        if (this.closing) return;
        let drained = 0;
        try {
            if (!window.Auth?.isAuthenticated()) return;
            const entries = await DB.outboxNext(this.DRAIN_BATCH);
            for (const entry of entries) {
                const ok = await this._drainEntry(entry);
                if (ok) drained++;
            }
        } finally {
            // If there's clearly more to do, retry promptly; otherwise
            // back off to the steady-state interval.
            const next = drained === this.DRAIN_BATCH ? 50 : this.DRAIN_INTERVAL_MS;
            this._scheduleDrain(next);
        }
    },

    async _drainEntry(entry) {
        if ((entry.attempts || 0) >= this.OUTBOX_MAX_ATTEMPTS) {
            console.error('[Sync] outbox entry exceeded retry limit; dropping', entry);
            await DB.db.outbox.delete(entry.id);
            window.dispatchEvent(new CustomEvent('db-sync-error', {
                detail: { code: 'outbox_dropped', doc_id: entry.doc_id },
            }));
            return true;
        }

        await DB.outboxMarkInflight(entry.id);
        const url = `${this.url}/${entry.db_id}/${encodeURIComponent(entry.doc_id)}`;
        const payload = {
            doc_type: entry.doc_type,
            body: entry.body,
        };
        if (entry.tenant_id != null) payload.tenant_id = entry.tenant_id;
        if (entry.ifVersion !== undefined) payload.ifVersion = entry.ifVersion;
        if (entry.base !== undefined) payload.base = entry.base;

        let res;
        try {
            res = await window.Auth.fetchWithAuth(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            // Network failure — requeue without bumping past max.
            console.debug('[Sync] PUT transport failed', e.message);
            await DB.db.outbox.update(entry.id, {
                status: 'pending',
                attempts: (entry.attempts || 0) + 1,
            });
            return false;
        }

        if (res.ok) {
            const json = await res.json().catch(() => ({}));
            if (json.merged && json.doc) {
                // Server performed a 3-way merge; the stored body differs from
                // what we sent. Adopt the authoritative doc (reuse the row-replace
                // path) and notify the app to refresh its view.
                await DB.outboxConflict(entry.id, json.doc);
                window.dispatchEvent(new CustomEvent('db-sync-merged', {
                    detail: { doc_id: entry.doc_id, doc: json.doc },
                }));
            } else {
                await DB.outboxAck(entry.id, {
                    version: json.version,
                    updated_at: json.updated_at,
                });
            }
            return true;
        }
        if (res.status === 409) {
            const conflict = await res.json().catch(() => ({}));
            if (conflict && conflict.current) {
                await DB.outboxConflict(entry.id, conflict.current);
                window.dispatchEvent(new CustomEvent('db-sync-conflict', {
                    detail: { doc_id: entry.doc_id, current: conflict.current },
                }));
                return true;
            }
            // Conflict without payload — shouldn't happen but don't burn the row.
            await DB.db.outbox.update(entry.id, {
                status: 'pending',
                attempts: (entry.attempts || 0) + 1,
            });
            return false;
        }
        if (res.status === 401) {
            // Auth window slid out from under us, or signer rejected. The
            // next attempt will sign a fresh envelope; no point burning
            // through retries fast.
            this._setStatus('error');
            await DB.db.outbox.update(entry.id, {
                status: 'pending',
                attempts: (entry.attempts || 0) + 1,
            });
            return false;
        }
        if (res.status === 403) {
            // Tenant membership rejected — permanent for this entry.
            console.error('[Sync] PUT 403 forbidden, dropping entry', entry);
            await DB.db.outbox.delete(entry.id);
            window.dispatchEvent(new CustomEvent('db-sync-error', {
                detail: { code: 'forbidden', doc_id: entry.doc_id },
            }));
            return true;
        }
        // 5xx / unknown — requeue.
        console.warn('[Sync] PUT', res.status, 'for', entry.doc_id);
        await DB.db.outbox.update(entry.id, {
            status: 'pending',
            attempts: (entry.attempts || 0) + 1,
        });
        return false;
    },

    // ---------------------------------------------------------------
    // Status helper. Coalesces redundant transitions into events.
    // ---------------------------------------------------------------
    _setStatus(s) {
        if (this.status === s) return;
        this.status = s;
        if (s === 'paused') {
            window.dispatchEvent(new CustomEvent('db-sync-paused'));
        } else if (s === 'error') {
            window.dispatchEvent(new CustomEvent('db-sync-error'));
        }
    },
};

// ============================================================
// Helpers
// ============================================================

// Legacy callers pass `${base}/${dbName}` where dbName was the local
// PouchDB IndexedDB name. Strip only the trailing /<dbname> segment so
// any path prefix (e.g. same-origin `/__api__`) survives.
function _stripDbSuffix(url) {
    const trimmed = String(url || '').replace(/\/+$/, '');
    return trimmed.replace(/\/[A-Za-z0-9_-]+$/, '');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.Sync;
}
