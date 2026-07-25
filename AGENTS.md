# Agent Commands

## Visual Design — "THE ROAD CASE"

roady wears a Tom Sachs / Van Neistat **Workshop Web** skin: a **dark
flight-case** theme (stage-black surfaces, aluminum edging, mixing-console
accents), phone-first, press-not-hover. **Read before restyling `index.html` /
`css/styles.css`:**
- **[docs/design-spine.md](docs/design-spine.md)** — the LOCKED token contract:
  palette/hexes, type, vocabulary map, component inventory, status stamps.
- **[visual-design.md](visual-design.md)** — the full LOOK guide: component
  specs, CSS snippets, wireframes.
- **[VISUAL_DESIGN_PLAN.md](VISUAL_DESIGN_PLAN.md)** — rationale + phased plan.

The system lives in the `FLIGHT-CASE DESIGN SYSTEM` block appended to
`css/styles.css` (Pico-variable overrides + component layer). Invariants: DARK
only on screen (white `--setlist-paper` is `@media print` only), `--cue-green`
is the one primary accent, no hover-dependent affordances, band-scale plain
nouns. Bump the `?v=` cache-buster on every asset in `index.html` after any
JS/CSS change.

## Project Scale

**There are very few users** (roughly a handful, all early adopters). Optimize
accordingly:
- **Favor clean cutovers over backward-compat shims.** Breaking a data shape or
  route is cheap — there's little production data and few sessions to migrate.
  Don't build migration scaffolding, dual-read fallbacks, or deprecation
  windows unless explicitly asked.
- **A stale-cache or bad deploy affects almost no one.** Ship fixes directly;
  no elaborate staged rollouts.
- **Still deploy deliberately** — few users is not zero users. Verify before
  yielding, and never destroy the little real data that exists without asking.

## Alpine.js + PouchDB Architecture

**Key Principle**: Alpine.js state is for UI reactivity, not persistence. PouchDB is the durable store.

### Data Flow Pattern
```
PouchDB (durable) → Alpine state (reactive UI) → back to PouchDB (persist)
```

1. **Load**: Fetch data from PouchDB into Alpine.data properties
   ```js
   async loadBands() {
     this.userBands = await tenantManager.getMyTenants();
     // PouchDB → Alpine state
   }
   ```

2. **Mutate**: UI changes modify Alpine state in memory
   ```js
   async switchBand(bandId) {
     this.currentBandTenantId = bandId;  // Alpine state update
     // Reactive, instant UI feedback
   }
   ```

3. **Persist**: Write changes back to PouchDB
   ```js
   async switchBand(bandId) {
     this.currentBandTenantId = bandId;
     await tenantManager.setActiveTenant(bandId);  // Write to PouchDB
   }
   ```

4. **Keep in sync** (Phase 3+):
   - Option A: Reload from PouchDB on changes: `this.userBands = await tenantManager.getMyTenants()`
   - Option B: Manually update Alpine state to match PouchDB (more efficient)

### Anti-Pattern to Avoid
❌ **Do NOT**: Have Alpine state as source of truth for persistent data
```js
// BAD - Alpine state is ephemeral
this.userBands = [...];  // Lost on page refresh or tab close
```

✅ **DO**: PouchDB is source of truth, Alpine is cached view
```js
// GOOD - PouchDB survives refresh
const bands = await pouchdb.query(...);  // Source of truth
this.userBands = bands;                  // Cached in Alpine for reactivity
```

### Example: Correct Create + Optimistic Pattern
```js
async createBand() {
  // Write to server first
  const response = await fetch('/__tenants', { method: 'POST' });
  const newBand = await response.json();
  
  // Optimistic Alpine update (instant UI feedback)
  this.userBands.push(newBand);
  
  // Then reload from PouchDB (Phase 2)
  // This syncs the new band to local storage
  this.loadBands();  // Will call getMyTenants() → read from PouchDB
}
```

This pattern:
1. Writes to server (persistence)
2. Updates Alpine immediately (UI responsiveness)
3. Reloads from PouchDB (cache sync)
4. All three sources eventually consistent

## PouchDB Migration Patterns (Phase 1+)

