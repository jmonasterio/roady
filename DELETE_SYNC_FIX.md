# Delete Operations & Sync Issues

## Problem

Deleted items are still showing up because of inconsistent deletion handling across the codebase:

1. **Tenants** (server-managed):
   - Server soft-deletes with `deleted: true`
   - Client polling converts this to soft-delete with `deletedAt` (WRONG)
   - Local PouchDB still has the document
   - When user deletes a band, we remove from memory but not from local DB
   - Result: Deleted bands reappear after refresh

2. **Local data** (gigs, equipment, etc.):
   - Soft-deleted with `deletedAt` 
   - Not removed from local DB
   - This is CORRECT for local-only data
   - Filtering on `!doc.deletedAt` works fine

## Root Causes

### 1. Tenant deletion in client code (app.js)
When user deletes a band, we:
- ✅ Call DELETE /__tenants/{id} (server)
- ✅ Remove from in-memory `userBands`
- ❌ Don't remove from local `tenantsDb`

Result: Document syncs back from server or persists in local DB

### 2. Tenant polling in tenant-manager.js (line 351-354)
When sync detects server deletion:
```javascript
if (change.deleted) {
    // WRONG: Should delete, not soft-delete
    change.doc.deletedAt = new Date().toISOString();
    await this.tenantsDb.put(change.doc);
}
```

Should instead:
```javascript
if (change.deleted) {
    // Remove from local DB entirely
    await this.tenantsDb.remove(change.doc);
}
```

### 3. Server filtering (virtual_tables.py)
Fixed query filters with `{"$ne": True}` ✅

## Solutions Applied

### Client-side (roady/app.js)
✅ When deleting a band, now removes from local `tenantsDb`

### Server-side (mycouch)
✅ Updated queries to use `{"$ne": True}` instead of `{"$exists": False}`

### Still TODO: Tenant polling
⏳ Should change line 351-354 in tenant-manager.js to actually remove deleted documents instead of soft-deleting them

## Sync Architecture

**Data Types:**
- **Server-replicated** (tenants, users): Should be hard-deleted from local when removed on server
- **Local-only** (gigs, equipment): Should be soft-deleted to preserve history

**Current broken behavior:**
- Tenants use soft-delete `deletedAt` like local data
- But they're server-managed, so should use hard-delete

## Fix for polling (tenant-manager.js line 351)

Change from:
```javascript
if (change.deleted) {
    change.doc.deletedAt = new Date().toISOString();
    await this.tenantsDb.put(change.doc);
}
```

To:
```javascript
if (change.deleted) {
    try {
        await this.tenantsDb.remove(change.doc);
        console.log(`🗑️ Removed deleted tenant from local DB: ${change.doc._id}`);
    } catch (e) {
        console.warn(`⚠️ Failed to remove deleted tenant: ${e.message}`);
    }
}
```

This ensures deleted tenants are completely removed from local PouchDB.
