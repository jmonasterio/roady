# PRD: Clerk Authentication for Roady PWA

**Document Version:** 1.0
**Last Updated:** 2025-01-XX
**Status:** Proposal

---

## Executive Summary

Add user authentication to Roady using Clerk, enabling secure multi-user access, band data sharing, and per-user data isolation. This replaces the current single-device, local-only storage model with authenticated, synced storage while maintaining offline-first PWA capabilities.

---

## Goals & Motivation

### Primary Goals
1. **User Identity** - Each user has their own account and data
2. **Multi-Device Sync** - Authenticated users can access their data from any device
3. **Band Collaboration** - Share equipment, templates, and gigs across band members
4. **Data Security** - Protect sensitive gig information and equipment lists

### Why Clerk?
- **PWA-Native** - Designed for modern web apps and PWAs
- **Magic Link Auth** - Passwordless authentication works well on mobile
- **JWT Standard** - Token-based auth integrates with CouchDB
- **Easy Integration** - Works with vanilla JavaScript (no framework required)
- **OAuth Options** - Google, Apple, GitHub sign-in for convenience

### Success Metrics
- User can sign in within 30 seconds
- Auth state persists across app launches
- Offline access to previously synced data
- Seamless experience when switching devices

---

## Current Architecture

### Existing Components
- **Frontend**: Alpine.js (reactive UI)
- **Storage**: PouchDB (local IndexedDB)
- **Sync**: Optional CouchDB with embedded credentials
- **No Backend**: Fully client-side application

### What Changes
- **Add**: Clerk SDK for authentication
- **Add**: User-scoped data in PouchDB
- **Modify**: CouchDB sync to use Clerk JWT instead of embedded credentials
- **Keep**: Offline-first PWA capabilities
- **Keep**: Alpine.js UI framework

---

## Proposed Architecture

### Authentication Flow

```
┌─────────────────────────────────────────────────┐
│  User opens Roady PWA                            │
└───────────────┬─────────────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │ Clerk.load()  │
        └───────┬───────┘
                │
        ┌───────▼────────┐
        │ Auth state?    │
        └───┬────────┬───┘
            │        │
    Signed In    Not Signed In
            │        │
            ▼        ▼
    ┌───────────┐  ┌──────────────┐
    │ Load user │  │ Show sign-in │
    │ data      │  │ prompt       │
    └───────────┘  └──────────────┘
```

### Data Model Changes

**Before:**
```javascript
// Single user, no scoping
{
  _id: 'equipment_123',
  type: 'equipment',
  name: 'Mic Stand'
}
```

**After:**
```javascript
// Multi-user with tenant scoping
{
  _id: 'equipment_123',
  type: 'equipment',
  userId: 'user_abc',        // Owner
  bandId: 'band_xyz',        // Optional: Shared band
  name: 'Mic Stand'
}
```

### Backend Integration (Future)

```
┌─────────────┐         JWT          ┌─────────────┐
│   Roady     │ ────────────────────> │  CouchDB    │
│   PWA       │  Authorization:       │  Server     │
│             │  Bearer <token>       │             │
└─────────────┘                       └─────────────┘
                                             │
                                             ▼
                                      ┌─────────────┐
                                      │ Clerk JWT   │
                                      │ Validation  │
                                      └─────────────┘
```

---

## Technical Implementation

### Phase 1: Clerk Integration (MVP)

#### 1.1 Install Clerk SDK

**Option A: CDN (Recommended for PWA)**
```html
<script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
```

**Option B: NPM (If adding build step)**
```bash
npm install @clerk/clerk-js
```

#### 1.2 Initialize Clerk

In `index.html` or new `js/auth.js`:

```javascript
// Initialize Clerk
const clerkPublishableKey = 'pk_test_...'; // From Clerk dashboard

window.Clerk.load({
  publishableKey: clerkPublishableKey
}).then(clerk => {
  window.clerk = clerk;

  // Check auth state
  if (clerk.user) {
    console.log('User signed in:', clerk.user.id);
    initializeApp(clerk.user);
  } else {
    console.log('User not signed in');
    showSignInUI();
  }
});
```

#### 1.3 Sign-In UI

Add to `index.html`:

```html
<!-- Sign-in view (shown when not authenticated) -->
<div x-show="currentView === 'signin'" x-data="{ email: '' }">
  <hgroup>
    <h2>Welcome to Roady</h2>
    <p>Sign in to access your equipment checklists</p>
  </hgroup>

  <label>
    Email Address
    <input type="email" x-model="email" placeholder="you@example.com" />
  </label>

  <button @click="signInWithMagicLink(email)">
    Send Magic Link
  </button>

  <p class="text-muted">
    We'll email you a link to sign in. No password required.
  </p>
</div>
```

