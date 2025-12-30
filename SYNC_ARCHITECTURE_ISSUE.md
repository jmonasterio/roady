# Sync Architecture Issue: Mixing Direct API Calls with PouchDB

## The Problem

Your current band deletion flow violates the "local-first" design pattern from couch-sitter's DESIGN.md. You're mixing two conflicting approaches:

1. **Direct API call** to MyCouch (`DELETE /__tenants/{id}`) - server soft-deletes tenant
2. **Local PouchDB mutations** (setting `deleted: true` and hard-deleting band docs) - local cleanup

This creates inconsistency:
- Server uses `deletedAt` field (ISO string) to mark soft-deleted tenants
- Client uses `deleted: true` field AND hard-deletes band documents
- Sync doesn't know which source of truth to follow

## Current Band Deletion Flow (app.js:1655-1742)

```javascript
async deleteBand() {
    // 1. Call /__tenants/{id} endpoint directly
    const response = await fetch(`${this.options.mycouchBaseUrl}/__tenants/${virtualTenantId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // 2. Mark local tenant copy as deleted
    if (response.ok) {
        const doc = await window.tenantManager.tenantsDb.get(internalId);
        doc.deleted = true;  // ← Uses different field than server (deletedAt)
        await window.tenantManager.tenantsDb.put(doc);
    }
    
    // 3. Hard-delete all band documents from local IndexDB
    const bandDocs = allDocs.filter(doc => doc.tenant === this.currentBandTenantId)
                             .map(doc => ({...doc, _deleted: true}));
    await db.bulkDocs(bandDocs);  // ← Completely removes from local DB
}
```

## What MyCouch Backend Does (tenant_routes.py:165-203)

```python
@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, ...):
    # Soft delete - just sets deletedAt field
    tenant["deletedAt"] = datetime.now(timezone.utc).isoformat()
    await couch_sitter_service._make_request("PUT", tenant_id, json=tenant)
    return {"status": "deleted"}
```

**Key point:** Server performs a soft-delete (preserves document). Client hard-deletes it locally, then tries to sync inconsistent states.

## The Right Approach (Local-First Pattern)

From DESIGN.md line 168-181:

> **Decision:** Store all data locally in IndexedDB first, optionally sync to CouchDB server.
> 
> **Implementation:**
> - PouchDB handles local IndexedDB storage
> - PouchDB `sync()` handles bidirectional replication

**Correct flow should be:**

1. User deletes band in UI
2. Mark local tenant doc as `deletedAt: now` (matches server field)
3. Mark local band docs as `deletedAt: now` (soft-delete, not hard-delete)
4. Save changes to local IndexDB via PouchDB
5. **Stop.** Let PouchDB sync handle sending changes to server
6. Server receives soft-deleted documents and processes them

**Remove:** Direct API calls to `/__tenants` endpoint

## Why This Matters

1. **Consistency**: Local state matches server state during sync
2. **Conflict Resolution**: PouchDB can detect and resolve divergent changes
3. **Offline Support**: Local-first means app works offline, syncs when reconnected
4. **Simplicity**: Single source of truth (PouchDB) instead of mixed local + API calls

## Files Fixed

### ✅ c:\github\roady\js\app.js - deleteBand() (lines 1655-1730)

**Changes made:**
1. ✅ Removed direct `DELETE /__tenants` API call - no more direct HTTP calls
2. ✅ Changed `deleted: true` to `deletedAt: now` to match server field
3. ✅ Changed hard-delete (`_deleted: true`) to soft-delete (`deletedAt: ...`)
4. ✅ Added clear comments about LOCAL-FIRST PATTERN
5. ✅ Let PouchDB sync replicate changes to server automatically

**New flow:**
```
User clicks Delete Band
    ↓
Mark tenant as deletedAt (soft-delete locally)
    ↓
Mark all band documents as deletedAt (soft-delete locally)
    ↓
Update UI (remove from userBands list)
    ↓
PouchDB sync automatically replicates soft-deleted docs to server
    ↓
Server receives changes and processes soft-deletes
```

## Fixed Files

### ✅ c:\github\roady\js\tenant-manager.js
**Line 351-364:** Updated comments to clarify soft-delete behavior
- Document still updated locally even if soft-deleted with `deletedAt` field
- Only hard-deleted documents (with `change.deleted=true`) are removed from local DB

**Line 600:** Removed redundant `!doc.deleted` check
- Now only filters on `!doc.deletedAt` (the standard soft-delete field)

### ✅ c:\github\mycouch\src\couchdb_jwt_proxy\virtual_tables.py

**Line 682-683:** Changed delete_tenant() to use `deletedAt` instead of `deleted`
- Server now uses same field name as client for consistency

**Lines 467-469:** get_tenant() now filters on both `deletedAt` and `deleted` 
- Supports both new format (deletedAt) and legacy format (deleted) during transition

**Lines 487-509:** list_tenants() query updated
- Filters out documents with `deletedAt: {$exists: false}` AND `deleted: {$ne: true}`
- In-memory filter also checks both fields

**Lines 803-813:** get_tenant_changes() query updated
- Same dual filtering for consistency across all list operations

## Testing Checklist

- [ ] Delete band locally
- [ ] Verify IndexDB shows `deletedAt` timestamp (not `deleted: true`)
- [ ] Enable sync → watch PouchDB replicate to server
- [ ] Verify MyCouch couch-sitter DB shows soft-deleted tenant with `deletedAt`
- [ ] Verify roady DB shows soft-deleted gigs/equipment with `deletedAt`
- [ ] Refresh client → verify soft-deleted items don't appear in UI
- [ ] Test offline: delete band → go offline → come back online → verify sync completes
