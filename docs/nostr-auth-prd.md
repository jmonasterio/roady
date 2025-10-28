# Nostr Authentication PRD

## Overview
Add Nostr-based authentication to Roady PWA to enable multi-user support on a shared Cloudant database, with each user's data isolated by their Nostr public key (npub).

## Background
- Roady is a Progressive Web App (PWA) - no browser extensions available
- Currently single-user with all data local or synced to personal Cloudant
- Goal: Support multiple users sharing a Cloudant database with data isolation

## User Stories

### As a roadie, I want to:
1. Log in with my Nostr identity so my data is isolated from other users
2. Access my equipment and gigs from any device using my Nostr key
3. Keep my private key secure and never expose it
4. See which Nostr identity I'm logged in as
5. Log out and log in with a different identity

## Authentication Options for PWA

### Option 1: Private Key (nsec) Entry
**Description:** User enters their Nostr private key (nsec1...) which is stored encrypted locally

**Pros:**
- Simple implementation
- Works completely offline
- No external dependencies

**Cons:**
- Users must trust the app with their private key
- Manual key entry is error-prone
- Security concerns if key is compromised

**UX Flow:**
1. User clicks "Login with Nostr"
2. Enters nsec (private key) in password field
3. App derives public key (npub) and uses as tenant ID
4. Private key stored encrypted in local PouchDB

### Option 2: Generate New Key Pair
**Description:** App generates a new Nostr key pair for the user

**Pros:**
- Simple onboarding
- No external dependencies
- Keys never leave the device

**Cons:**
- Keys not portable to other Nostr apps
- User must backup nsec manually
- Limited interoperability

**UX Flow:**
1. User clicks "Create Nostr Identity"
2. App generates key pair
3. Shows npub (public) and nsec (private) for backup
4. Stores encrypted locally

### Option 3: NIP-46 (Nostr Connect / Remote Signing)
**Description:** Use bunker URLs to connect to remote signing services

**Pros:**
- Private key never leaves remote signer
- Better security model
- Works with existing Nostr identities

**Cons:**
- Requires internet connection
- Complex implementation
- Depends on external signing service

**UX Flow:**
1. User clicks "Login with Nostr"
2. Scans QR code or enters bunker URL
3. Remote signer approves connection
4. App uses npub as tenant ID

### Option 4: Public Key Only (Read-Only Mode)
**Description:** User enters only their npub to view data (no signing capability)

**Pros:**
- No private key needed
- Safe for viewing on untrusted devices
- Simple implementation

**Cons:**
- Can't create/modify data without private key
- Limited functionality

## Recommended Approach

**Phase 1: MVP**
- Option 2 (Generate Key Pair) + Option 1 (Import nsec)
- Users can create new identity or import existing
- Simple, works offline, no external dependencies

**Phase 2: Enhanced**
- Add Option 4 (Public key read-only mode)
- Add key export/backup UI
- Add multiple identity switching

**Phase 3: Advanced**
- Add Option 3 (NIP-46 remote signing)
- Integration with popular Nostr signers

## Data Model Changes

### Add Tenant Field to All Documents

```javascript
// Equipment
{
  _id: 'equipment_1234567890',
  type: 'equipment',
  tenant: 'npub1...', // Nostr public key
  name: 'Shure SM58',
  description: 'Main vocal mic',
  createdAt: '2025-01-01T00:00:00.000Z'
}

// Gig Type
{
  _id: 'gig_type_1234567890',
  type: 'gig_type',
  tenant: 'npub1...',
  name: 'Small Club',
  equipmentIds: [...],
  createdAt: '2025-01-01T00:00:00.000Z'
}

// Gig
{
  _id: 'gig_1234567890',
  type: 'gig',
  tenant: 'npub1...',
  name: 'Blue Note Jazz Club',
  gigTypeId: 'gig_type_...',
  date: '2025-01-15',
  loadoutChecklist: [...],
  loadinChecklist: [...],
  createdAt: '2025-01-01T00:00:00.000Z'
}
```

### Identity Storage (Local Only)

```javascript
// Stored in roady_options database
{
  _id: 'nostr_identity',
  npub: 'npub1...', // Public key (bech32 encoded)
  encryptedNsec: '...', // Encrypted private key
  created: '2025-01-01T00:00:00.000Z'
}
```

## UI Changes

### Navigation Bar
```
[Roady] [My Gigs] [Settings] [👤 npub1abc...xyz] [Logout]
```

