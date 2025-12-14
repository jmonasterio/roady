# PouchDB Migration Plan

**Goal**: Use PouchDB as source of truth for all tenant/user data. Stop HTTP fetching. Listen to _changes feed for auto-updates.

## Phase 1: User Document in PouchDB

### Current State
- User doc stored in CouchDB (couch-sitter database)
- Active tenant read from JWT claim
- Updated via `PUT /__users/<hash>` virtual endpoint

### Target State
- User doc replicated to local PouchDB
- Read active_tenant_id from local user doc
- JWT claim is just a convenience (refreshed separately)

### Changes Needed

**1. Add user doc replication (tenant-manager.js)**
```
- Create or open a "users" database in PouchDB
- Sync with remote: db.sync('http://localhost:5985/couch-sitter', { live: true })
- Note: need to handle CouchDB _design docs and filtering
```

**2. Load user on init (tenant-manager.js → initializeTenantContext)**
```
- Get local user doc from PouchDB
- Extract active_tenant_id from it (or use first tenant if missing)
```

**3. Update active tenant (tenant-manager.js → setActiveTenant)**
```
- Instead of: PUT /__users/<hash> endpoint
- Do: Update local user doc in PouchDB
- PouchDB syncs to server automatically
- Optionally refresh JWT after (but not critical)
```

## Phase 2: Tenant List in PouchDB

### Current State
- Tenants fetched via HTTP `GET /__tenants`
- Cached in `tenantManager.tenantList`
- Also in `app.js` as `userBands`
- Multiple sync points causing bugs

### Target State
- Tenants replicated to local PouchDB
- Single cache: `tenantManager.tenantList`
- Auto-update via _changes listener
- No HTTP fetching

### Changes Needed

**1. Add tenant doc replication (tenant-manager.js)**
```
- Open "roady" database (already exists for equipment)
- Listen to _changes for documents where type === "tenant"
- Filter to only tenants where user is in userIds
```

**2. Load tenants on init**
```
- Query local PouchDB for tenant docs
- No HTTP call needed
```

**3. Listen to changes (tenant-manager.js)**
```
db.changes({ since: 'now', live: true })
  .on('change', (change) => {
    if (change.doc.type === 'tenant') {
      // Update tenantList
      this.tenantList = await this.queryTenantsFromPouchDB()
      // Notify app.js to update userBands
    }
  })
```

**4. Update app.js userBands**
```
- Instead of separate userBands, sync from tenantManager.tenantList
- Or pass tenantManager.tenantList as the source
- Remove manual list syncing
```

## Phase 3: Create/Delete Tenant

### Current State
- Create: POST /__tenants → response has _id → manually add to userBands
- Delete: DELETE /__tenants/<id> → manually remove from userBands

### Target State
- Create: POST /__tenants → PouchDB auto-syncs → _changes listener updates
- Delete: DELETE /__tenants/<id> → PouchDB auto-syncs → _changes listener updates
- No manual list manipulation

### Changes Needed

**1. Create tenant (app.js)**
```
- POST /__tenants (already done)
- Remove manual this.userBands.push()
- Remove manual tenantManager.tenantList.push()
- Let _changes listener handle it (takes ~500ms)
- Or: add to both lists optimistically, _changes confirms
```

**2. Delete tenant (app.js)**
```
- DELETE /__tenants/<id> (already done)
- Remove manual this.userBands.filter()
- Let _changes listener handle it
- Or: remove optimistically, _changes confirms deletion
```

## Phase 4: Switch Band

### Current State
- switchBand → switchTenant → setActiveTenant
- setActiveTenant does: PUT /__users/<hash> + JWT refresh
- Multiple failure points

### Target State
- switchBand → update local user doc in PouchDB
- PouchDB syncs to server
- JWT updates automatically on next refresh (or don't care, read from local doc)

### Changes Needed

**1. tenant-manager.js → setActiveTenant**
```
- Change from: fetch(PUT /__users/<hash>)
- Change to: update local user doc in PouchDB
- Remove JWT refresh (optional - can keep for CLI apps)
```

**2. app.js → switchBand**
```
- Already calls tenantManager.switchTenant()
- Should just work once setActiveTenant updated
```

## Phase 5: Cleanup

### Remove
- `tenantManager.tenantList` HTTP fetching
- `window.tenantManager.getMyTenants()` HTTP call
- `app.js` separate `userBands` array (or use as alias to tenantManager)
- Duplicate band lists
- Manual sync code

### Keep
- `tenantManager.tenantList` (now PouchDB-backed)
- `DB.js` band-info access (already uses PouchDB)
- Equipment _changes listener (already correct)

## Implementation Order

1. **Step 1**: Add user doc replication + load from PouchDB
2. **Step 2**: Add tenant doc replication + load from PouchDB
3. **Step 3**: Update setActiveTenant to write to PouchDB
4. **Step 4**: Add _changes listener for tenants
5. **Step 5**: Update create/delete to rely on _changes
6. **Step 6**: Remove HTTP getMyTenants() call
7. **Step 7**: Test and cleanup

## Testing Checklist

- [ ] Load app → tenants show without HTTP calls
- [ ] Switch band → active_tenant_id in local user doc
- [ ] Refresh page → active band remembered (from JWT + local doc)
- [ ] Create band → shows in list after ~500ms
- [ ] Delete band → removed from list after ~500ms
- [ ] Multiple tabs → both show same data via _changes sync
- [ ] Offline → create band locally, syncs when online

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| PouchDB replication lag | Show "syncing..." indicator, accept ~500ms delay |
| Offline creates | Queue changes locally, sync when online (PouchDB handles) |
| Stale data in JWT | Don't rely on JWT, read from local doc. Refresh JWT periodically. |
| Broken _changes listener | Add error handler, fallback to HTTP fetch |
| Double sync (local + HTTP) | Remove HTTP completely, trust PouchDB |
