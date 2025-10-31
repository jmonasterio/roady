# Multi-Tenant Support for Roady

## Overview

Add tenant isolation to Roady to enable multiple organizations, bands, or teams to use the same CouchDB instance while keeping their data completely separate. Each tenant maintains their own equipment catalog, gig types, and gigs.

## Problem Statement

Currently, all data in Roady is shared globally within a single PouchDB database. When syncing with CouchDB, there's no way to isolate data for different organizations or use cases. This feature enables:

1. **SaaS deployment** - Run one instance for multiple bands/organizations
2. **Multi-band management** - A roadie can work with multiple clients, each with separate data
3. **Demo isolation** - Demo data doesn't mix with production data
4. **CouchDB multi-tenancy** - Multiple tenants using same CouchDB server

## User Experience

### Tenant Selection (First Load)
1. User opens Roady for the first time
2. Dialog appears asking: "What's your organization name? (e.g., 'demo', 'blue-notes-band', 'acme-tours')"
3. Text input field with placeholder "demo"
4. User enters tenant name and proceeds
5. Tenant is stored locally and persists across sessions
6. All subsequent operations use this tenant

### No Tenant Switching (MVP)
- For simplicity, tenant is set once and persists
- To use a different tenant: clear browser data → restart app → select new tenant
- Future enhancement: Add tenant switcher in Settings

## Technical Implementation

### Document Structure

All documents now include a `tenant` field:

```javascript
{
  _id: "equipment_1234567890",
  type: "equipment",
  tenant: "demo",  // NEW: Tenant identifier
  name: "Shure SM58 Mic",
  description: "...",
  createdAt: "2025-01-15T10:30:00Z"
}
```

### Tenant Identifier

- String value, user-defined
- Examples: "demo", "blue-notes-band", "acme-touring", "jm"
- No special characters validation (MVP keeps it simple)
- Stored in local `roady_options` database

### Database Queries

All queries filter on BOTH `type` and `tenant`:

**Before:**
```javascript
async getAllEquipment() {
    return result.rows
        .filter(doc => doc.type === 'equipment');
}
```

**After:**
```javascript
async getAllEquipment() {
    return result.rows
        .filter(doc => doc.type === 'equipment' && doc.tenant === this.currentTenant);
}
```

This applies to:
- `getAllEquipment()`
- `getAllGigTypes()`
- `getAllGigs()`

### Document Creation

When creating documents, automatically inject tenant:

```javascript
async addEquipment(item) {
    const doc = {
        _id: 'equipment_' + Date.now(),
        type: 'equipment',
        tenant: this.currentTenant,  // NEW
        name: item.name,
        description: item.description || '',
        createdAt: new Date().toISOString()
    };
    return await this.db.put(doc);
}
```

This applies to:
- `addEquipment()`
- `addGigType()`
- `addGig()`

## Migration Strategy

**No migration needed.**

- Existing documents without a `tenant` field are simply ignored
- Queries filter on `tenant`, so old docs won't appear
- Users can optionally recreate their data in new tenant
- Clean slate for multi-tenant deployments

## CouchDB Sync Implications

### Advantages
- Multiple tenants can use same remote CouchDB server
- Each tenant's data is isolated by `tenant` field
- No cross-contamination of data
- Scales to many organizations

### Replication Strategy
- Continue syncing to `roady` database on CouchDB
- All tenants' docs in same CouchDB database
- CouchDB design docs can filter by tenant for views
- Future: Per-tenant replication URLs

## API Changes

### Database Layer (`js/db.js`)

**New Properties:**
```javascript
currentTenant: 'demo'  // Default tenant
```

**New Methods:**
```javascript
setTenant(tenantId) {
    this.currentTenant = tenantId;
    console.log('Tenant switched to:', tenantId);
}
```

**Updated Methods:**
- All `get*` methods now filter by tenant
- All `add*` methods now include tenant field

### App Layer (`js/app.js`)

**On Init:**
1. Load tenant from options
2. If not set, show tenant selection dialog
3. Call `DB.setTenant(tenantId)`
4. Load data

```javascript
async init() {
    await this.loadOptions();

    // If no tenant, show selection dialog
    if (!this.options.tenantId) {
        this.showTenantSelection = true;
        return; // Don't load data yet
    }

    // Set tenant in DB layer
    DB.setTenant(this.options.tenantId);

    // Load data
    await this.loadData();
    this.setupSyncListeners();
}
```

## UI Changes

### Tenant Selection Dialog

New modal that appears on first load:

```html
<dialog :open="!options.tenantId">
    <article>
        <header>
            <h3>Welcome to Roady</h3>
        </header>
        <label>
            Organization Name
            <input
                type="text"
                x-model="tenantIdInput"
                placeholder="e.g., 'demo', 'my-band'"
                @keyup.enter="selectTenant()"
            />
        </label>
        <footer>
            <button @click="selectTenant()">Get Started</button>
        </footer>
    </article>
</dialog>
```

### Options Display

Add tenant info to Settings > Options:

```
Current Tenant: demo
[Change Tenant Button - Future Enhancement]
```

## Data Isolation Examples

### Example 1: Two Bands Using Same Instance

**Band A (tenant: "blue-notes")**
- Equipment: Shure SM58, XLR Cables, Amps
- Gig Types: Small Club, Outdoor Festival
- Gigs: Concerts for Blue Notes

**Band B (tenant: "jazztet")**
- Equipment: Neumann U87, Studio Monitors
- Gig Types: Recording Session, Live Performance
- Gigs: Studio recordings and performances

Both use same `roady` database, but queries filter by tenant, so they never see each other's data.

### Example 2: CouchDB Server

```
CouchDB Server: https://couchdb.example.com
├── /roady (database)
│   ├── {blue-notes} equipment, gig_types, gigs
│   ├── {jazztet} equipment, gig_types, gigs
│   ├── {demo} equipment, gig_types, gigs
```

All tenants replicate to same database. Queries filter by tenant field.

## Future Enhancements

1. **Tenant Switching UI** - Allow users to change tenants from Settings
2. **Tenant Admin** - Manage multiple tenants from central dashboard
3. **Per-Tenant CouchDB URLs** - Different remote servers per tenant
4. **Tenant Quotas** - Limit storage/equipment/gigs per tenant
5. **Tenant Export/Import** - Share tenant data between instances

## Testing Checklist

- [ ] Create new equipment in tenant "demo" - only appears for demo user
- [ ] Switch to tenant "test" - demo equipment not visible
- [ ] Add gigs to both tenants - data properly isolated
- [ ] CouchDB sync works with multiple tenants
- [ ] Browser storage correctly scoped by tenant
- [ ] Existing data (no tenant field) is ignored

## Implementation Status

- [ ] PRD written ✓
- [ ] Database layer updated
- [ ] App layer updated
- [ ] UI implemented
- [ ] Testing complete
