# Tenant Isolation & Access Control

## The Two Constraints

This system enforces two critical constraints to prevent data leaks and maintain consistency:

### Constraint #1: Tenants Created via API Only ✅ ONLINE REQUIRED

```
┌─────────────────────┐
│ User wants to      │
│ create a band      │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ Internet?    │◄──── NO ──► "Go online to create a band"
    └──────┬───────┘
           │ YES
           ▼
    ┌─────────────────────────────┐
    │ POST /api/tenants           │
    │ {"name": "Blue Notes"}      │
    └──────────┬──────────────────┘
           ╎
    Server validates:
    ╎ • User authenticated (JWT)
    ╎ • User not already in same band
    ╎ • Generate unique tenant ID
    ╎
           ▼
    ┌──────────────────────────────┐
    │ {"_id": "tenant_xyz", ...}   │
    │ Stored in couch-sitter       │
    │ Syncs to client roady-staging│
    └──────────────────────────────┘
```

**Why?**
- Server controls tenant IDs → no conflicts
- Users must have internet → consistent state
- Clear ownership (server created it)
- Prevents orphaned local-only tenants

### Constraint #2: All App DB Documents Owned by User's Tenant ✅ SERVER VALIDATED

```
┌──────────────────────────┐
│ Create gig locally       │
│ with tenant: "tenant_xyz"│
└──────────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ PouchDB syncs to     │
    │ PUT /roady-staging   │
    └──────────┬───────────┘
           │
    MyCouch Middleware:
    ├─ Extract JWT
    ├─ Query: What tenants does user own?
    │  → ["tenant_xyz"]
    ├─ Check: Document has tenant field?
    │  → YES: "tenant_xyz" ✅
    ├─ Check: User owns that tenant?
    │  → "tenant_xyz" in ["tenant_xyz"]? ✅
    │
           ▼
    ┌──────────────────────┐
    │ ✅ Accepted          │
    │ Gig saved to server  │
    └──────────────────────┘
```

**Invalid scenarios (all rejected):**

```javascript
// ❌ Missing tenant field
{ _id: "gig_123", type: "gig", name: "..." }
// Error: Document missing required 'tenant' field

// ❌ Wrong tenant
{ _id: "gig_123", type: "gig", tenant: "tenant_evil", ... }
// User owns: ["tenant_xyz"]
// Error: Cannot write to tenant 'tenant_evil'

// ❌ Trying to update document from another user
{ _id: "eq_456", type: "equipment", tenant: "tenant_admin", ... }
// Error: Cannot write to tenant 'tenant_admin'
```

**Why?**
- Server enforces data isolation
- Users can't accidentally (or intentionally) access other tenants
- Catches bugs early (missing tenant field)
- Audit trail (every doc has owner tenant)

## Architecture

```
Client (Roady)
├── Local IndexDB: gigs, equipment (has tenant field)
│   └── Sync to server via PouchDB
└── Tenants loaded from sync (read-only in client)

↓

MyCouch Proxy
├── Validation Middleware (intercepts writes)
│   ├── Check: User authenticated?
│   ├── Check: Document has tenant field?
│   └── Check: User owns that tenant?
└── Document Router
    ├── Type=gig → roady-staging
    ├── Type=equipment → roady-staging
    └── Type=tenant → couch-sitter

↓

Server Databases
├── couch-sitter: users, tenants (source of truth)
└── roady-staging: gigs, equipment (app data)
```

## For Developers

### Creating a Tenant (Band)

```javascript
// ✅ DO THIS - Use API
async createBand(bandName) {
    const response = await fetch(
        `${baseUrl}/api/tenants`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: bandName })
        }
    );
    const tenant = await response.json();
    return tenant._id;  // Use this as currentTenantId
}

// ❌ DON'T DO THIS - Local-first doesn't work for tenants
// Can't do: await DB.createTenant(name)
// Can't do: localStorage.setItem('tenantId', uuid())
```

### Creating App Data (Gigs, Equipment)

```javascript
// ✅ DO THIS - Local-first works for app data
async addGig(gigData) {
    const doc = {
        _id: 'gig_' + Date.now(),
        type: 'gig',
        tenant: this.currentTenant,  // ← MUST INCLUDE
        name: gigData.name,
        date: gigData.date,
        // ... other fields
    };
    return await DB.getDb().put(doc);
    // PouchDB syncs automatically → server validates
}

// Every document type must include tenant:
async addEquipment(itemData) {
    return await DB.getDb().put({
        _id: 'equipment_' + Date.now(),
        type: 'equipment',
        tenant: this.currentTenant,  // ← REQUIRED
        name: itemData.name,
        // ...
    });
}

async addGigType(typeData) {
    return await DB.getDb().put({
        _id: 'gig_type_' + Date.now(),
        type: 'gig_type',
        tenant: this.currentTenant,  // ← REQUIRED
        name: typeData.name,
        // ...
    });
}
```

