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

### User Document

```javascript
{
  _id: "user_abc123",
  type: "user",
  userId: "abc123",           // Auth system user ID
  name: "Alice",
  email: "alice@example.com",
  bandTenantIds: ["tenant_band1", "tenant_band2"],  // IDs of all bands user belongs to
  primaryBandTenantId: "tenant_band1",              // Currently selected band
  personalTenantId: "tenant_personal_abc123",       // Optional: personal/solo space
  createdAt: "2025-01-15T10:30:00Z"
}
```

### Band Tenant Document

Each band is a tenant document:

```javascript
{
  _id: "tenant_band_xyz789",
  type: "tenant",
  tenantId: "tenant_band_xyz789",
  name: "My First Band",
  ownerId: "abc123",                    // User who created the band
  userIds: ["abc123"],                  // All users in this band
  roles: {                              // User roles in this band
    "abc123": "owner",
    "def456": "editor"
  },
  isShared: true,                       // Always true for bands
  createdAt: "2025-01-15T10:30:00Z"
}
```

### Equipment Document (Example)

Documents in a band continue to include tenant field:

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

**New Properties:**
```javascript
currentBandTenantId: 'tenant_band_xyz789'  // Current band the user is working in
userBandTenantIds: ['tenant_band_xyz789', 'tenant_band_abc123']  // All user's bands
```

**New Methods:**
```javascript
setCurrentBand(bandTenantId) {
    this.currentBandTenantId = bandTenantId;
    console.log('Switched to band:', bandTenantId);
}

getAllUserBands() {
    // Return list of bands user belongs to
}

createBand(bandName) {
    // Create new band (new shared tenant)
}

updateBandName(bandTenantId, newName) {
    // Rename a band
}

addBandMember(bandTenantId, userId, role) {
    // Invite user to band
}
```

**Updated Methods:**
- All `get*` methods continue to filter by current band's tenant field
- All `add*` methods continue to inject current band's tenant field
- No changes to query logic—still uses tenant field for filtering

### App Layer (`js/app.js`)

**On Init:**
1. Load user's bands from user document
2. Load primary band (currently selected)
3. If first time user, create first band automatically
4. Set DB layer's current band tenant
5. Load data for current band

```javascript
async init() {
    await this.loadUser();

    // First time user: create first band
    if (!this.user.bandTenantIds || this.user.bandTenantIds.length === 0) {
        await this.createFirstBand();
    }

    // Set current band
    this.currentBandTenantId = this.user.primaryBandTenantId;
    DB.setCurrentBand(this.currentBandTenantId);

    // Load data
    await this.loadData();
    this.setupSyncListeners();
}

async createFirstBand() {
    const bandName = "My First Band";
    const band = {
        _id: 'tenant_band_' + Date.now(),
        type: 'tenant',
        name: bandName,
        ownerId: this.user.userId,
        userIds: [this.user.userId],
        roles: { [this.user.userId]: 'owner' },
        isShared: true,
        createdAt: new Date().toISOString()
    };
    const result = await DB.put(band);
    
    // Update user document
    this.user.bandTenantIds = [band._id];
    this.user.primaryBandTenantId = band._id;
    await DB.put(this.user);
}
```

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

## CouchDB Sync Implications

- Same as multi-tenant approach: all bands' data in same `roady` database
- Band documents (tenants) are stored alongside equipment, gigs, etc.
- All documents continue to filter by tenant field
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

- [ ] User model updated with `bandTenantIds` and `primaryBandTenantId`
- [ ] Band tenant documents created (rename existing tenants)
- [ ] First-time user flow creates automatic band
- [ ] Database layer methods for band management
- [ ] App layer band switching and creation
- [ ] Band selector UI component
- [ ] Create new band dialog
- [ ] Settings/options band display
- [ ] Documentation updated
- [ ] Migration script for existing users
- [ ] Testing: band isolation verified
- [ ] Testing: multi-band switching works
- [ ] Testing: new user gets first band automatically

## Success Metrics

1. Users never encounter the word "tenant" in UI
2. Users can create and switch between multiple bands effortlessly
3. Data properly isolated per band
4. CouchDB sync continues to work across all bands
5. New user onboarding is smooth and automatic