### Database Naming Convention
- `'users'` - User documents with auth data (Phase 1). Syncs with couch-sitter.
- `'roady'` - Business data: equipment, gigs, band-info, tenants (Phase 2+)
- `'roady_options'` - Local-only preferences, never synced

### Source of Truth Hierarchy
Priority order for reading data:
1. Local PouchDB document (fastest, available offline)
2. JWT claim (fallback if local not available)
3. HTTP endpoint (last resort, full round-trip)

Use getter methods with fallback logic (e.g., `getActiveTenantIdFromLocalDoc()`):
```js
getActiveTenantIdFromLocalDoc() {
  if (this.localUserDoc?.active_tenant_id) return this.localUserDoc.active_tenant_id;
  return this.extractActiveTenantIdFromJWT(jwt); // fallback
}
```

### Document ID Conventions
- User docs: `user_<sha256_hash>` (hash of Clerk sub)
- Tenant docs: `tenant_<uuid>` (internal) / UUID only in API (virtual)
- Equipment: `equipment_<timestamp>`
- Gigs: `gig_<timestamp>`
- Band info: `band-info_<tenantId>`
- Gig types: `gig_type_<timestamp>`

### Replication Setup Pattern (via MyCouch proxy)
**Always use MyCouch (port 5985), never direct CouchDB (port 5984)**
```js
async initializePouchDBReplication() {
  this.usersDb = new PouchDB('users');
  const jwt = await this.getClerkToken();
  
  // Fetch initial user doc via MyCouch virtual endpoint
  const response = await fetch(`http://localhost:5985/__users/${this.userHash}`, {
    headers: { 'Authorization': `Bearer ${jwt}` }
  });
  const userDoc = await response.json();
  userDoc._id = `user_${this.userHash}`;
  await this.usersDb.put(userDoc);
  
  // TODO Phase 3: Add polling of /__users/_changes endpoint for updates
  // Don't use native PouchDB.sync() - frontend must go through auth proxy
}
```

### Optimistic Updates Pattern
Update local first, then backend (enables offline-first in Phase 4):
```js
async setActiveTenant(tenantId) {
  // Update local (optimistic)
  if (this.localUserDoc) {
    this.localUserDoc.active_tenant_id = tenantId;
    await this.usersDb.put(this.localUserDoc);
  }
  // Then HTTP (will sync back automatically)
  await fetch(`/__users/${userId}`, { method: 'PUT', body: {...} });
}
```

### Error Handling for DB Operations
```js
async loadLocalUserDoc() {
  try {
    this.localUserDoc = await this.usersDb.get(`user_${this.currentUserHash}`);
  } catch (error) {
    if (error.status === 404) {
      console.warn('Doc not found, will sync later'); // Expected, not an error
      return null;
    }
    throw error; // Real error
  }
}
```

### Handling PouchDB Conflicts (409)
Conflicts occur when `_rev` is stale (document updated elsewhere).

**Pattern**: Fetch current `_rev`, retry
```js
// Always fetch latest _rev before put
let existingRev = null;
try {
  const existing = await db.get(docId);
  existingRev = existing._rev;
} catch (e) {
  if (e.status !== 404) throw e;  // 404 is expected for new docs
}

// Prepare document with current _rev
const doc = { _id: docId, ...data };
if (existingRev) {
  doc._rev = existingRev;
}

// Try to store with retry on conflict
let retries = 0;
while (retries < 3) {
  try {
    await db.put(doc);
    break;  // Success
  } catch (error) {
    if (error.status === 409 && retries < 2) {
      // Conflict - refresh _rev and retry
      const fresh = await db.get(docId);
      doc._rev = fresh._rev;
      retries++;
    } else {
      throw error;
    }
  }
}
```

**Why sequential not parallel**: When storing many docs, process sequentially to avoid cascading conflicts. Parallel requests can trigger race conditions on the same document.

### Graceful Degradation
Always allow fallback if PouchDB unavailable:
```js
try {
  await this.initializePouchDBReplication();
} catch (error) {
  console.warn('PouchDB init failed, using HTTP fallback:', error);
  // Continue with HTTP-only mode - don't break the app
}
```

### Phase 3: Changes Polling Pattern
Subscribe to real-time updates via polling:
```js
// In app.js init():
tenantManager.onChanges(() => {
  console.log('Data changed, reloading...');
  this.loadBands();  // Reload from local PouchDB
});

