# Database Design

Roady uses **PouchDB** for client-side data storage, which provides an IndexedDB-backed NoSQL database that runs entirely in the browser.

## Database Schema

We maintain three separate PouchDB databases:

### 1. Equipment Catalog (`equipment`)

Individual pieces of equipment in your inventory.

```javascript
{
  _id: "equipment_[timestamp]",
  _rev: "[pouch_revision]",  // PouchDB internal revision tracking
  name: "String",             // e.g., "Shure SM58 Mic"
  description: "String",      // Optional notes about the equipment
  createdAt: "ISO8601 timestamp"
}
```

**Purpose**: Master catalog of all equipment items that can be added to gig types.

---

### 2. Gig Types (`gigTypes`)

Templates for different types of shows with pre-selected equipment lists.

```javascript
{
  _id: "gigtype_[timestamp]",
  _rev: "[pouch_revision]",
  name: "String",              // e.g., "Small Club", "Outdoor Festival"
  equipmentIds: ["String"],    // Array of equipment._id references
  createdAt: "ISO8601 timestamp"
}
```

**Purpose**: Reusable templates that define which equipment is needed for different types of gigs.

---

### 3. Gig Instances (`gigs`)

Specific scheduled gigs with their checklists.

```javascript
{
  _id: "gig_[timestamp]",
  _rev: "[pouch_revision]",
  name: "String",              // e.g., "Blue Note Jazz Club"
  gigTypeId: "String",         // Reference to gigTypes._id
  date: "YYYY-MM-DD",          // Gig date
  loadoutChecklist: [          // Leaving FOR gig (home → venue)
    {
      equipmentId: "String",   // Reference to equipment._id
      checked: Boolean
    }
  ],
  loadinChecklist: [           // Leaving FROM gig (venue → home)
    {
      equipmentId: "String",   // Reference to equipment._id
      checked: Boolean
    }
  ],
  createdAt: "ISO8601 timestamp"
}
```

**Purpose**: Specific gig instances with independent checklists for loading and unloading equipment.

---

## Entity Relationships

```
┌─────────────┐
│  Equipment  │
└──────┬──────┘
       │
       │ Many-to-Many (via equipmentIds array)
       │
       ├──────────────────────────────┐
       │                              │
       ▼                              ▼
┌─────────────┐              ┌──────────────┐
│  Gig Types  │──────────────│  Gig Instance │
└─────────────┘  One-to-Many └──────────────┘
   (via gigTypeId)      (via checklist equipmentIds)
```

### Relationship Details

1. **Equipment ↔ Gig Types**: Many-to-many
   - A gig type can have many equipment items
   - An equipment item can belong to many gig types
   - Implemented via `equipmentIds` array in gig type documents

2. **Gig Types → Gig Instances**: One-to-many
   - A gig type can be used to create many gig instances
   - Each gig instance references one gig type via `gigTypeId`

3. **Equipment ↔ Gig Instances**: Many-to-many
   - A gig instance can have many equipment items (in both checklists)
   - An equipment item can appear in many gig instances
   - Implemented via `equipmentId` references in checklist arrays

---

## Key Design Decisions

### 1. Separate Checklists
`loadoutChecklist` and `loadinChecklist` are separate arrays containing the same equipment items but with independent `checked` states. This allows:
- Tracking what was actually loaded when leaving home
- Verifying only those items when returning from venue
- Safety check for items not originally brought

### 2. Denormalized References
Equipment IDs are stored directly in arrays rather than using a join table. Benefits:
- Fast lookups without complex queries
- Works well with PouchDB's document-oriented model
- No need for multi-collection queries

### 3. No Foreign Key Constraints
PouchDB is schema-less, so referential integrity is managed in application code:
- When deleting equipment, check if referenced in gig types/gigs
- When editing gig types, optionally update future gigs
- App handles orphaned references gracefully

### 4. Timestamp-Based IDs
Using `Date.now()` for unique document IDs:
- Simple and predictable
- Works offline without coordination
- Naturally sortable by creation time
- Format: `[type]_[timestamp]` (e.g., `gig_1704067200000`)

### 5. Local-Only Storage
All data stored in browser IndexedDB via PouchDB:
- No server required
- Works completely offline
- Fast read/write operations
- Data persists across sessions
- Future: Could add CouchDB sync for multi-device support

---

## Data Operations

### Creating a Gig Instance
1. User selects a gig type template
2. System copies `equipmentIds` from gig type
3. Creates two identical checklists (loadout and loadin)
4. Each checklist item initialized with `checked: false`

### Adding Item to Active Gig
When user adds an item while preparing for a gig:
1. Item added to both `loadoutChecklist` and `loadinChecklist`
2. User prompted to add item to gig type for future gigs
3. If yes: item appended to gig type's `equipmentIds`

### Editing Gig Type
When a gig type's equipment list is modified:
1. All **future** gigs using that type are updated
2. Past gigs remain unchanged (historical record)
3. Existing checked states preserved for matching items
4. New items added with `checked: false`
5. Removed items deleted from checklists

---

## Storage Limits

PouchDB uses IndexedDB with browser-dependent storage limits:
- **Chrome/Edge**: ~60% of available disk space (shared across all sites)
- **Firefox**: Up to 2GB per origin (with user prompt for more)
- **Safari**: 1GB limit, prompts after 50MB

Typical storage usage:
- Equipment item: ~200 bytes
- Gig type: ~500 bytes
- Gig instance: ~1-2 KB (depending on checklist size)
- **1000 gigs + 100 equipment items**: ~2-3 MB

---

## Future Enhancements

### Potential Schema Changes
1. **Photos**: Add `photoUrl` or `photoBlob` to equipment documents
2. **Notes**: Add `notes` field to gig instances for venue-specific info
3. **Categories**: Add `category` field to equipment for better organization
4. **History**: Track checklist completion timestamps
5. **Sync**: Add CouchDB sync for multi-device access

### CouchDB Synchronization

PouchDB has built-in CouchDB sync capabilities. When implemented:

```javascript
// Sync configuration
const remoteDB = new PouchDB(options.couchDbUrl + '/equipment');
DB.equipment.sync(remoteDB, {
  live: true,
  retry: true
}).on('change', function (info) {
  // Handle changes
}).on('error', function (err) {
  // Handle errors
});
```

**Sync Strategy:**
- Use user-configured CouchDB URL from Settings > Options
- Three separate databases: equipment, gigTypes, gigs
- Bidirectional continuous sync when online
- Conflict resolution: last-write-wins or manual resolution
- Sync indicator in UI showing status

**Security Considerations:**
- HTTPS required for remote URLs
- Authentication via URL or separate credentials
- Per-user database isolation (future: multi-user support)

### Migration Strategy
PouchDB documents are schema-less, so migrations are simple:
1. Add new fields with default values in app code
2. Gradually update existing documents on read
3. No need for formal migration scripts
4. Old data remains compatible
