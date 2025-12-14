# Agent Commands

## Issue Tracking (bd)

**bd - Dependency-Aware Issue Tracker**

Issues chained together like beads.

### GETTING STARTED
- `bd init` - Initialize bd in your project
  - Creates .beads/ directory with project-specific database
  - Auto-detects prefix from directory name (e.g., myapp-1, myapp-2)
- `bd init --prefix api` - Initialize with custom prefix
  - Issues will be named: api-1, api-2, ...

### CREATING ISSUES
- `bd create "Fix login bug"`
- `bd create "Add auth" -p 0 -t feature`
- `bd create "Write tests" -d "Unit tests for auth" --assignee alice`

### VIEWING ISSUES
- `bd list` - List all issues
- `bd list --status open` - List by status
- `bd list --priority 0` - List by priority (0-4, 0=highest)
- `bd show bd-1` - Show issue details

### MANAGING DEPENDENCIES
- `bd dep add bd-1 bd-2` - Add dependency (bd-2 blocks bd-1)
- `bd dep tree bd-1` - Visualize dependency tree
- `bd dep cycles` - Detect circular dependencies

### DEPENDENCY TYPES
- `blocks` - Task B must complete before task A
- `related` - Soft connection, doesn't block progress
- `parent-child` - Epic/subtask hierarchical relationship
- `discovered-from` - Auto-created when AI discovers related work

### READY WORK
- `bd ready` - Show issues ready to work on
  - Ready = status is 'open' AND no blocking dependencies
  - Perfect for agents to claim next work!

### UPDATING ISSUES
- `bd update bd-1 --status in_progress`
- `bd update bd-1 --priority 0`
- `bd update bd-1 --assignee bob`

### CLOSING ISSUES
- `bd close bd-1`
- `bd close bd-2 bd-3 --reason "Fixed in PR #42"`

### DATABASE LOCATION
bd automatically discovers your database:
1. `--db /path/to/db.db` flag
2. `$BEADS_DB` environment variable
3. `.beads/*.db` in current directory or ancestors
4. `~/.beads/default.db` as fallback

### AGENT INTEGRATION
bd is designed for AI-supervised workflows:
- Agents create issues when discovering new work
- `bd ready` shows unblocked work ready to claim
- Use `--json` flags for programmatic parsing
- Dependencies prevent agents from duplicating effort

### DATABASE EXTENSION
Applications can extend bd's SQLite database:
- Add your own tables (e.g., myapp_executions)
- Join with issues table for powerful queries
- See database extension docs for integration patterns: https://github.com/steveyegge/beads/blob/main/EXTENDING.md

### GIT WORKFLOW (AUTO-SYNC)
bd automatically keeps git in sync:
- ✓ Export to JSONL after CRUD operations (5s debounce)
- ✓ Import from JSONL when newer than DB (after git pull)`
- ✓ Works seamlessly across machines and team members
- No manual export/import needed!

Disable with: `--no-auto-flush` or `--no-auto-import`

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

## Git Workflow

**Do NOT automatically commit changes.** Always leave git commits for the user to review and perform manually. Changes made during work should be staged and ready but not committed unless explicitly requested.

This ensures:
- User has control over commit history and messages
- Changes can be reviewed before committing
- Prevents accidental commits of incomplete work