#### 1.4 Auth Methods in `app.js`

```javascript
// Add to Alpine data
Alpine.data('roady', () => ({
  // ... existing state
  user: null,
  isAuthenticated: false,

  async init() {
    await this.checkAuth();
    if (this.isAuthenticated) {
      await this.loadData();
      await this.loadOptions();
      this.setupSyncListeners();
    }
  },

  async checkAuth() {
    if (!window.clerk) return;

    this.user = window.clerk.user;
    this.isAuthenticated = !!this.user;

    if (this.isAuthenticated) {
      this.currentView = 'gigs';
    } else {
      this.currentView = 'signin';
    }
  },

  async signInWithMagicLink(email) {
    if (!email || !email.trim()) return;

    try {
      await window.clerk.signIn.create({
        identifier: email,
        strategy: 'email_link',
        redirectUrl: window.location.origin + '/auth/verify'
      });

      alert('Check your email for a sign-in link!');
    } catch (err) {
      console.error('Sign in error:', err);
      alert('Sign in failed. Please try again.');
    }
  },

  async signOut() {
    await window.clerk.signOut();
    this.user = null;
    this.isAuthenticated = false;
    this.currentView = 'signin';
  }
}));
```

#### 1.5 Service Worker Updates

Update `js/sw.js` to avoid caching auth endpoints:

```javascript
// Don't cache Clerk auth endpoints
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip Clerk API calls
  if (url.hostname.includes('clerk.')) {
    return; // Let it go to network
  }

  // ... rest of caching logic
});
```

---

### Phase 2: Data Scoping

#### 2.1 Add User ID to Documents

Update `js/db.js`:

```javascript
// Add equipment with user scoping
async addEquipment(item) {
  const userId = window.clerk?.user?.id;
  if (!userId) throw new Error('User not authenticated');

  const doc = {
    _id: 'equipment_' + Date.now(),
    type: 'equipment',
    userId: userId, // Add user ownership
    name: item.name,
    description: item.description || '',
    createdAt: new Date().toISOString()
  };
  return await this.db.put(doc);
},

// Get only user's equipment
async getAllEquipment() {
  const userId = window.clerk?.user?.id;
  const result = await this.db.allDocs({
    include_docs: true,
    startkey: 'equipment_',
    endkey: 'equipment_\uffff'
  });
  return result.rows
    .map(row => row.doc)
    .filter(doc => doc.type === 'equipment' && doc.userId === userId);
}
```

#### 2.2 Data Migration

For existing users upgrading from local-only:

```javascript
async migrateExistingData() {
  const userId = window.clerk?.user?.id;
  if (!userId) return;

  // Find all documents without userId
  const allDocs = await this.db.allDocs({ include_docs: true });
  const unownedDocs = allDocs.rows
    .map(row => row.doc)
    .filter(doc => !doc.userId && doc.type);

  // Assign to current user
  for (const doc of unownedDocs) {
    doc.userId = userId;
    await this.db.put(doc);
  }

  console.log(`Migrated ${unownedDocs.length} documents to user ${userId}`);
}
```

---

### Phase 3: JWT-Based CouchDB Sync

#### 3.1 Get Clerk JWT

```javascript
async setupSync(couchDbUrl) {
  const token = await window.clerk?.session?.getToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const remoteDB = new PouchDB(`${couchDbUrl}/roady`, {
    fetch: (url, opts) => {
      opts.headers.set('Authorization', `Bearer ${token}`);
      return PouchDB.fetch(url, opts);
    }
  });

  // Rest of sync setup...
}
```

#### 3.2 Backend JWT Validation (Future)

CouchDB proxy or middleware validates Clerk JWT:

