// Tenant Management Service — REST against MyCouch `/api/*` under MNA1 auth.
//
// Phase C.11 rewrite. Replaces the dual-PouchDB tenant/user replication with
// direct REST calls (`/api/my-tenants`, `/api/tenants/...`, `/api/invitations/*`)
// signed via MNA1 envelopes from `Auth.fetchWithAuth`. Active tenant is
// persisted in Dexie meta (`active_tenant_id`) — there is no server-side
// session document under MNA1, and there never will be one again.
//
// Wire reference: mycouch-rs `crates/cf-tenant/src/types.rs` (Tenant /
// TenantWithRole) and `workers/mycouch/src/routes_tenant.rs` (HTTP shapes).
//
// Tenant shape returned by the server (TenantWithRole):
//   { tenant_id, name, application_id, owner_user_hash,
//     auto_created, version, updated_at, role }
//
// We normalize to a legacy-compatible app shape so app.js keeps its
// `b._id` / `b.name` / `b.tenantId` accessors working:
//   { _id, tenant_id, tenantId, name, role, application_id,
//     owner_user_hash, auto_created, version, updated_at, type:'tenant' }

// _fetchMyTenants success/failure cache TTL. One fetch == one remote
// sign_event RPC (NIP-46), so absorb startup's duplicate reads and
// fast failure-retry loops instead of re-signing each time.
const TENANTS_CACHE_TTL_MS = 10000;

class TenantManager {
    constructor(mycouchBaseUrl = null) {
        this.mycouchBaseUrl = mycouchBaseUrl || this._inferMycouchUrl();

        this.currentTenant = null;
        this.tenantList = [];
        this.currentUserSub = null;   // nostr pubkey hex
        this.currentUserHash = null;  // sha256(pubkey_hex_lowercase)

        // Compat shim — old polling code consulted localUserDoc to read
        // `active_tenant_id`. Under MNA1 we keep this object populated with
        // a minimal user-shaped record so app.js's validateUserTenantsFormat
        // call doesn't trip; the active tenant lives in Dexie meta.
        this.localUserDoc = null;

        this.changeCallbacks = [];

        // _fetchMyTenants dedupe/cache. Every fetch costs one remote
        // sign_event RPC (NIP-46), so concurrent callers share one
        // in-flight promise and both outcomes are cached for
        // TENANTS_CACHE_TTL_MS. Mutations call _invalidateTenantsCache().
        this._tenantsInflight = null;
        this._tenantsCache = null;
        this._tenantsFetchedAt = 0;
        this._tenantsFailedAt = 0;
        this._tenantsFailedErr = null;

        // Removed under MNA1: usersDb / tenantsDb (PouchDB), poller handles,
        // sequence cursors. The WS hub + outbox in sync.js own data freshness.
    }

    // ---------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------
    async initializeTenantContext() {
        console.log('🍊 TenantManager: init');

        const pubkey = window.Auth?.getPubkey();
        if (!pubkey) throw new Error('No nostr pubkey available - user not authenticated');
        this.currentUserSub = pubkey;
        this.currentUserHash = await window.Auth.getUserHash();

        this.localUserDoc = {
            _id: `user_${this.currentUserHash}`,
            type: 'user',
            createdAt: new Date().toISOString(),
            tenants: [], // see validateUserTenantsFormat (compat stub)
        };

        // A failed fetch means the signer/network is down — NOT that the
        // account has zero tenants. Conflating the two makes the first-run
        // branch mint a duplicate "My Band" on every retry (and risks
        // creating real duplicates the instant the signer recovers mid-loop).
        // Bail out so the caller's retry path re-tries the READ only.
        try {
            this.tenantList = await this._fetchMyTenants();
        } catch (e) {
            console.warn('⚠️ TenantManager: /api/my-tenants failed:', e.message);
            throw new Error(`Cannot reach MyCouch/signer — will retry: ${e.message}`);
        }
        console.log(`📋 Found ${this.tenantList.length} tenants`);

        // Genuine first-run: server confirmed an empty list → mint one
        // personal tenant. A failure here is a real error; let it propagate.
        if (this.tenantList.length === 0) {
            console.log('📍 First run — creating personal tenant');
            const personal = await this.createTenant({ name: 'My Band' });
            this.tenantList = [personal];
        }

        // Restore active tenant from Dexie meta, else first in list.
        const savedActiveId = await this._loadActiveTenantId();
        let selected = savedActiveId
            ? this.tenantList.find(t => t._id === savedActiveId || t.tenant_id === savedActiveId)
            : null;
        if (!selected && this.tenantList.length > 0) selected = this.tenantList[0];

        if (!selected) {
            throw new Error('No tenants available. Please contact support or try signing in again.');
        }
        this.currentTenant = selected;
        await this._saveActiveTenantId(selected._id);
        this._notify();

        console.log('✅ TenantManager: active tenant:', selected.name, selected._id);
        return selected;
    }