### Login Screen (when not authenticated)
```
┌─────────────────────────────────────┐
│         Welcome to Roady            │
│                                     │
│  📦 Equipment Checklist for Roadies │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🆕 Create Nostr Identity   │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🔑 Import Existing Key     │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  👁️  View with Public Key   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Settings > Identity Tab
```
Current Identity
npub: npub1abc...xyz (click to copy)

[ View Private Key (nsec) ]
[ Export Backup ]
[ Switch Identity ]
[ Logout ]
```

## Technical Implementation

### 1. Nostr Key Management
```javascript
// js/nostr.js
const Nostr = {
    // Generate new key pair
    generateKeys() {
        const privateKey = NostrTools.generatePrivateKey();
        const publicKey = NostrTools.getPublicKey(privateKey);
        return {
            nsec: NostrTools.nip19.nsecEncode(privateKey),
            npub: NostrTools.nip19.npubEncode(publicKey)
        };
    },

    // Import from nsec
    importKey(nsec) {
        const { type, data } = NostrTools.nip19.decode(nsec);
        if (type !== 'nsec') throw new Error('Invalid nsec');
        const publicKey = NostrTools.getPublicKey(data);
        return {
            nsec: nsec,
            npub: NostrTools.nip19.npubEncode(publicKey)
        };
    },

    // Encrypt nsec for storage
    async encryptKey(nsec, password) {
        // Use Web Crypto API
        // Return encrypted string
    },

    // Decrypt nsec from storage
    async decryptKey(encrypted, password) {
        // Use Web Crypto API
        // Return nsec
    }
};
```

### 2. Database Query Filtering
```javascript
// js/db.js
async getAllEquipment(tenant) {
    const result = await this.db.allDocs({
        include_docs: true,
        startkey: 'equipment_',
        endkey: 'equipment_\uffff'
    });
    return result.rows
        .map(row => row.doc)
        .filter(doc => doc.type === 'equipment' && doc.tenant === tenant);
}
```

### 3. Document Creation
```javascript
async addEquipment(item, tenant) {
    const doc = {
        _id: 'equipment_' + Date.now(),
        type: 'equipment',
        tenant: tenant, // Current user's npub
        name: item.name,
        description: item.description || '',
        createdAt: new Date().toISOString()
    };
    return await this.db.put(doc);
}
```

## Migration Strategy

### Existing Users (Pre-Nostr)
1. On first load after update, check if documents lack `tenant` field
2. Prompt: "Add Nostr identity to enable multi-user support"
3. User creates/imports identity
4. Add tenant field to all existing documents with user's npub
5. Done - data now isolated to their identity

### New Users
1. Must create/import identity before using app
2. All documents automatically get tenant field

## Security Considerations

1. **Private Key Storage**
   - Encrypt nsec using device password/PIN
   - Store in local PouchDB (never synced)
   - Never expose in logs or network requests

2. **Data Isolation**
   - All queries MUST filter by tenant
   - Server-side validation (Cloudant design docs)
   - No cross-tenant data access

3. **Key Backup**
   - Clearly warn users to backup nsec
   - Provide export functionality
   - Show recovery phrase option

## Future Enhancements

1. **Nostr Event Publishing**
   - Publish gig completions as Nostr events
   - Share equipment lists with band members
   - Sync via Nostr relays instead of Cloudant

2. **Multi-Device Key Sync**
   - Use Nostr NIP-46 for key synchronization
   - Encrypted backup to personal relay

3. **Collaboration**
   - Share gig types with other npubs
   - Band member invites via Nostr DMs
   - Equipment lending tracking

4. **Nostr Marketplace Integration**
   - List equipment for rent/sale
   - NIP-15 marketplace events

## Open Questions

1. Should we require Nostr login or make it optional?
   - **Recommendation:** Optional - allow anonymous local-only mode

2. How to handle forgotten/lost keys?
   - **Recommendation:** Clear warning during setup, no recovery possible

3. Should we support multiple identities per device?
   - **Recommendation:** Yes, in Phase 2

4. Encrypt data in Cloudant or trust database-level security?
   - **Recommendation:** Trust Cloudant ACLs initially, add encryption in Phase 3

## Success Metrics

1. User adoption rate of Nostr authentication
2. Number of multi-user shared databases
3. Zero cross-tenant data leaks
4. Average time to complete login flow (<30 seconds)

## Timeline Estimate

- **Phase 1 MVP:** 8-12 hours
  - Key generation/import UI: 2-3 hours
  - Tenant field migration: 2-3 hours
  - Query filtering: 2-3 hours
  - Testing: 2-3 hours

- **Phase 2 Enhanced:** 4-6 hours
- **Phase 3 Advanced:** 12-16 hours (NIP-46 complexity)