```javascript
// Express middleware example
const { clerkClient } = require('@clerk/clerk-sdk-node');

async function validateClerkJWT(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  try {
    const session = await clerkClient.sessions.verifySession(token);
    req.userId = session.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

## User Flows

### Flow 1: First-Time User

1. User opens Roady PWA
2. Sees "Welcome to Roady" sign-in screen
3. Enters email address
4. Clicks "Send Magic Link"
5. Receives email with sign-in link
6. Clicks link → redirected to PWA
7. Clerk validates → user signed in
8. Empty state: "Create your first equipment item"

### Flow 2: Returning User (Same Device)

1. User opens Roady PWA
2. Clerk automatically recognizes session
3. App loads user's data immediately
4. No sign-in required

### Flow 3: New Device

1. User opens Roady on new phone
2. Signs in with magic link
3. Data syncs from CouchDB (if configured)
4. User sees all their existing gigs and equipment

### Flow 4: Offline Access

1. User opens PWA without internet
2. Clerk uses cached session (if not expired)
3. User can view/edit local data
4. Changes queued for sync when online
5. Sign-in renewal deferred until online

### Flow 5: Sign Out

1. User goes to Settings
2. Clicks "Sign Out"
3. Clerk clears session
4. App returns to sign-in screen
5. Local data remains (but not accessible)

---

## UI Changes

### Navigation Bar

**Before:**
```html
<nav class="container-fluid">
  <ul>
    <li><strong>Roady</strong></li>
  </ul>
  <ul>
    <li><a href="#" @click.prevent="currentView = 'gigs'">My Gigs</a></li>
    <li><a href="#" @click.prevent="currentView = 'settings'">Settings</a></li>
  </ul>
</nav>
```

**After:**
```html
<nav class="container-fluid">
  <ul>
    <li><strong>Roady</strong></li>
  </ul>
  <ul>
    <li x-show="isAuthenticated"><a href="#" @click.prevent="currentView = 'gigs'">My Gigs</a></li>
    <li x-show="isAuthenticated"><a href="#" @click.prevent="currentView = 'settings'">Settings</a></li>
    <li x-show="isAuthenticated">
      <span x-text="user?.emailAddresses?.[0]?.emailAddress" class="text-muted"></span>
    </li>
    <li x-show="isAuthenticated">
      <a href="#" @click.prevent="signOut()">Sign Out</a>
    </li>
  </ul>
</nav>
```

### Settings → Account Section

Add new tab:

```html
<button @click="settingsTab = 'account'" :class="settingsTab === 'account' ? '' : 'outline'">
  Account
</button>

<section x-show="settingsTab === 'account'">
  <h3>Account Settings</h3>

  <div>
    <strong>Email:</strong>
    <span x-text="user?.emailAddresses?.[0]?.emailAddress"></span>
  </div>

  <div>
    <strong>User ID:</strong>
    <code x-text="user?.id"></code>
  </div>

  <div>
    <strong>Signed In:</strong>
    <span x-text="new Date(user?.createdAt).toLocaleDateString()"></span>
  </div>

  <button @click="signOut()" class="secondary">Sign Out</button>
