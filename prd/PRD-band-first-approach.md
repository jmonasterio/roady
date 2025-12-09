# Band-First Approach for Roady

## Overview

Simplify the user mental model by making "bands" the primary concept. Each band automatically owns its own shared tenant. Users never think about tenants—they only think about bands.

## Problem Statement

Currently, users must understand the concept of "tenants" which is a backend architectural concept, not a user-facing feature. This creates cognitive overhead. The Band-first approach flips the model:

- Users only see "bands" in the UI
- Each band = one shared tenant automatically created
- No migration needed: original tenant becomes first band
- Flexible for future: personal tenant reserved for future use (drafts, notes, etc.)

## User Mental Model

**Everything is a band.**

- Users only see "bands" in the UI (never the word "tenant")
- They can pick a band to work in, switch between bands, or create a new band
- Each band has its own equipment catalog, gig types, gigs, and members
- Solo users are working in their own band, just like a solo act

## Behind the Scenes

- Every band = one shared tenant (even if the user is solo)
- Personal tenant exists only for future personal data if needed
- Optionally, the "personal tenant" can be the first band the user hasn't named yet, which feels like a band to the user

## Flow for a New User

1. **Sign up** → Roady creates a first band (shared tenant) automatically
   - Default name: "My First Band" (user can rename later)
   - User is Owner
   - Solo at first
2. **User sees bands in the app:**
   - My First Band
3. **User creates a new band** → new shared tenant automatically created
4. **User invites other members** → only affects the corresponding band's tenant
5. **Personal tenant is invisible for now**, can be used later if they want a private space

## Advantages of This Approach

1. **Simplest UX**: Users only think about bands, never tenants
2. **Clean separation**: Each band has its own tenant, roles, and data
3. **No migration needed**: No "move band from personal to shared" workflow
4. **Flexible for future**: Personal tenant can be used for drafts, notes, or experimental bands
5. **Multi-band ready**: Users can easily switch between multiple bands
6. **Progressive disclosure**: Users don't see personal tenant until they need it

## Data Model

### Band Info Document

Each band has a `band-info` document stored within its tenant:

```javascript
{
  _id: "band-info",
  type: "band-info",
  tenant: "tenant_band_xyz789",
  name: "My First Band",
  createdAt: "2025-01-15T10:30:00Z",
  updatedAt: "2025-01-15T10:30:00Z"
}
```

### Tenant Document (Infrastructure)

Tenants remain infrastructure only - multitenancy boundaries managed by mycouch:

```javascript
{
  _id: "tenant_band_xyz789",
  // Managed by mycouch - owner, members, roles handled at tenant level
}
```

### Equipment Document (Example)

Business data stored with tenant field:

```javascript
{
  _id: "equipment_1234567890",
  type: "equipment",
  tenant: "tenant_band_xyz789",         // Which band this equipment belongs to
  name: "Shure SM58 Mic",
  description: "Lead vocals mic",
  createdAt: "2025-01-15T10:30:00Z"
}
```

## Migration Strategy

### For Existing Users