    // ---------------------------------------------------------------
    // Tenant catalog — all flavors of "give me the tenant list" map to
    // the same REST call. Local-vs-server distinction is gone under MNA1.
    // ---------------------------------------------------------------
    async getMyTenants() {
        try {
            this.tenantList = await this._fetchMyTenants();
            this._notify();
            return this.tenantList;
        } catch (e) {
            console.warn('⚠️ getMyTenants failed; returning last-known list:', e.message);
            return this.tenantList;
        }
    }

    async getMyTenantsFromServer() {
        return await this.getMyTenants();
    }

    async getMyTenantsFromLocal() {
        // Legacy alias: returns the in-memory cache, which IS the local
        // truth now (no separate PouchDB to consult).
        return this.tenantList;
    }

    getCurrentTenant() { return this.currentTenant; }
    getTenantList()    { return this.tenantList; }

    // ---------------------------------------------------------------
    // Tenant mutations.
    // ---------------------------------------------------------------
    async createTenant({ name, application_id } = {}) {
        if (!name || !name.trim()) throw new Error('Tenant name required');
        const url = `${this._base()}/api/tenants`;
        const body = JSON.stringify(
            application_id ? { name, application_id } : { name },
        );
        const res = await window.Auth.fetchWithAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`createTenant ${res.status}: ${text}`);
        }
        const raw = await res.json();
        const t = _normalize(raw);
        // Server returns the bare Tenant; first-creator is implicitly owner.
        if (!t.role) t.role = 'owner';
        this._upsertIntoList(t);
        this._invalidateTenantsCache();
        return t;
    }

    async updateTenant(tenantId, patch) {
        const tid = _internalId(tenantId);
        const url = `${this._base()}/api/tenants/${encodeURIComponent(tid)}`;
        const res = await window.Auth.fetchWithAuth(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch || {}),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`updateTenant ${res.status}: ${text}`);
        }
        const raw = await res.json();
        const t = _normalize(raw);
        this._upsertIntoList(t);
        return t;
    }

    async createInvitation(tenantId, { role, email } = {}) {
        const tid = _internalId(tenantId);
        const url = `${this._base()}/api/tenants/${encodeURIComponent(tid)}/invitations`;
        const body = { role };
        if (email && email.trim()) body.email = email.trim();
        const res = await window.Auth.fetchWithAuth(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`createInvitation ${res.status}: ${text}`);
        }
        return await res.json();
    }

    async deleteTenant(tenantId) {
        const tid = _internalId(tenantId);
        const url = `${this._base()}/api/tenants/${encodeURIComponent(tid)}`;
        const res = await window.Auth.fetchWithAuth(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) {
            const text = await res.text().catch(() => '');
            throw new Error(`deleteTenant ${res.status}: ${text}`);
        }
        this._invalidateTenantsCache();
        this.tenantList = this.tenantList.filter(
            t => t._id !== tid && t.tenant_id !== tid,
        );
        if (this.currentTenant && (this.currentTenant._id === tid || this.currentTenant.tenant_id === tid)) {
            this.currentTenant = this.tenantList[0] || null;
            await this._saveActiveTenantId(this.currentTenant?._id || null);
        }
        this._notify();
    }

    // Remove a member from a tenant by raw `user_hash` (sha256(pubkey),
    // lowercase hex — NO `user_` prefix; the server keys `tenant_members` on
    // the bare hash). Defensively strips a `user_` prefix if a caller passes a
    // UI-shaped id. Owner/admin only server-side (403 otherwise).
    async removeMemberByHash(tenantId, userHash) {
        const tid = _internalId(tenantId);
        const hash = String(userHash || '').replace(/^user_/, '');
        if (!hash) throw new Error('removeMemberByHash: empty userHash');
        const url = `${this._base()}/api/tenants/${encodeURIComponent(tid)}/members/${encodeURIComponent(hash)}`;
        const res = await window.Auth.fetchWithAuth(url, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) {
            const text = await res.text().catch(() => '');
            throw new Error(`removeMemberByHash ${res.status}: ${text}`);
        }
        this._invalidateTenantsCache();
        return true;
    }

    async leaveTenant(tenantId) {
        const tid = _internalId(tenantId);
        // `currentUserHash` is the raw hash; removeMemberByHash builds the path.
        await this.removeMemberByHash(tid, this.currentUserHash);
        this._invalidateTenantsCache();
        this.tenantList = this.tenantList.filter(
            t => t._id !== tid && t.tenant_id !== tid,
        );
        if (this.currentTenant && (this.currentTenant._id === tid || this.currentTenant.tenant_id === tid)) {
            this.currentTenant = this.tenantList[0] || null;
            await this._saveActiveTenantId(this.currentTenant?._id || null);
        }
        this._notify();
    }

    // Adopt an externally-provided tenant doc (e.g. server response from
    // invitation accept) without re-fetching. Normalizes whatever shape
    // shows up; safe to call with a TenantWithRole or a legacy doc.
    async addOrUpdateTenant(raw) {
        if (!raw) return null;
        const t = _normalize(raw);
        this._upsertIntoList(t);
        this._invalidateTenantsCache();
        this._notify();
        return t;
    }

    // ---------------------------------------------------------------
    // Active-tenant selection.
    // ---------------------------------------------------------------
    async switchTenant(tenantId) {
        console.log(`🔄 switchTenant: ${tenantId}`);
        const tid = _internalId(tenantId);
        let tenant = this.tenantList.find(t => t._id === tid || t.tenant_id === tid);
        if (!tenant) {
            await this.getMyTenants();
            tenant = this.tenantList.find(t => t._id === tid || t.tenant_id === tid);
        }
        if (!tenant) throw new Error(`Tenant ${tenantId} not in user's tenant list`);

        this.currentTenant = tenant;
        await this._saveActiveTenantId(tenant._id);
        this._notify();
        console.log(`✅ Switched to tenant: ${tenant.name}`);
        return tenant;
    }

    extractVirtualTenantId(tenantId) {
        return tenantId.startsWith('tenant_') ? tenantId.substring(7) : tenantId;
    }

    // ---------------------------------------------------------------
    // Auth helpers — kept for callers that haven't migrated yet.
    // ---------------------------------------------------------------
    async hashUserId(sub) {
        const bytes = new TextEncoder().encode(sub);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async getAuthToken() {
        // MNA1 has no bearer token. Callers MUST switch to
        // `Auth.fetchWithAuth` — the C.10 deprecation warning fires.
        return await window.Auth.getAuthToken();
    }

    // ---------------------------------------------------------------
    // Change notification — preserved API. Sync.js could feed this in
    // future when a `change` for a tenant doc arrives; for now app.js
    // calls `getMyTenants()` after explicit mutations.
    // ---------------------------------------------------------------
    onChanges(callback) {
        if (typeof callback === 'function') this.changeCallbacks.push(callback);
    }

    _notify() {
        for (const cb of this.changeCallbacks) {
            try { cb(); } catch (e) { console.error('change callback:', e); }
        }
    }

    // ---------------------------------------------------------------
    // user.tenants validation — compat stubs. The PouchDB-era code
    // detected a specific data-corruption pattern that can't happen
    // under MNA1 (no client-side mutation of the user doc). app.js
    // still calls these defensively; return "valid".
    // ---------------------------------------------------------------
    validateUserTenantsFormat(_userDoc) {
        return { valid: true, errors: [] };
    }
    logValidationErrors(_validation) { return true; }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------
    _base() {
        return (this.mycouchBaseUrl || this._inferMycouchUrl()).replace(/\/+$/, '');
    }

    _inferMycouchUrl() {
        try {
            if (window.Alpine?.store) {
                const store = window.Alpine.store('roady');
                if (store?.options?.mycouchBaseUrl) return store.options.mycouchBaseUrl;
            }
        } catch (_) { /* Alpine not ready */ }
        return this.mycouchBaseUrl || '';
    }

    // Backwards-compat alias for callers that still inspect getMycouchUrl().
    getMycouchUrl() { return this._inferMycouchUrl(); }

    // One GET /api/my-tenants == one remote sign_event RPC, so be stingy:
    // concurrent callers share the in-flight promise, and the last success
    // OR failure is replayed for TENANTS_CACHE_TTL_MS before signing again.
    async _fetchMyTenants() {
        const now = Date.now();
        if (this._tenantsInflight) return this._tenantsInflight;
        if (this._tenantsCache && (now - this._tenantsFetchedAt) < TENANTS_CACHE_TTL_MS) {
            return this._tenantsCache.slice();
        }
        if (this._tenantsFailedErr !== null && (now - this._tenantsFailedAt) < TENANTS_CACHE_TTL_MS) {
            throw new Error(this._tenantsFailedErr);
        }
        const inflight = (async () => {
            try {
                const list = await this._fetchMyTenantsInner();
                // Only record if a mutation hasn't invalidated us mid-flight.
                if (this._tenantsInflight === inflight) {
                    this._tenantsCache = list;
                    this._tenantsFetchedAt = Date.now();
                    this._tenantsFailedAt = 0;
                    this._tenantsFailedErr = null;
                }
                return list;
            } catch (e) {
                if (this._tenantsInflight === inflight) {
                    this._tenantsFailedAt = Date.now();
                    this._tenantsFailedErr = e && e.message ? e.message : String(e);
                }
                throw e;
            } finally {
                if (this._tenantsInflight === inflight) this._tenantsInflight = null;
            }
        })();
        this._tenantsInflight = inflight;
        return inflight;
    }

    // Drop cached results AND any in-flight fetch (its response predates
    // the mutation) so the next _fetchMyTenants() hits the network.
    _invalidateTenantsCache() {
        this._tenantsInflight = null;
        this._tenantsCache = null;
        this._tenantsFetchedAt = 0;
        this._tenantsFailedAt = 0;
        this._tenantsFailedErr = null;
    }

    // Raw fetch — always signs and hits the network. Callers use
    // _fetchMyTenants() above.
    async _fetchMyTenantsInner() {
        const url = `${this._base()}/api/my-tenants`;
        // Sign the request first — bounded by the signer's own RPC timeout. Web
        // signers (nsec.app) can take several seconds to wake, so the abort timer
        // below must cover only the HTTP round-trip, not signer wake time.
        // Otherwise a slow-but-working sign trips the abort and is misreported as
        // "can't reach signer" (DOMException: signal is aborted without reason).
        const authed = await window.Auth.authenticatedFetch(url, { method: 'GET' });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        let res;
        try {
            res = await fetch(url, { ...authed, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`my-tenants ${res.status}: ${text}`);
        }
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.tenants || []);
        return list.map(_normalize);
    }

    _upsertIntoList(t) {
        const i = this.tenantList.findIndex(
            x => x._id === t._id || x.tenant_id === t.tenant_id,
        );
        if (i >= 0) this.tenantList[i] = { ...this.tenantList[i], ...t };
        else this.tenantList.push(t);
    }

    async _loadActiveTenantId() {
        try {
            const row = await DB?.db?.meta?.get('active_tenant_id');
            return row?.value || null;
        } catch (_) { return null; }
    }

    async _saveActiveTenantId(id) {
        try {
            if (id) await DB?.db?.meta?.put({ key: 'active_tenant_id', value: id });
            else await DB?.db?.meta?.delete('active_tenant_id');
        } catch (e) {
            console.warn('⚠️ persist active_tenant_id failed:', e.message);
        }
    }
}

