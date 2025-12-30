# Local-First Sync Architecture Fix

## Problem Summary

Roady's band deletion was violating the **local-first sync pattern** from couch-sitter's DESIGN.md:

1. **Client** called direct API endpoint `DELETE /__tenants/{id}` (server sync bypass)
2. **Client** then tried to mark local copy as deleted to avoid conflicts
3. **Server** used different field name (`deleted`) vs client (`deletedAt`)
4. **Filter logic** inconsistently checked both `deleted` and `deletedAt` fields

This created sync conflicts and data inconsistency.

## Solution: Pure Local-First Pattern

**Design principle:** User acts → local IndexDB updated → PouchDB sync replicates to server

### Changes Made

#### 1. Client (Roady)

**File:** `c:/github/roady/js/app.js` (deleteBand function, lines 1655-1730)

**Before:**
```javascript
// Direct API call
const response = await fetch(`${this.options.mycouchBaseUrl}/__tenants/${virtualTenantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
});

// If successful, mark local as deleted (inconsistent field name)
doc.deleted = true;

// Hard-delete all band docs
const bandDocs = allDocs.filter(...).map(doc => ({...doc, _deleted: true}));
```

**After:**
```javascript
// No direct API call - just local changes
// Soft-delete tenant with consistent field name
doc.deletedAt = now;

// Soft-delete all band docs with consistent field name
const bandDocs = allDocs.filter(...).map(doc => ({...doc, deletedAt: now}));

// PouchDB sync handles replication to server automatically
```

**File:** `c:/github/roady/js/tenant-manager.js` (lines 351-364, 600)

- Clarified polling comments: soft-deleted documents are updated locally, not removed
- Removed redundant `!doc.deleted` filter check
- Now only filters on `!doc.deletedAt`

#### 2. Server (MyCouch)

**File:** `c:/github/mycouch/src/couchdb_jwt_proxy/virtual_tables.py`

**Changed delete_tenant() (lines 682-683):**
- From: `current_doc["deleted"] = True`
- To: `current_doc["deletedAt"] = datetime.utcnow().isoformat() + "Z"`

**Updated filters (multiple locations):**
- `get_tenant()` (line 468): Checks both `deletedAt` and `deleted` for compatibility
- `list_tenants()` (lines 492-509): Filters on both fields in query and in-memory
- `get_tenant_changes()` (lines 803-813): Same dual filtering for consistency

## Consistency Model

Now all three systems use same field name:

| Component | Field Name | Value Type | Meaning |
|-----------|-----------|-----------|---------|
| Client (IndexDB) | `deletedAt` | ISO timestamp | Soft-deleted |
| Server (couch-sitter) | `deletedAt` | ISO timestamp | Soft-deleted |
| Server (roady/app DB) | `deletedAt` | ISO timestamp | Soft-deleted |

## Data Flow

```
User clicks "Delete Band"
        ↓
Client marks local tenant as deletedAt
        ↓
Client marks all band gigs/equipment as deletedAt
        ↓
Client updates UI (removes from list)
        ↓
PouchDB sync detects changes
        ↓
PouchDB replicates to MyCouch
        ↓
Server sees deletedAt field
        ↓
Server filters soft-deleted items from API responses
        ↓
Offline? Changes stay local until sync reconnects ✓
```

## Benefits

1. **Consistency**: Client and server use same field names
2. **Simplicity**: No direct API calls, single source of truth (PouchDB)
3. **Offline Support**: Works without network, syncs when reconnected
4. **Conflict Resolution**: PouchDB handles divergent changes automatically
5. **Audit Trail**: `deletedAt` timestamp shows when item was deleted

## Files Modified

- ✅ `c:/github/roady/js/app.js` - deleteBand() 
- ✅ `c:/github/roady/js/tenant-manager.js` - polling & filtering
- ✅ `c:/github/mycouch/src/couchdb_jwt_proxy/virtual_tables.py` - server filtering

## Testing Recommendations

1. Delete a band locally (no network)
2. Verify IndexDB has `deletedAt` field
3. Go online → watch sync complete
4. Verify server DB has `deletedAt` in tenant document
5. Refresh page → soft-deleted band should not appear
6. Check that other devices see the deleted band after sync