</section>
```

---

## PWA-Specific Considerations

### Service Worker Caching

**Do Cache:**
- ✅ Clerk SDK JavaScript files
- ✅ Clerk UI components (if using)
- ✅ Static assets (CSS, fonts)

**Do NOT Cache:**
- ❌ Clerk API endpoints (`api.clerk.com/*`)
- ❌ Authentication callbacks
- ❌ JWT refresh endpoints

### Offline Behavior

**Session Expiry:**
- Clerk sessions typically last 7 days
- Offline users can work until session expires
- When online, Clerk auto-refreshes tokens
- Show "Session expired, please sign in" if expired offline

**Local Data Access:**
- User's data stays in PouchDB/IndexedDB
- Sign-out does NOT delete local data
- Re-sign-in re-associates with same data (by userId)

### iOS/Android App Wrappers

If wrapping PWA with Capacitor/Cordova:

**Redirect URIs:**
```
https://your-domain.com/auth/callback
capacitor://your-app/auth/callback  (iOS/Android)
```

**Deep Links:**
- Configure Clerk to allow custom URL schemes
- Handle magic link redirects in native layer
- Pass to WebView once validated

---

## Security Considerations

### Data Isolation

- Each user only sees their own data (filtered by `userId`)
- Band sharing (future) requires explicit permission
- No cross-user data leakage

### Token Security

- JWTs stored in memory only (not localStorage)
- Clerk handles token refresh automatically
- Tokens expire after inactivity
- No credentials embedded in code

### CouchDB Access

- Backend validates all JWTs before DB access
- User can only read/write their own documents
- Server-side filtering by `userId`
- CORS configured to allow only Roady domain

---

## Migration Strategy

### Existing Users

**Option 1: Prompt on First Load**
```
"Roady now supports sign-in to sync across devices.
Would you like to:
[Create Account] - Sign in and keep your data
[Continue Offline] - Keep using locally only"
```

**Option 2: Auto-Migrate**
- Detect existing local data
- Prompt for email to claim data
- Migrate all documents to that user's account
- Enable sync automatically

### Data Ownership

- All existing local data assigned to first user who signs in on that device
- If multiple people used same device → first user gets data
- Alternative: "Transfer data to different account" feature

---

## Implementation Timeline

### Phase 1: Basic Auth (Week 1-2)
- [ ] Add Clerk SDK to project
- [ ] Implement sign-in UI
- [ ] Add magic link authentication
- [ ] Update navigation with user info
- [ ] Add sign-out functionality

### Phase 2: Data Scoping (Week 3-4)
- [ ] Add `userId` to all document types
- [ ] Filter queries by current user
- [ ] Implement data migration for existing users
- [ ] Update all CRUD operations

### Phase 3: JWT Sync (Week 5-6)
- [ ] Replace embedded credentials with JWT
- [ ] Update CouchDB sync to use tokens
- [ ] Add token refresh logic
- [ ] Test offline/online transitions

### Phase 4: Backend Validation (Week 7-8)
- [ ] Set up CouchDB proxy/middleware
- [ ] Implement JWT validation
- [ ] Configure CORS properly
- [ ] Deploy backend service

### Phase 5: Polish & Testing (Week 9-10)
- [ ] Handle edge cases (expired sessions, network errors)
- [ ] Add loading states
- [ ] Improve error messages
- [ ] End-to-end testing on iOS/Android
- [ ] Performance optimization

---

## Alternative Approaches Considered

### 1. Firebase Auth
**Pros:** Familiar, good docs
**Cons:** Heavier SDK, more complex pricing
**Verdict:** Clerk is more PWA-focused

### 2. Auth0
**Pros:** Enterprise-grade, flexible
**Cons:** Complex setup, overkill for simple use case
**Verdict:** Too heavy for band roadie app

### 3. Roll Our Own
**Pros:** Full control
**Cons:** Security risk, maintenance burden
**Verdict:** Not worth the effort

### 4. CouchDB Auth Only
**Pros:** No external dependency
**Cons:** Poor UX, no magic links, manual user management
**Verdict:** Not user-friendly enough

---

## Success Criteria

### Must Have
- ✅ User can sign in with email (magic link)
- ✅ Session persists across app launches
- ✅ Each user sees only their own data
- ✅ Sign out clears session but keeps local data
- ✅ Works offline after initial sign-in

### Should Have
- ✅ OAuth sign-in (Google, Apple)
- ✅ JWT-based CouchDB sync
- ✅ Profile management (change email)
- ✅ Smooth migration for existing users

### Nice to Have
- ⭕ Band collaboration (share data)
- ⭕ Multiple device management
- ⭕ Admin dashboard
- ⭕ Usage analytics

---

## Open Questions

1. **Pricing:** Clerk free tier sufficient? (10,000 MAU)
2. **Backend:** Self-host CouchDB or use managed service?
3. **Migration:** Force all users to sign in or allow opt-in?
4. **Offline:** How long should offline sessions last?
5. **Sharing:** Band collaboration in Phase 1 or Phase 2?

---

## Appendix: Minimal Example

### Complete Auth Integration (Vanilla JS + Alpine.js)

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <title>Roady - Auth Example</title>
  <script src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
<body>
  <div x-data="authApp">
    <!-- Sign In View -->
    <div x-show="!isAuthenticated">
      <h2>Sign In to Roady</h2>
      <input type="email" x-model="email" placeholder="you@example.com" />
      <button @click="signIn()">Send Magic Link</button>
    </div>

    <!-- App View -->
    <div x-show="isAuthenticated">
      <h2>Welcome, <span x-text="user?.emailAddresses?.[0]?.emailAddress"></span></h2>
      <button @click="signOut()">Sign Out</button>
    </div>
  </div>

  <script>
    // Initialize Clerk
    window.Clerk.load({
      publishableKey: 'pk_test_YOUR_KEY_HERE'
    }).then(clerk => {
      window.clerk = clerk;

      // Initialize Alpine
      Alpine.data('authApp', () => ({
        email: '',
        user: clerk.user,
        isAuthenticated: !!clerk.user,

        async signIn() {
          await clerk.signIn.create({
            identifier: this.email,
            strategy: 'email_link',
            redirectUrl: window.location.origin
          });
          alert('Check your email!');
        },

        async signOut() {
          await clerk.signOut();
          this.user = null;
          this.isAuthenticated = false;
        }
      }));

      Alpine.start();
    });
  </script>
</body>
</html>
```

---

## References

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk JavaScript SDK](https://clerk.com/docs/references/javascript/overview)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)
- [CouchDB Authentication](https://docs.couchdb.org/en/stable/api/server/authn.html)
- [JWT Standard](https://jwt.io/)

---

**Document Status:** Ready for Review
**Next Steps:** Get stakeholder approval, create implementation tickets
