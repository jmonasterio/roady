// Database layer — Dexie + outbox + MyCouch wire shapes (cf-wire).
//
// Phase C.9 rewrite. Replaces PouchDB. Same DAL surface so app.js is
// untouched. sync.js (C.10) drains `outbox` against the new REST/WS
// protocol; tenant-manager.js (C.11) consumes Dexie tables directly.
//
// Wire reference: C:/github/mycouch-rs/crates/cf-wire/src/lib.rs
//
// Internal storage shape (Dexie `documents` table) = wire `Document` plus
// a `pending` flag (number of unacked outbox ops on this row). Legacy app
// shape — `{ _id, type, tenant, ...fields, deletedAt? }` — is reconstructed
// at the DAL boundary so consumers don't see wire framing.

const DB = {
    // --- Dexie handles ---------------------------------------------------
    db: null,           // Dexie: documents + outbox + meta for the active scope
    optionsDb: null,    // Dexie: local-only kv store (never synced)

    // --- Scope ----------------------------------------------------------
    DB_ID: 'roady',           // wire db_id this client speaks for
    currentTenant: null,
    currentRemoteUrl: null,
    currentUsername: null,

    // ---------------------------------------------------------------
    // URL hash + identity (preserved verbatim from the PouchDB version
    // so existing IndexedDB names line up across the cutover).
    // ---------------------------------------------------------------
    hashRemoteUrl(url) {
        let canonicalized = url
            .toLowerCase()
            .replace(/\/$/, '')
            .split('?')[0]
            .split('#')[0];
        let hash = 0;
        for (let i = 0; i < canonicalized.length; i++) {
            const char = canonicalized.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).slice(-8);
    },

    setRemoteIdentity(remoteUrl, username) {
        this.currentRemoteUrl = remoteUrl;
        this.currentUsername = username;
        console.log(`📍 DB: Remote identity set - URL: ${remoteUrl}, User: ${username}`);
    },

    setTenant(tenantId) {
        this.currentTenant = tenantId;
    },

    _initOptionsDb() {
        // Local-only preferences ('roady_options'). Never scoped, never
        // synced — always safe to open, independent of remote identity.
        if (this.optionsDb) return;
        const opt = new Dexie('roady_options');
        opt.version(1).stores({ kv: '&key' });
        this.optionsDb = opt;
    },

    init() {
        // Options DB is local-only and always available.
        this._initOptionsDb();

        if (!(this.currentRemoteUrl && this.currentUsername)) {
            // No silent fallback: an unscoped data DB hides the real failure
            // (remote URL or user identity never resolved upstream). Fail loud.
            throw new Error(
                `DB.init: refusing to open an unscoped database — ` +
                `remoteUrl=${JSON.stringify(this.currentRemoteUrl)} ` +
                `username=${JSON.stringify(this.currentUsername)}`
            );
        }

        const urlHash = this.hashRemoteUrl(this.currentRemoteUrl);
        // Keep the legacy `pouchdb-local-` prefix so per-scope databases
        // remain segregated from any leftover PouchDB IDBs in the same
        // browser. A future cleanup can rename to `mycouch-`.
        const dbName = `pouchdb-local-${urlHash}-${this.currentUsername}`;
        console.log(`📦 DB: Using scoped database - ${dbName}`);

        const dx = new Dexie(dbName);
        dx.version(1).stores({
            // documents — keyed by doc_id; compound indexes serve the
            // type+tenant+deleted scans used by every getAllX() call.
            documents: '&doc_id, [doc_type+tenant_id+deleted], updated_at',
            // outbox — append-only queue of pending mutations. status:
            //   'pending'  → ready to send
            //   'inflight' → handed to sync.js, awaiting response
            // Conflict / hard-error entries are removed by sync.js after
            // it reconciles them (or surfaces the conflict).
            outbox: '++id, doc_id, status, enqueued_at',
            // meta — tiny kv: last_seq, client_id.
            meta: '&key',
        });
        this.db = dx;
    },

    getDb() {
        // Compat shim. PouchDB-era callers (sync.js, tenant-manager.js)
        // grabbed the raw db here and called .sync()/.put() on it.
        // Returning the Dexie handle is harmless for read-only access but
        // any sync.js / tenant-manager.js code that hits this MUST be
        // rewritten in C.10/C.11 — Dexie has no .sync().
        return this.db;
    },

    // ---------------------------------------------------------------
    // Local-only options (never synced).
    // ---------------------------------------------------------------
    async getOptions() {
        const row = await this.optionsDb.kv.get('app_options');
        return row?.value || {};
    },

    async saveOptions(options) {
        // Strip Alpine's reactive Proxy wrapper — IDB's structured clone
        // refuses non-cloneable host objects. `options` is plain data, so a
        // JSON round-trip is safe and forces a serializable snapshot.
        const plain = JSON.parse(JSON.stringify(options));
        await this.optionsDb.kv.put({ key: 'app_options', value: plain });
    },

    // ---------------------------------------------------------------
    // Meta — last_seq, client_id. Used by sync.js (C.10).
    // ---------------------------------------------------------------
    async getLastSeq() {
        const r = await this.db.meta.get('last_seq');
        return r?.value || 0;
    },
    async setLastSeq(seq) {
        await this.db.meta.put({ key: 'last_seq', value: seq });
    },
    // Count of non-deleted local documents (all tenants) — compared against
    // the server's live count (welcome frame) to detect a stranded cursor.
    async countLiveDocs() {
        let n = 0;
        await this.db.documents.each(r => { if (!r.deleted) n++; });
        return n;
    },
    async getClientId() {
        const r = await this.db.meta.get('client_id');
        return r?.value || null;
    },
    async setClientId(id) {
        await this.db.meta.put({ key: 'client_id', value: id });
    },

    // ---------------------------------------------------------------
    // Wire <-> legacy shape conversion.
    //
    // Wire Document = { db_id, doc_id, doc_type, tenant_id?, body,
    //                   version, updated_at, updated_by, deleted }
    // Legacy app doc = { _id, type, tenant?, ...body, deletedAt? }
    //
    // The framing fields (_id/type/tenant) are stripped into wire
    // columns; everything else (createdAt, name, deletedAt, equipmentIds,
    // checklists, …) lives in `body` verbatim so the app sees no change.
    // ---------------------------------------------------------------
    _toLegacy(row) {
        if (!row) return null;
        const legacy = { ...(row.body || {}) };
        legacy._id = row.doc_id;
        legacy.type = row.doc_type;
        if (row.tenant_id != null) legacy.tenant = row.tenant_id;
        // Server version is exposed under a non-clashing name so app code
        // that round-trips a doc (read → mutate → save) doesn't accidentally
        // wipe it. The legacy _rev is gone — version is the LWW key.
        legacy._version = row.version;
        return legacy;
    },

    _splitLegacy(legacy) {
        // Returns { doc_id, doc_type, tenant_id, body }.
        const { _id, _rev, _version, type, tenant, ...body } = legacy;
        return {
            doc_id: _id,
            doc_type: type,
            tenant_id: tenant ?? null,
            body,
        };
    },

    // Collision-resistant doc id. Bare `prefix + Date.now()` collides when two
    // docs are minted in the same millisecond — a double-fired add handler, or
    // two offline devices creating at the same epoch ms — and `_putLocal` then
    // silently turns the second create into an UPDATE of the first (data loss).
    // A random suffix makes that astronomically unlikely. No code parses the
    // timestamp back out of a doc id, so the format change is safe.
    _newId(prefix) {
        const rand = (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).slice(0, 8);
        return `${prefix}${Date.now()}_${rand}`;
    },

    // ---------------------------------------------------------------
    // Internal write path. All mutating DAL methods funnel here.
    //
    // Atomically:
    //   1. Read current row to compute ifVersion + new optimistic version.
    //   2. Upsert documents row (version bumped, body replaced, pending++).
    //   3. Append an outbox entry carrying the full PutDocRequest payload.
    //
    // For a fresh doc, current is undefined → ifVersion omitted, version=1.
    // ---------------------------------------------------------------
    async _putLocal({ doc_id, doc_type, tenant_id, body, deleted }) {
        // Every roady doc is tenant-scoped; a null tenant_id drops the row out
        // of the [doc_type+tenant_id+deleted] compound index — invisible to
        // every _listByType read yet still synced. Fail loud rather than write
        // a ghost row (a mutation with no active band is the actual bug).
        if (tenant_id == null || tenant_id === '') {
            throw new Error(`_putLocal: tenant_id required (doc_type=${doc_type}, doc_id=${doc_id})`);
        }
        // Strip Alpine's reactive Proxy wrapper from `body`. IDB's structured
        // clone refuses non-cloneable host objects; without this, any DAL
        // mutation whose input came from a `<button @click="…">` Alpine
        // handler (gig checklists, equipment lists, band-info) crashes with
        // `DataCloneError: [object Array] could not be cloned`. JSON
        // round-trip is safe — `body` is always serializable application data.
        body = body == null ? body : JSON.parse(JSON.stringify(body));
        const now = Date.now();
        let result;
        await this.db.transaction('rw', this.db.documents, this.db.outbox, async () => {
            const current = await this.db.documents.get(doc_id);
            const ifVersion = current ? current.version : undefined;
            const base = current && !deleted ? current.body : undefined; // ancestor for 3-way merge
            const newVersion = (current?.version || 0) + 1;

            const row = {
                doc_id,
                db_id: this.DB_ID,
                doc_type,
                tenant_id: tenant_id ?? null,
                body,
                version: newVersion,
                updated_at: now,
                updated_by: '', // populated server-side; outbox drain uses authed pubkey
                deleted: deleted ? 1 : 0, // Dexie indexes booleans poorly; persist as 0/1
                pending: (current?.pending || 0) + 1,
            };
            await this.db.documents.put(row);

            // Outbox payload: everything sync.js needs to issue
            // `PUT /:db/:id` (or DELETE for tombstones). Stored verbatim so
            // a hard refresh between enqueue and drain doesn't lose context.
            const entry = {
                op: deleted ? 'delete' : 'put',
                db_id: this.DB_ID,
                doc_id,
                doc_type,
                tenant_id: tenant_id ?? null,
                body,             // also carried on deletes so a soft-delete
                                  // restore through resurrection still works
                ifVersion,        // undefined ⇒ blind first write
                base,             // ancestor body; undefined on blind first writes
                localVersion: newVersion,
                status: 'pending',
                enqueued_at: now,
                attempts: 0,
            };
            await this.db.outbox.add(entry);
            result = row;
        });
        return { ok: true, id: doc_id, version: result.version };
    },

    // ---------------------------------------------------------------
    // Outbox surface — consumed by sync.js (C.10).
    // ---------------------------------------------------------------
    async outboxNext(limit = 20) {
        return await this.db.outbox
            .where('status').equals('pending')
            .limit(limit)
            .toArray();
    },

    async outboxMarkInflight(id) {
        await this.db.outbox.update(id, { status: 'inflight' });
    },

    /**
     * Re-queue entries stranded in 'inflight' by a refresh/tab-kill/suspend
     * between mark-inflight and ack. outboxNext only selects 'pending', so
     * without this the write is applied locally but never sent, and the doc's
     * pending counter never returns to 0. Safe to re-PUT: a duplicate write
     * with the same ifVersion just 409s into the server-wins path.
     */
    async outboxRequeueInflight() {
        return await this.db.outbox
            .where('status').equals('inflight')
            .modify({ status: 'pending' });
    },

    // Flip parked ('failed') entries back to 'pending'. An entry only reaches
    // 'failed' after exhausting retries, and it is the ONLY copy of that
    // mutation, so it is never discarded automatically — recovery is explicit.
    async outboxRetryFailed() {
        const n = await this.db.outbox
            .where('status').equals('failed')
            .modify({ status: 'pending', attempts: 0 });
        return n || 0;
    },

    // Re-queue an entry as a BLIND write (guard removed). Used when the server
    // answers a guarded write with its "no such document" conflict payload
    // (version 0): the guard can never match, so retrying unchanged loops
    // forever, and adopting that empty doc would wipe the local row.
    async outboxRequeueBlind(id) {
        await this.db.transaction('rw', this.db.outbox, async () => {
            const e = await this.db.outbox.get(id);
            if (!e) return;
            delete e.ifVersion;
            delete e.base;
            e.status = 'pending';
            e.attempts = (e.attempts || 0) + 1;
            await this.db.outbox.put(e);
        });
    },

    /**
     * Drop an outbox entry the server permanently rejected (max attempts, 403,
     * or a delete the server reports as already gone) WITHOUT stranding the
     * doc's pending counter. Leaving pending > 0 makes applyServerChange
     * suppress equal-version server broadcasts for that doc forever.
     */
    async outboxDrop(id) {
        await this.db.transaction('rw', this.db.documents, this.db.outbox, async () => {
            const entry = await this.db.outbox.get(id);
            if (!entry) return;
            const row = await this.db.documents.get(entry.doc_id);
            if (row) {
                row.pending = Math.max(0, (row.pending || 1) - 1);
                await this.db.documents.put(row);
            }
            await this.db.outbox.delete(id);
        });
    },

    /**
     * Server accepted the mutation. Replace the optimistic row's version
     * with the server-assigned one and decrement pending.
     */
    async outboxAck(id, { version, updated_at }) {
        await this.db.transaction('rw', this.db.documents, this.db.outbox, async () => {
            const entry = await this.db.outbox.get(id);
            if (!entry) return;
            const row = await this.db.documents.get(entry.doc_id);
            if (row) {
                // Adopt the server version only when it's a real number AND no
                // newer local mutation overtook this entry. A 204 (delete) or an
                // unparseable 200 yields version=undefined — never overwrite the
                // row's version with that: it would blank the LWW guard and turn
                // the next write into a blind PUT that bypasses concurrency.
                if (row.version === entry.localVersion && Number.isFinite(version)) {
                    row.version = version;
                    if (updated_at !== undefined) row.updated_at = updated_at;
                }
                row.pending = Math.max(0, (row.pending || 1) - 1);
                await this.db.documents.put(row);
            }
            await this.db.outbox.delete(id);
        });
    },

    /**
     * 409 from server. `current` is the authoritative wire Document.
     * Default policy: server wins (LWW). Drop the optimistic mutation,
     * replace the local row with the server's, and let sync.js report
     * the conflict for UI surfacing if needed.
     */
    async outboxConflict(id, current) {
        await this.db.transaction('rw', this.db.documents, this.db.outbox, async () => {
            const entry = await this.db.outbox.get(id);
            if (!entry) return;
            const row = {
                doc_id: current.doc_id,
                db_id: current.db_id,
                doc_type: current.doc_type,
                tenant_id: current.tenant_id ?? null,
                body: current.body,
                version: current.version,
                updated_at: current.updated_at,
                updated_by: current.updated_by,
                deleted: current.deleted ? 1 : 0,
                pending: 0,
            };
            await this.db.documents.put(row);
            await this.db.outbox.delete(id);
        });
    },

    /**
     * Defense-in-depth for the tenant-scoped change feed (server #4): the app
     * passes the band ids the user actually belongs to; applyServerChange then
     * refuses to persist a foreign tenant's doc even if an un-upgraded server
     * over-shares. `null`/unset ⇒ no filtering (backward-safe).
     */
    setKnownTenants(ids) {
        this.knownTenantIds = Array.isArray(ids) && ids.length ? new Set(ids) : null;
    },

    /**
     * Apply a server-pushed change (WS `change` or HTTP `/changes` row).
     * No-op if local pending mutations would clobber the incoming version.
     */
    async applyServerChange(change) {
        // Drop foreign-tenant changes (defense-in-depth; see setKnownTenants).
        // Skipping only avoids the local write — the sync cursor still advances,
        // which is correct: we never want another band's docs on disk.
        const _tenant = change.tenant_id ?? change.doc?.tenant_id ?? null;
        if (this.knownTenantIds && _tenant != null && !this.knownTenantIds.has(_tenant)) {
            window.DLog?.push('sync', `apply skip (foreign tenant ${_tenant}) ${change.doc_id}`);
            return;
        }
        const incoming = change.doc; // server inlines on WS broadcasts
        await this.db.transaction('rw', this.db.documents, async () => {
            const row = await this.db.documents.get(change.doc_id);
            if (row && row.pending > 0 && row.version >= change.version) {
                // Local has a fresher (or equal) optimistic mutation pending
                // for this doc. Drop the broadcast — the eventual ack/conflict
                // will reconcile. Log it: a stale pending row that never acks
                // would silently block the server version forever (this is how
                // a doc can go missing while the sync cursor moves on).
                window.DLog?.push('sync', `apply skip (pending) ${change.doc_id} localv=${row.version} inv=${change.version}`);
                return;
            }
            if (change.deleted) {
                // Server tombstone (delete frames carry doc:null). Keep a
                // restorable local tombstone (deleted:1, last-known body)
                // instead of hard-deleting, so the doc still shows in "Recently
                // Deleted" and can be restored — matching the deleting device,
                // and idempotent when the deleting device sees its own delete
                // echoed back (no resurrection).
                if (row) {
                    row.deleted = 1;
                    row.version = change.version;
                    row.pending = 0;
                    if (incoming) {
                        row.body = incoming.body;
                        row.updated_at = incoming.updated_at;
                        row.updated_by = incoming.updated_by;
                    }
                    await this.db.documents.put(row);
                } else if (incoming) {
                    await this.db.documents.put({
                        doc_id: incoming.doc_id,
                        db_id: incoming.db_id,
                        doc_type: incoming.doc_type,
                        tenant_id: incoming.tenant_id ?? null,
                        body: incoming.body,
                        version: incoming.version,
                        updated_at: incoming.updated_at,
                        updated_by: incoming.updated_by,
                        deleted: 1,
                        pending: 0,
                    });
                }
                return;
            }
            if (!incoming) {
                // Invalidation-only row (no include_docs, not a delete). With
                // include_docs=1 now always requested this is rare; drop the
                // local row so the next read re-fetches.
                if (row) {
                    window.DLog?.push('sync', `apply invalidate-delete ${change.doc_id} (no inlined doc)`);
                    await this.db.documents.delete(change.doc_id);
                }
                return;
            }
            await this.db.documents.put({
                doc_id: incoming.doc_id,
                db_id: incoming.db_id,
                doc_type: incoming.doc_type,
                tenant_id: incoming.tenant_id ?? null,
                body: incoming.body,
                version: incoming.version,
                updated_at: incoming.updated_at,
                updated_by: incoming.updated_by,
                deleted: incoming.deleted ? 1 : 0,
                pending: 0,
            });
        });
    },

    // ---------------------------------------------------------------
    // Query helpers.
    // ---------------------------------------------------------------
    async _listByType(doc_type, { deleted = false } = {}) {
        if (!this.currentTenant) return [];
        const tenant = this.currentTenant;
        const flag = deleted ? 1 : 0;
        const rows = await this.db.documents
            .where('[doc_type+tenant_id+deleted]')
            .equals([doc_type, tenant, flag])
            .toArray();
        return rows.map(r => this._toLegacy(r));
    },

    // ---------------------------------------------------------------
    // Equipment
    // ---------------------------------------------------------------
    async getAllEquipment() {
        return await this._listByType('equipment');
    },

    async getDeletedEquipment() {
        const items = await this._listByType('equipment', { deleted: true });
        return items.sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
    },

    async addEquipment(item) {
        const doc_id = this._newId('equipment_');
        const body = {
            name: item.name,
            description: item.description || '',
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'equipment',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateEquipment(equipment) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(equipment);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteEquipment(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'equipment',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    async restoreEquipment(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}) };
        delete body.deletedAt;
        return await this._putLocal({
            doc_id: id,
            doc_type: 'equipment',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: false,
        });
    },

    // ---------------------------------------------------------------
    // Gig Types
    // ---------------------------------------------------------------
    async getAllGigTypes() {
        return await this._listByType('gig_type');
    },

    async getDeletedGigTypes() {
        const items = await this._listByType('gig_type', { deleted: true });
        return items.sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
    },

    async addGigType(type) {
        const doc_id = this._newId('gig_type_');
        const body = {
            name: type.name,
            equipmentIds: type.equipmentIds || [],
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'gig_type',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateGigType(gigType) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(gigType);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteGigType(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'gig_type',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    async restoreGigType(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}) };
        delete body.deletedAt;
        return await this._putLocal({
            doc_id: id,
            doc_type: 'gig_type',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: false,
        });
    },

    // ---------------------------------------------------------------
    // Gigs
    // ---------------------------------------------------------------
    async getAllGigs() {
        const items = await this._listByType('gig');
        return items.sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    async getDeletedGigs() {
        const items = await this._listByType('gig', { deleted: true });
        return items.sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
    },

    async getGig(id) {
        const row = await this.db.documents.get(id);
        if (!row) {
            const err = new Error('not_found');
            err.status = 404;
            throw err;
        }
        return this._toLegacy(row);
    },

    async addGig(gig, gigType) {
        const checklist = [];
        const equipment = gigType.equipment
            || gigType.equipmentIds?.map(id => ({ equipmentId: id, quantity: 1 }))
            || [];
        equipment.forEach(({ equipmentId, quantity }) => {
            for (let i = 1; i <= quantity; i++) {
                checklist.push({ equipmentId, itemNumber: i, checked: false });
            }
        });

        const doc_id = this._newId('gig_');
        const body = {
            name: gig.name,
            gigTypeId: gig.gigTypeId,
            date: gig.date,
            arrivalTime: gig.arrivalTime || '',
            doorsOpenTime: gig.doorsOpenTime || '',
            mapLink: gig.mapLink || '',
            loadoutChecklist: [...checklist],
            loadinChecklist: [...checklist],
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'gig',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateGig(gig) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(gig);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteGig(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'gig',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    async restoreGig(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}) };
        delete body.deletedAt;
        return await this._putLocal({
            doc_id: id,
            doc_type: 'gig',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: false,
        });
    },

    // ---------------------------------------------------------------
    // Band info (per-tenant singleton, id = `band-info_<tenant>`).
    // ---------------------------------------------------------------
    async getBandInfo() {
        return await this.getBandInfoForTenant(this.currentTenant);
    },

    async getBandInfoForTenant(tenantId) {
        if (!tenantId) return null;
        const row = await this.db.documents.get(`band-info_${tenantId}`);
        return row ? this._toLegacy(row) : null;
    },

    async saveBandInfo(bandInfo) {
        const doc_id = `band-info_${this.currentTenant}`;
        const split = this._splitLegacy({
            ...bandInfo,
            _id: doc_id,
            type: 'band-info',
            tenant: this.currentTenant,
        });
        return await this._putLocal({
            doc_id,
            doc_type: 'band-info',
            tenant_id: this.currentTenant,
            body: split.body,
            deleted: false,
        });
    },

    // ---------------------------------------------------------------
    // Band roster — distinct from org-level members.
    // ---------------------------------------------------------------
    async getAllBandMembers() {
        const items = await this._listByType('band_member');
        return items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },

    async addBandMember(member) {
        const doc_id = this._newId('band_member_');
        const body = {
            name: member.name.trim(),
            role: member.role.trim(),
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'band_member',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateBandMember(member) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(member);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteBandMember(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'band_member',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    // ---------------------------------------------------------------
    // Songs (catalog) — reusable library referenced by set lists.
    // ---------------------------------------------------------------
    async getAllSongs() {
        const items = await this._listByType('song');
        return items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    },

    async getDeletedSongs() {
        const items = await this._listByType('song', { deleted: true });
        return items.sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
    },

    async addSong(song) {
        const doc_id = this._newId('song_');
        const body = {
            title: (song.title || '').trim(),
            artist: song.artist || '',
            durationSec: Number(song.durationSec) || 0,
            key: song.key || '',
            bpm: Number(song.bpm) || 0,
            lead: song.lead || '',
            notes: song.notes || '',
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'song',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateSong(song) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(song);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteSong(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'song',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    async restoreSong(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}) };
        delete body.deletedAt;
        return await this._putLocal({
            doc_id: id,
            doc_type: 'song',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: false,
        });
    },

    // ---------------------------------------------------------------
    // Set list templates — ordered, sectioned references to catalog songs.
    // Each item carries a denormalized title/durationSec snapshot so a list
    // still renders after the catalog song is edited or deleted.
    // ---------------------------------------------------------------
    async getAllSetlistTemplates() {
        const items = await this._listByType('setlist_template');
        return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    async getDeletedSetlistTemplates() {
        const items = await this._listByType('setlist_template', { deleted: true });
        return items.sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
    },

    async addSetlistTemplate(tpl) {
        const doc_id = this._newId('setlist_template_');
        const body = {
            name: (tpl.name || '').trim(),
            sections: this._cloneSections(tpl.sections || []),
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'setlist_template',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateSetlistTemplate(tpl) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(tpl);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteSetlistTemplate(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'setlist_template',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    async restoreSetlistTemplate(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}) };
        delete body.deletedAt;
        return await this._putLocal({
            doc_id: id,
            doc_type: 'setlist_template',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: false,
        });
    },

    async duplicateSetlistTemplate(id) {
        const row = await this.db.documents.get(id);
        if (!row) {
            const err = new Error('not_found');
            err.status = 404;
            throw err;
        }
        const src = this._toLegacy(row);
        const songs = await this._songMap();
        const doc_id = this._newId('setlist_template_');
        const body = {
            name: `${src.name || 'Set List'} (copy)`,
            sections: this._cloneSections(src.sections || [], songs),
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'setlist_template',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    // ---------------------------------------------------------------
    // Set list instances — a frozen copy attached 1:1 to a gig.
    // ---------------------------------------------------------------
    async getSetlistForGig(gigId) {
        const items = await this._listByType('setlist');
        return items.find(s => s.gigId === gigId) || null;
    },

    async addSetlistFromTemplate(gigId, templateId) {
        const row = await this.db.documents.get(templateId);
        if (!row) {
            const err = new Error('not_found');
            err.status = 404;
            throw err;
        }
        const tpl = this._toLegacy(row);
        const songs = await this._songMap();
        const doc_id = this._newId('setlist_');
        const body = {
            gigId,
            sourceTemplateId: templateId,
            name: tpl.name || 'Set List',
            sections: this._cloneSections(tpl.sections || [], songs),
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'setlist',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async addBlankSetlist(gigId, name) {
        const doc_id = this._newId('setlist_');
        const body = {
            gigId,
            sourceTemplateId: null,
            name: name || 'Set List',
            sections: [],
            createdAt: new Date().toISOString(),
        };
        return await this._putLocal({
            doc_id,
            doc_type: 'setlist',
            tenant_id: this.currentTenant,
            body,
            deleted: false,
        });
    },

    async updateSetlist(setlist) {
        const { doc_id, doc_type, tenant_id, body } = this._splitLegacy(setlist);
        return await this._putLocal({
            doc_id, doc_type, tenant_id, body, deleted: !!body.deletedAt,
        });
    },

    async deleteSetlist(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}), deletedAt: new Date().toISOString() };
        return await this._putLocal({
            doc_id: id,
            doc_type: 'setlist',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: true,
        });
    },

    async restoreSetlist(id) {
        const row = await this.db.documents.get(id);
        const body = { ...(row?.body || {}) };
        delete body.deletedAt;
        return await this._putLocal({
            doc_id: id,
            doc_type: 'setlist',
            tenant_id: row?.tenant_id ?? this.currentTenant,
            body,
            deleted: false,
        });
    },

    // Build a {songId -> legacy song} lookup over the live catalog.
    async _songMap() {
        const songs = await this._listByType('song');
        const map = {};
        for (const s of songs) map[s._id] = s;
        return map;
    },

    // Deep-clone sections, regenerating section ids and (when a catalog map is
    // supplied) re-snapshotting each item's title/durationSec from the live
    // catalog so a freshly created instance/copy starts correct. Items whose
    // catalog song is gone keep their existing snapshot (orphan tolerance).
    _cloneSections(sections, songs) {
        return (sections || []).map((sec, i) => ({
            id: 'sec_' + Date.now() + '_' + i,
            name: sec.name || `Set ${i + 1}`,
            items: (sec.items || []).map(it => {
                const cat = songs ? songs[it.songId] : null;
                return {
                    songId: it.songId,
                    title: cat ? cat.title : (it.title || ''),
                    durationSec: cat ? (Number(cat.durationSec) || 0) : (Number(it.durationSec) || 0),
                };
            }),
        }));
    },
};

// Open the local-only options DB at load so loadOptions() works before
// auth resolves the remote identity. The scoped data DB is created later
// by app.js via DB.setRemoteIdentity() + DB.init(), once the MyCouch URL
// and user are known — there is no unscoped fallback.
DB._initOptionsDb();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DB;
} else {
    window.DB = DB;
}