// Backend polls periodically:
// GET /__users/_changes?since=123&include_docs=true
// GET /__tenants/_changes?since=456&include_docs=true

// When changes arrive:
// 1. Update local PouchDB documents
// 2. Notify all registered callbacks
// 3. App reloads from cache (no network needed)
```

**Polling configuration**:
```js
// Default 5 seconds, configurable
await tenantManager.startUserChangesPolling(10000);  // 10s poll
await tenantManager.startTenantChangesPolling(10000); // 10s poll
```

**Sequence tracking** (automatic):
```
Each poll: since={lastSeq}
Server returns: results + new seq
Next poll uses: new seq
→ Only fetches new changes, very efficient
```

## Known Issues & Warnings

### Tenant Loading Timeout (tenant-manager.js:116)
- **Issue**: Sometimes see "signal is aborted without reason" during page refresh
- **Cause**: 2-second timeout on `/__tenants` endpoint call may be too short for slow networks
- **Expected**: Error is caught and app continues with cached bands from localStorage
- **Not Critical**: App gracefully falls back to last selected band and continues
- **If Problematic**: Increase timeout in tenant-manager.js line 116 from 2000ms to 10000ms

### Band Loading
- Uses `_id` property (not `tenantId`) for all band object lookups
- All band-info documents use `tenant` field for isolation
- Parallel Promise.all() loading means all bands load simultaneously
- Fallback to server name if band-info document missing

### PouchDB Sync Filters
- Filters like `user_filter` must exist as design docs in CouchDB
- If filter doesn't exist, sync may silently fail or retry
- **TODO**: Create `_design/filters` doc in couch-sitter with user_filter, tenant_filter, etc.

## Nostr Signers (per login, not strictly per platform)

**Auth is MNA1: every request (and the WS handshake) is individually signed.
The signer is whatever you logged in WITH — which usually (but not always)
tracks the platform:**

- **NIP-07 browser extension (Alby)** — desktop default. Signs **locally and
  instantly**, no relays. Reliable. Only NIP-07.
- **NIP-46 remote signer (Amber)** — Android default, **and any device that
  logs in via the QR / "Nostr Connect" flow, including desktop.** Each
  signature is a round-trip over Nostr relays (`relay.nsec.app`,
  `relay.damus.io`, `nos.lol`): roady publishes a `sign_event` request and the
  signer app must be running and connected to answer. This is the **fragile**
  path regardless of platform.

So a desktop is NOT guaranteed to be on Alby: if it was paired by scanning the
QR with Amber, that desktop signs over relays (NIP-46) just like the phone, and
the saved session persists across reloads until you sign out.

### Reading the debug log (sync panel → Logs)
- `[nip46] sign_event published to N/3 relays` → this session is using the
  **remote signer (Amber)**, not the extension. NIP-07 (Alby) never logs
  `[nip46]` and never touches relays.
- `Signer did not respond to sign_event … (60000ms)` **while** `published
  3/3` → the request reached the relays but **Amber didn't answer**: Amber
  is closed/killed, lost the NIP-46 session, or isn't on those relays. Not a
  roady bug — open Amber / re-pair / approve. When Amber is healthy it
  answers in well under a second.

### Gotchas learned the hard way
- A desktop that "uses Alby" can still restore an **old saved Amber/NIP-46
  session** for the same key and sign over relays. `restoreSession` prefers
  a present NIP-07 extension holding the **same pubkey**; if it's still doing
  `[nip46]`, the extension is absent or holds a **different** key — sign out
  and reconnect with Alby.
- The signer is the usual root cause of "not syncing" / "stuck on Loading".
  roady degrades: successful band lists are cached in `localStorage`
  (`roady_tenants_<hash>`) and rendered offline when signing fails, so the
  app stays read-only-usable. Writes still need a live signer.
- The **durable fix** for a flaky device is a **local key** (or an
  extension holding the same key on desktop) so signing never leaves the
  machine. Remote signing over relays will always be the weak link.

## API Architecture: Virtual Tables vs Backend APIs

**Critical Rule**: API type is determined by **consistency requirement**, not data type.

### Virtual Tables (`/__users/*`, `/__tenants/*`) - Offline-First
**Use when:** Operation can work offline (changes sync later, eventual consistency acceptable)

**Operations:**
- List bands: `GET /__tenants`
- Load bands from cache: `getMyTenants()` (reads local PouchDB)
- Switch band: `PUT /__users/{id}` (update active_tenant_id, async sync)
- Delete band: Soft-delete with `deletedAt` field (PouchDB syncs)

**Pattern:** User action → Write local PouchDB → Sync background → Consistent

### Backend APIs (`/api/...`) - Online-Only
**Use when:** Operation requires **immediate server response** (access control, tokens, time-sensitive)

**Operations:**
- Create band: `POST /api/tenants` ⚠️ **CRITICAL: Must register in couch-sitter with applicationId**
- Create invitation: `POST /api/tenants/{id}/invitations`
- Accept invitation: `PATCH /api/invitations/accept`
- Remove member: `DELETE /api/tenants/{id}/members/{user_id}`

**Pattern:** User action → Validate server → Grant permission → Immediate result

### Tenant ID Format: No Silent Conversions

**CRITICAL RULE: The caller is responsible for sending the correct format. Backend MUST reject invalid formats.**

- **Internal format**: `tenant_{uuid}` (stored in CouchDB `_id` field)
- **Virtual format**: UUID only, no prefix (used in API responses to frontend)

**Frontend responsibility when calling `/api/...` endpoints:**
- ✅ Must prepend `tenant_` prefix before sending to backend
- ❌ Do NOT send virtual format to `/api/` endpoints
- Example: If `currentBandTenantId = "15a46b2e..."`, send `tenant_15a46b2e...` to API

**Backend responsibility in MyCouch:**
- ✅ MUST validate format with `validate_tenant_id_format(tenant_id)`
- ✅ MUST reject with 400 if format is wrong
- ❌ Do NOT silently convert or strip prefixes
- ❌ Do NOT guess the caller's intent

**Why:** Fail-fast error detection. Silent conversions hide bugs and make debugging harder. Explicit validation ensures both sides agree on the format.

### Decision Tree

```
Does this operation need IMMEDIATE server response?
├─ NO (can wait for sync) → Use VIRTUAL TABLE
│   Examples: Create/delete band, switch band, load bands
│   
└─ YES (need answer now) → Use BACKEND API
    ├─ Affects permissions? → BACKEND API (🔴 critical)
    │   Examples: Invite, remove member, accept invitation
    ├─ Time-sensitive? → BACKEND API (🔴 tokens expire)
    │   Examples: Create/accept invitation
    └─ Needs atomic transaction? → BACKEND API (🔴 no sync lag)
        Examples: Token validation, membership check
```

### Key Insight: Band Creation

**Band creation is a BACKEND API operation, NOT virtual table:**
- ✅ Creates tenant in `couch-sitter` database (not roady)
- ✅ Sets `applicationId: "roady"` for cascade deletion
- ✅ Ensures proper ownership and user registration
- ✅ Enables clean deletion via `DELETE /__tenants`

**Wrong:** `POST /__tenants` (creates orphaned tenant, cannot delete)
**Correct:** `POST /api/tenants` (registers in couch-sitter with metadata)

See `BAND_CREATION_FIX.md` for details.

### Offline Implications

**Operations that work offline:**
- ✅ Create/delete/switch bands (local first, sync background)
- ✅ Manage equipment & gigs (local PouchDB)
- ✅ Load cached data

**Operations that require internet:**
- ❌ Create band (needs backend registration)
- ❌ Create invitation (needs secure token generation)
- ❌ Accept invitation (needs token validation)
- ❌ Remove member (needs access control check)

This is acceptable - member management is online-only per design.

## Git Workflow

**Do NOT automatically commit changes.** Always leave git commits for the user to review and perform manually. Changes made during work should be staged and ready but not committed unless explicitly requested.

This ensures:
- User has control over commit history and messages
- Changes can be reviewed before committing
- Prevents accidental commits of incomplete work
