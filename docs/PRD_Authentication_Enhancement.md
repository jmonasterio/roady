# Roady Authentication & Multi-Tenant Enhancement PRD

**Version:** 1.0
**Date:** 2025-01-10
**Author:** Claude Code
**Status:** Draft

## Executive Summary

### Problem Statement
Roady currently has basic Clerk authentication but lacks integration with MyCouch's powerful tenant management system. Users can only manually select tenants, which limits collaboration features and creates a suboptimal user experience for multi-band scenarios.

### Solution Overview
Implement seamless multi-tenant experience by leveraging MyCouch's existing backend infrastructure. This will enable proper band collaboration with automatic tenant detection, intuitive tenant switching, and a complete invite system.

### Business Impact
- **Enhanced User Experience:** Automatic tenant detection eliminates manual configuration
- **Improved Collaboration:** Multi-band support with proper data isolation
- **Scalable Architecture:** Leverages existing MyCouch backend capabilities
- **Future-Ready:** Foundation for advanced features like role-based access

## Current State Analysis

### MyCouch Backend Capabilities ✅
The MyCouch proxy provides a comprehensive authentication and tenant management foundation:

**Authentication & Security:**
- ✅ Clerk JWT validation with RS256 cryptography
- ✅ JWKS caching for performance optimization
- ✅ Multi-app routing based on JWT issuer (roady vs couch-sitter)
- ✅ Automatic tenant extraction from JWT claims
- ✅ Session metadata management via Clerk Backend API

**Tenant Management APIs:**
- ✅ `GET /my-tenants` - List user's accessible tenants
- ✅ `POST /choose-tenant` - Set active tenant in session metadata
- ✅ `GET /active-tenant` - Get current active tenant with fallback logic
- ✅ Automatic personal tenant creation for new users
- ✅ User caching with TTL (5 minutes) for performance

**Data Isolation:**
- ✅ Automatic tenant ID injection in all CouchDB documents
- ✅ Response filtering to prevent cross-tenant data leakage
- ✅ Query rewriting for tenant-specific data retrieval
- ✅ Application-aware tenant enforcement (roady vs couch-sitter)

### Roady Frontend Current State ❌

**Authentication:**
- ✅ Basic Clerk sign-in/sign-out functionality
- ✅ JWT token handling and storage
- ✅ Automatic token inclusion in CouchDB requests
- ✅ PouchDB integration with sync capabilities

**Missing Integrations:**
- ❌ No integration with MyCouch tenant management APIs
- ❌ Manual tenant selection only (`DB.setTenant()` method)
- ❌ No automatic tenant detection from JWT
- ❌ Missing tenant switching UI components
- ❌ No invite system implementation
- ❌ Single-tenant user experience

**Architecture Gaps:**
- Frontend doesn't consume MyCouch's powerful tenant APIs
- No UI components for multi-tenant management
- Missing user flows for tenant invitation and acceptance
- No band collaboration features

**Two-Level Hierarchy:**
The system supports a two-level organization structure:
1. **Tenant Level**: Account/user context that can contain multiple bands
2. **Band Level**: Specific music projects within a tenant
- Users first select their tenant (if multiple)
- Then select which band to work on within that tenant
- This allows for complex scenarios like a producer managing multiple artist portfolios

## User Stories & Requirements

### Epic 1: Seamless Tenant Management

#### User Story 1.1: Automatic Tenant Detection
**As a** Roady user
**I want** the app to automatically detect my active band/tenant when I sign in
**So that** I don't have to manually configure my band context

#### User Story 1.2: Tenant Switching
**As a** Roady user with multiple tenant accounts
**I want** to easily switch between my different tenants
**So that** I can access bands and projects from different contexts

#### User Story 1.3: Band Selection Within Tenant
**As a** Roady user within a tenant
**I want** to select which band to work on
**So that** I can manage multiple music projects within the same tenant context

#### User Story 1.4: Tenant Management
**As a** Roady user
**I want** to see all my bands and their member information
**So that** I can understand my collaboration context