### Checking Access

```javascript
// User has multiple bands (tenants)
const userBands = await TenantManager.getTenants();
// Returns: ["tenant_xyz", "tenant_abc"]

// Current band context
const currentTenant = this.currentTenantId;
// Use this when creating documents

// Switch bands
async switchBand(bandId) {
    this.currentTenantId = bandId;
    DB.setTenant(bandId);
    // All new documents will be created with this tenant
}
```

## Error Handling

### Client Errors

```javascript
// User tries to create band but offline
createBand() {
    if (!this.options.mycouchBaseUrl) {
        showSnackbar('Must be online to create a band', 'error');
        return;
    }
}

// Creation fails
try {
    const tenant = await createBand('Test Band');
} catch (err) {
    if (err.status === 401) {
        // Not authenticated
    } else if (err.status === 400) {
        // Invalid input (missing name, etc)
    } else if (err.status === 500) {
        // Server error
    }
}
```

### Server Validation Failures

When sync tries to write invalid documents:

```
PUT /roady-staging/gig_123
Body: { type: "gig", name: "...", tenant: "tenant_wrong" }
Headers: Authorization: Bearer <jwt>

↓

Middleware extracts user from JWT
Checks: user owns tenant_wrong?
Result: NO - user owns ["tenant_xyz"]

↓

Response: 403 Forbidden
{
    "error": "Forbidden",
    "reason": "Cannot write to tenant 'tenant_wrong'. You have access to: ['tenant_xyz']"
}

↓

Client sees sync error
Document stays in local IndexDB
Sync retries (backs off exponentially)
```

## FAQ

**Q: What if I'm offline?**
A: You can create gigs locally. When you go online, sync will validate and save them. But you can't CREATE BANDS (tenants) offline - you'll need internet for that.

**Q: Can I work on multiple bands?**
A: Yes! Call `/api/tenants` multiple times, then use `switchBand()` to change context.

**Q: What if I try to write to someone else's band?**
A: Server rejects it with 403. The document stays in your local DB until you fix the tenant field or delete it.

**Q: Can other users access my band's data?**
A: No. Server validates on every write that the user owns the tenant. Only you can create gigs/equipment for your bands.

**Q: What if bandwidth is limited?**
A: You can still create app data locally. Syncing will work when bandwidth allows. But initial band creation (API call) needs at least a moment of connectivity.

## Migration from Old System

If you had old tenants created locally, they may not sync correctly. To fix:

1. Create band via `/api/tenants` (gets real tenant ID)
2. Manually update old documents:
   ```javascript
   const oldGigs = await db.allDocs({ include_docs: true });
   const updated = oldGigs.rows.map(row => ({
       ...row.doc,
       tenant: newTenantId  // Update to new tenant
   }));
   await db.bulkDocs(updated);
   ```

Or just delete old documents and recreate with new tenant after creating band.

## Monitoring & Debugging

### Check What Tenants You Have

```javascript
// Client side
const tenants = await TenantManager.getTenants();
console.log('Your bands:', tenants.map(t => t.name));

// Server side (curl)
curl -H "Authorization: Bearer $JWT" \
     http://localhost:5985/api/my-tenants
```

### Check Sync Status

```javascript
console.log('Sync status:', window.Sync.getSyncStatus());
// idle, active, paused, error, complete

if (window.Sync.hasSyncErrors()) {
    console.log('Sync has errors - will retry');
}
```

### Check Document Tenant Fields

```javascript
// Local
const allDocs = await DB.getDb().allDocs({ include_docs: true });
const badDocs = allDocs.rows.filter(row => !row.doc.tenant);
console.log('Docs missing tenant field:', badDocs);

// Server (via browser sync error logs)
// Look for 403 Forbidden errors in network tab
```

## Related Documentation

- [Sync Architecture Fix](./SYNC_ARCHITECTURE_ISSUE.md)
- [Detailed PRD](./TENANT_ISOLATION_PRD.md)
- [Implementation Guide](../mycouch/TENANT_ISOLATION_IMPLEMENTATION.md)
