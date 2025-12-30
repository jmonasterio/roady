# Tenant Isolation & Access Control - Summary

## Two Key Constraints Added

### 1️⃣ Tenant Creation Requires Online API Call

**What Changed:**
- ❌ Can't create tenants locally (removed local-first for tenants)
- ✅ Must call `POST /api/tenants` endpoint
- ✅ Returns server-assigned tenant ID
- ✅ Tenant syncs back to client

**Why:**
- Ensures tenant IDs are unique and globally consistent
- Prevents orphaned tenants
- Clear ownership model (server creates, client uses)
- Users must be online to create bands

**Client Code:**
```javascript
async createBand() {
    // Check online
    if (!this.options.mycouchBaseUrl) {
        this.showSnackbar('Must be online to create a band', 'error');
        return;
    }
    
    // Call API, not local DB
    const response = await fetch(`${this.options.mycouchBaseUrl}/api/tenants`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: this.newBandName })
    });
    
    // Use returned tenant ID
    const tenant = await response.json();
    this.currentBandTenantId = tenant._id;
}
```

### 2️⃣ Tenant Field Validation on All App DB Writes

**What Changed:**
- Every document in app DB (roady, roady-staging) must have `tenant` field
- That tenant must belong to the authenticated user
- Server validates on every write (PUT, POST, _bulk_docs)
- Invalid writes rejected with 403 Forbidden

**Why:**
- Prevents users from writing to other users' data
- Server enforces ownership rules
- Catches mistakes early (missing tenant field)
- Clear audit trail of which tenant owns each document

**Server Validation:**
```python
# MyCouch middleware validates:
# 1. Document has 'tenant' field
# 2. User owns that tenant (checked against couch-sitter)
# 3. If invalid → reject with 403

# Example:
PUT /roady-staging/gig_123
{ "type": "gig", "tenant": "tenant_xyz", ... }
User owns: ["tenant_xyz"]
→ ✅ Accepted

PUT /roady-staging/gig_456
{ "type": "gig", "tenant": "tenant_other", ... }
User owns: ["tenant_xyz"]
→ ❌ 403 Forbidden "Cannot write to tenant 'tenant_other'"
```

**Client Code:**
```javascript
// Every document MUST include tenant field
async addGig(gig, gigType) {
    const doc = {
        _id: 'gig_' + Date.now(),
        type: 'gig',
        tenant: this.currentTenant,  // ← REQUIRED
        name: gig.name,
        // ... other fields
    };
    return await this.db.put(doc);
}
```

## Files Modified/Created

| File | Change | Impact |
|------|--------|--------|
| `js/app.js` | createBand() now uses API | Users must be online to create bands |
| `js/db.js` | All docs include tenant field | Compiler-level check (required) |
| `tenant_access_middleware.py` | New middleware | Validates tenant access |
| `DESIGN.md` | Document constraints | Clear rules for future developers |

## Testing Checklist

- [ ] Create band offline → shows "Must be online" error
- [ ] Create band online → API returns tenant ID
- [ ] Create gig → document has `tenant` field
- [ ] Sync gig → server accepts (tenant is valid)
- [ ] Try to write to other user's tenant → 403 Forbidden
- [ ] Bulk docs → all must have valid tenant
- [ ] band-info doc → tenant derived from _id (special case)

## Benefits

✅ **Security**: Users cannot access other users' data  
✅ **Consistency**: No orphaned tenants or invalid relationships  
✅ **Simplicity**: Clear ownership model (server owns IDs)  
✅ **Audit Trail**: Every document has tenant ownership  
✅ **Offline Support**: Still works offline (uses sync for reads, API for creates)  

## Tradeoffs

⚠️ **Can't create tenants offline** (must be online)  
⚠️ **More validation** (every write checked)  
⚠️ **Additional API call** for tenant creation  

But these are acceptable tradeoffs for security and consistency.

## Related Documents

- `TENANT_ISOLATION_PRD.md` - Full requirements and design
- `TENANT_ISOLATION_IMPLEMENTATION.md` - Detailed implementation steps
- `SYNC_ARCHITECTURE_ISSUE.md` - Why local-first for app data works, but not tenants

## Questions to Consider

1. **Should we cache tenant list?** Yes - middleware already does (5 min cache)
2. **What about bulk operations?** Middleware validates all docs in bulk
3. **Can users create multiple bands?** Yes - just call API multiple times
4. **Can bands have multiple owners?** Yes - future: support userIds array
5. **What if sync fails?** Document stays local, sync retries automatically