### Epic 2: Multi-Band Collaboration

#### User Story 2.1: Band Member Overview
**As a** band member
**I want** to see all members in my current band
**So that** I know who I'm collaborating with

#### User Story 2.2: Cross-Band Navigation
**As a** user in multiple bands
**I want** quick navigation between my different bands
**So that** I can efficiently manage multiple projects

### Epic 3: Invite System Implementation

#### User Story 3.1: Create Invitations
**As a** band owner
**I want** to invite collaborators to my band
**So that** I can grow my team efficiently

#### User Story 3.2: Accept Invitations
**As a** invited user
**I want** to easily accept band invitations
**So that** I can join new collaborations quickly

#### User Story 3.3: Cross-Tenant Band Access
**As a** band member invited to someone else's tenant
**I want** to access all bands within that tenant context
**So that** I can collaborate effectively across the tenant's band portfolio

**⚠️ Security Consideration:**
**Note:** When a user is invited to join a band in someone else's personal tenant, they will gain visibility to ALL bands within that tenant. This creates potential privacy implications where invited collaborators can see the tenant's entire band portfolio. Future iterations may need to implement band-level invitations or visibility controls to address this concern.

## Critical Authentication Flow

### Foundational Login Flow: Clerk → Tenant Detection → JWT Update → CouchDB

This is the **most critical flow** that must be implemented first before any other features:

#### Flow Sequence:
1. **Clerk Login Detection**: App detects user is signed in with Clerk
2. **Get All Tenants**: Call `/my-tenants` to get user's accessible tenants
3. **Select First Tenant**: Pick the first tenant (user's personal tenant initially)
4. **Set Active Tenant**: Call `/choose-tenant` to set active tenant in Clerk session metadata
5. **JWT Metadata Update**: Clerk updates JWT with new tenant metadata
6. **JWT Refresh**: Frontend reloads JWT to get updated tenant claims
7. **CouchDB Integration**: All requests now include tenant info via MyCouch proxy

#### Technical Implementation Details:

**Step 1: Clerk Authentication Bridge**
```javascript
// In app initialization (index.html or main app)
window.addEventListener('load', async function() {
    await Clerk.load();

    if (Clerk.isSignedIn) {
        // CRITICAL: Initialize tenant detection after Clerk loads
        await initializeTenantContext();
        initializeApp();
    } else {
        showSignInUI();
    }
});
```

**Step 2: Tenant Detection and Selection**
```javascript
// New tenant management service
class TenantManager {
    constructor() {
        this.mycouchBaseUrl = 'http://localhost:5985'; // MyCouch proxy
    }

    async initializeTenantContext() {
        try {
            // Step 2a: Get all user's tenants
            const tenantList = await this.getMyTenants();

            // Step 2b: Select first tenant (personal tenant initially)
            const firstTenant = tenantList.tenants[0];
            if (!firstTenant) {
                throw new Error('No tenants found for user');
            }

            console.log(`Selected tenant: ${firstTenant.name} (${firstTenant.tenantId})`);

            // Step 2c: Set active tenant in Clerk session metadata
            await this.setActiveTenant(firstTenant.tenantId);

            // Step 2d: Trigger JWT metadata refresh
            await this.refreshJWTWithTenant();

            return firstTenant;
        } catch (error) {
            console.error('Failed to initialize tenant context:', error);
            throw error;
        }
    }

    async getMyTenants() {
        const jwt = await window.Clerk.session.getToken();
        const response = await fetch(`${this.mycouchBaseUrl}/my-tenants`, {
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get tenants: ${response.status}`);
        }

        return await response.json();
    }

    async setActiveTenant(tenantId) {
        const jwt = await window.Clerk.session.getToken();
        const response = await fetch(`${this.mycouchBaseUrl}/choose-tenant`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tenantId })
        });

        if (!response.ok) {
            throw new Error(`Failed to set active tenant: ${response.status}`);
        }

        return await response.json();
    }

    async refreshJWTWithTenant() {
        // Force Clerk to refresh the JWT with updated metadata
        // This updates the JWT claims to include the selected tenant
        try {
            // Clerk automatically refreshes JWT when requested after metadata update
            const refreshedToken = await window.Clerk.session.getToken();
            console.log('JWT refreshed with tenant metadata:',
                        refreshedToken ? 'Success' : 'Failed');
            return refreshedToken;
        } catch (error) {
            console.error('Failed to refresh JWT:', error);
            throw error;
        }
    }
}
```

**Step 3: Update PouchDB/CouchDB Integration**
```javascript
// Update DB.js to use MyCouch proxy and ensure tenant flow
const DB = {
    // ... existing code

    // Update database initialization to use MyCouch proxy
    async initializeDatabase() {
        const dbName = 'roady'; // Database name
        const mycouchUrl = 'http://localhost:5985'; // MyCouch proxy, not direct CouchDB

        this.db = new PouchDB(`${mycouchUrl}/${dbName}`, {
            // Ensure JWT tokens flow through MyCouch for tenant validation
            fetch: this.createAuthenticatedFetch.bind(this)
        });

        console.log('Database initialized through MyCouch proxy');
    },

    // Enhanced fetch with proper JWT token handling
    createAuthenticatedFetch: async (url, opts) => {
        const jwt = await this.getClerkToken();
        if (jwt) {
            const newOpts = {
                ...opts,
                headers: {
                    ...opts.headers,
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                }
            };

            console.log('Making authenticated request through MyCouch:', url);
            return fetch(url, newOpts);
        } else {
            console.warn('No JWT token available for request:', url);
            throw new Error('Authentication required for database operations');
        }
    }
};
```

**Step 4: App Initialization Flow**
```javascript
// Main app initialization with proper sequencing
async function initializeApp() {
    try {
        console.log('Initializing Roady app...');

        // Step 4a: Initialize tenant context (CRITICAL - must happen first)
        const tenantManager = new TenantManager();
        await tenantManager.initializeTenantContext();

        // Step 4b: Initialize database with tenant-aware connection
        await DB.initializeDatabase();

        // Step 4c: Load tenant-specific data
        await loadTenantData();

        // Step 4d: Start sync with proper tenant isolation
        await DB.startSync();

        console.log('App initialization complete');
        showMainUI();

    } catch (error) {
        console.error('App initialization failed:', error);
        showErrorState(error.message);
    }
}
```

## Technical Implementation Plan

### Phase 1: Critical Authentication Implementation (Week 1)

**Priority 1: Authentication State Bridge (Days 1-2)**
- Connect Clerk `isSignedIn` state to app initialization
- Implement `TenantManager` service for tenant detection
- Add error handling for authentication failures

**Priority 2: MyCouch Integration (Days 2-3)**
- Configure Roady to use MyCouch proxy (`localhost:5985`)
- Update PouchDB sync to route through MyCouch
- Verify JWT token flow through proxy

**Priority 3: Tenant Detection Flow (Days 3-4)**
- Implement `/my-tenants` API call to get user's tenant list
- Implement tenant selection logic (pick first tenant)
- Implement `/choose-tenant` metadata update
- Add JWT refresh mechanism

**Priority 4: Testing & Validation (Day 5)**
- Verify tenant isolation works correctly
- Test DB sync with tenant enforcement
- Validate user sees correct data for their tenant

### Phase 2: API Integration (Week 1-2)

**Backend Requirements:**
- ✅ All required MyCouch APIs already implemented
- ✅ JWT validation and tenant extraction working
- ✅ Data isolation mechanisms in place

**Frontend Implementation:**
```typescript
// New services to implement:
class TenantService {
  async getMyTenants(): Promise<Tenant[]>
  async chooseTenant(tenantId: string): Promise<void>
  async getActiveTenant(): Promise<Tenant>
}