// ============================================================
// Helpers (module-local)
// ============================================================

// Normalize whatever tenant shape we receive into the app-facing object.
// Accepts TenantWithRole, Tenant, or a legacy Pouch tenant doc.
function _normalize(raw) {
    if (!raw) return null;
    const tenant_id = raw.tenant_id || raw._id || raw.id || (raw.tenantId ? `tenant_${raw.tenantId}` : null);
    if (!tenant_id) return raw; // give up gracefully
    const id = _internalId(tenant_id);
    return {
        _id: id,
        tenant_id: id,
        tenantId: id.startsWith('tenant_') ? id.substring(7) : id,
        name: raw.name || '',
        role: raw.role || null,
        application_id: raw.application_id || raw.applicationId || 'roady',
        owner_user_hash: raw.owner_user_hash || raw.ownerUserHash || null,
        auto_created: !!(raw.auto_created || raw.autoCreated),
        version: raw.version ?? null,
        updated_at: raw.updated_at ?? raw.updatedAt ?? null,
        type: 'tenant',
        // Preserve legacy `userIds` if the caller supplied it — some
        // call sites still inspect it for member count.
        userIds: Array.isArray(raw.userIds) ? raw.userIds : undefined,
    };
}

// Ensure `tenant_<...>` form (the server's canonical ID); accepts either
// the prefixed or stripped form.
function _internalId(id) {
    if (!id) return id;
    return id.startsWith('tenant_') ? id : `tenant_${id}`;
}

// Export for global use
window.TenantManager = TenantManager;