1. User's existing tenant becomes their first band
2. Rename tenant document to represent a band concept
3. Add `name` field if not present (default: "Original Tenant" or user's preference)
4. Existing data continues to work without changes

### For New Users

1. Sign up flow creates first band automatically
2. Default name: "My First Band"
3. User is immediately in their band, no setup dialog
4. Can rename band in settings or create more bands

## Technical Implementation

### Database Layer (`js/db.js`)

**Leverage existing:**
- `currentTenant` already tracks which band user is working in
- `setTenant()` already handles switching between bands

**No DB layer changes needed:**
- All `get*` methods already filter by `currentTenant`
- All `add*` methods already inject `currentTenant`
- Existing query logic continues to work

### App Layer (`js/app.js`)

**On Init:**
1. Call `/my-tenants` to get user's bands (existing endpoint)
2. If first time user, create first band via `/api/tenants/create`
3. Set DB layer's current tenant with `setTenant()`
4. Load data for current band

**Band Switching:**
- Call `DB.setTenant(tenantId)` to switch bands
- App re-renders with new band's data

### UI Changes

#### Band Selector (Main Navigation)

Add band switcher to main nav/header:

```html
<header>
    <h1>Roady</h1>
    <div class="band-selector">
        <button @click="showBandMenu = true">
            {{ currentBandName }} <span>▼</span>
        </button>
        <div v-if="showBandMenu" class="band-menu">
            <div v-for="band in userBands" :key="band._id">
                <button 
                    @click="switchBand(band._id)"
                    :class="{ active: band._id === currentBandTenantId }"
                >
                    {{ band.name }}
                </button>
            </div>
            <hr />
            <button @click="showCreateBandDialog = true">+ Create New Band</button>
        </div>
    </div>
</header>
```

#### Create New Band Dialog

```html
<dialog :open="showCreateBandDialog">
    <article>
        <header>
            <h3>Create New Band</h3>
        </header>
        <label>
            Band Name
            <input
                type="text"
                v-model="newBandName"
                placeholder="e.g., 'Blue Notes', 'Studio Sessions'"
                @keyup.enter="createBand()"
            />
        </label>
        <footer>
            <button @click="showCreateBandDialog = false">Cancel</button>
            <button @click="createBand()">Create Band</button>
        </footer>
    </article>
</dialog>
```

#### Settings/Options

Update options page to show:

```
Current Band: My First Band
  [Rename Band]
  [Band Members]
  [Delete Band]

My Bands:
  • My First Band (Owner)
  • Studio Sessions (Editor)
  • Demo Band (Viewer)
```

## User Experience Examples

### Example 1: Roadie Working Solo

1. Alice signs up for Roady
2. Automatically sees: "My First Band"
3. She renames it to "The Harmonics" in settings
4. She creates equipment list, gig types, and adds gigs for "The Harmonics"
5. All her data is in her band's shared tenant

### Example 2: Multi-Band Scenario

1. Bob signs up, gets "My First Band" for his solo act
2. He creates "The Jazz Collective" band (creates new shared tenant)
3. He invites 3 other musicians to "The Jazz Collective"
4. Each band has separate equipment, gig types, and gigs
5. Bob can switch between "My First Band" and "The Jazz Collective" in the UI

### Example 3: Future Personal Space

1. Carol's "My First Band" is a shared band with 5 members
2. In the future, if she wants a private drafting space, she can enable "Personal Band"
3. She uses personal band for experimental setlists or personal notes
4. Personal band remains separate and private (for future enhancement)

## API Layer

### Endpoint: POST /api/tenants

Provided by mycouch backend (separate implementation effort).

Roady will consume the /api/tenants endpoints for all band/tenant CRUD operations:

```
POST /api/tenants/create
  - Create new band (shared tenant)
  - Request: { name: "Band Name" }
  - Response: { bandId, name, ownerId, createdAt }

POST /api/tenants/list (or GET /api/tenants)
  - List all bands for authenticated user
  - Response: { bands: [...] }

POST /api/tenants/:bandId/rename
  - Rename band
  - Request: { name: "New Name" }
  - Response: { bandId, name }

POST /api/tenants/:bandId/members
  - Get band members
  - Response: { members: [{ userId, name, role }, ...] }

POST /api/tenants/:bandId/invite
  - Invite user to band
  - Request: { userId, role: "editor|viewer" }
  - Response: { userId, role, invitedAt }

POST /api/tenants/:bandId/delete
  - Soft delete band (mark as deleted)
  - Note: User must be owner
  - Note: Cannot delete if band has other active members
  - Response: { bandId, deletedAt, deletedBy }
```

**Note:** Authorization and soft delete enforcement handled by mycouch backend.

### Soft Delete Strategy

**All deletes are soft deletes** (marked as deleted, never hard-deleted):

- Band document gets `deletedAt` timestamp and `deletedBy` user ID
- Documents remain in database with delete markers
- Queries exclude deleted documents by default
- Deleted bands can be restored (future feature) or permanently archived
- Historical data preserved for audit/recovery

**Band Deletion Rules:**
1. Only band owner can delete (enforced by mycouch)
2. Cannot delete if other active members exist (enforced by mycouch)
3. Mark band as deleted with timestamp
4. Cascade: All equipment, gig types, gigs in band get soft-deleted too (enforced by mycouch)
5. User's `bandTenantIds` is updated (removed from list)

## CouchDB Sync Implications

- Same as multi-tenant approach: all bands' data in same `roady` database
- Band documents (tenants) are stored alongside equipment, gigs, etc.
- All documents continue to filter by tenant field
- Deleted documents remain synced (with `deletedAt` marker)
- No change to sync strategy or replication

## Future Enhancements

1. **Band Image/Avatar** - Visual identifier for each band
2. **Band Permissions** - Fine-grained access control per band
3. **Personal Band** - True personal/private space for solo users
4. **Band Export/Import** - Share band data between instances
5. **Collaborative Editing** - Real-time updates for band members
6. **Band Analytics** - Track gigs, revenue, setlists per band
7. **Band Settings** - Customizations per band (timezone, currency, etc.)

## Implementation Checklist

**Data Model:**
- [ ] Add `name`, `ownerId`, and `roles` fields to tenant documents
- [ ] Existing equipment/gig documents already have `tenant` field—no changes

**Backend API (mycouch - separate effort):**
- /api/tenants endpoints for CRUD operations
- Soft delete enforcement with cascade
- Authorization checks (owner-only)

**Client-Side:**
- [ ] First-time user flow: call `/api/tenants/create` if no bands exist
- [ ] App init: call `/my-tenants` and load bands
- [ ] Band selector UI component
- [ ] Create new band dialog
- [ ] Settings/options band display (name, members, delete)
- [ ] Delete band confirmation (with warnings)

**Quality & Docs:**
- [ ] Migration script for existing users
- [ ] Documentation updated
- [ ] Testing: band isolation verified
- [ ] Testing: multi-band switching works
- [ ] Testing: new user gets first band automatically
- [ ] Testing: soft delete cascades correctly
- [ ] Testing: only owner can delete band

## Success Metrics

1. Users never encounter the word "tenant" in UI
2. Users can create and switch between multiple bands effortlessly
3. Data properly isolated per band
4. CouchDB sync continues to work across all bands
5. New user onboarding is smooth and automatic