class InviteService {
  async createInvite(data: InviteRequest): Promise<Invite>
  async acceptInvite(token: string): Promise<void>
  async getInvites(): Promise<Invite[]>
}
```

### Phase 2: Multi-Tenant UI Components (Week 2-3)

**Component Architecture:**
```typescript
// New React components:
<TenantPicker />      // Tenant selection dropdown
<TenantSwitcher />    // Quick tenant switcher
<TenantManager />     // Full tenant management screen
<BandSelector />      // Band selection within current tenant
<BandSwitcher />      // Quick band switcher within tenant
<InviteManager />     // Invitation handling interface
<MemberList />        // Band member overview
```

### Phase 3: Invite System (Week 3-4)

**New MyCouch Endpoints:**
```python
# Extend MyCouch with invite APIs:
POST /api/invite/make     # Create tenant invitation
GET  /api/invite/list     # List invitations (sent/received)
POST /api/invite/accept   # Accept invitation
DELETE /api/invite/revoke # Revoke invitation
```

## Database Schema Extensions

### Invitation Document Schema
```javascript
{
  "_id": "invite:uuid-123",
  "type": "invite",
  "tenant_id": "band-123",
  "inviter_sub": "user_456",
  "invitee_email": "paul@example.com",
  "role": "member",
  "status": "pending",
  "token": "token-abc-456",
  "expires_at": "2025-01-17T00:00:00Z",
  "created_at": "2025-01-10T00:00:00Z"
}
```

## Security & Authorization

### Tenant Isolation Verification

**Data Access Controls:**
- All CouchDB requests automatically include tenant_id filtering
- Response filtering prevents cross-tenant data leakage
- Query rewriting ensures tenant-specific data retrieval

**Authorization Levels:**
```typescript
enum TenantRole {
  OWNER = 'owner',      // Full control, can invite/remove members
  MEMBER = 'member',    // Read/write access to tenant data
  VIEWER = 'viewer'     // Read-only access to tenant data
}
```

## Testing Strategy

### Unit Testing

**Frontend Components:**
```typescript
describe('TenantPicker', () => {
  it('displays all user tenants')
  it('highlights current active tenant')
  it('handles tenant switching')
})

describe('InviteManager', () => {
  it('creates invitations with correct role')
  it('validates email addresses')
  it('handles invitation expiration')
})
```

### Integration Testing

**End-to-End User Flows:**
1. **Sign-up Flow:** New user registration → personal tenant creation → band invitation acceptance
2. **Tenant Switching:** Active tenant selection → data context update → UI refresh
3. **Invitation Flow:** Invite creation → email delivery → acceptance → member addition

## Implementation Timeline

### Week 1: Foundation
- **Day 1-2:** Set up project structure and dependencies
- **Day 3-4:** Implement TenantService API integration
- **Day 5:** Add tenant detection to app initialization

### Week 2: Core UI
- **Day 1-2:** Build TenantPicker and TenantSwitcher components
- **Day 3-4:** Implement tenant management screens
- **Day 5:** Add tenant context to navigation

### Week 3: Invite System
- **Day 1-2:** Implement MyCouch invite API endpoints
- **Day 3-4:** Build invite creation and acceptance flows
- **Day 5:** Add invitation management interface

### Week 4: Polish & Testing
- **Day 1-2:** Comprehensive testing and bug fixes
- **Day 3-4:** Performance optimization and caching
- **Day 5:** Documentation and deployment preparation

## Success Metrics

### User Experience Metrics
- **Time to First Tenant Switch:** < 2 seconds
- **Invitation Acceptance Rate:** > 80%
- **Daily Active Users:** Increase by 25%

### Technical Metrics
- **API Response Time:** < 200ms for tenant operations
- **Cache Hit Rate:** > 90% for tenant information
- **Zero Security Incidents:** Tenant isolation maintained 100%

## Conclusion

This PRD outlines a comprehensive enhancement to Roady's authentication and multi-tenant capabilities. By leveraging MyCouch's powerful backend infrastructure, we can deliver a seamless collaboration experience that scales with user needs.

The phased implementation approach ensures incremental value delivery while maintaining system stability. The focus on security, performance, and user experience will create a foundation for future growth and feature development.