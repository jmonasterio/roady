# Roady: Virtual Tables Migration Plan

## Overview

Roady currently uses REST API calls to manage users and tenants via MyCouch proxy. With the new virtual tables implementation in MyCouch, we need to update roady to use the new `__users` and `__tenants` virtual endpoints instead of the legacy REST endpoints (`/my-tenants`, `/choose-tenant`).

## Current Architecture

```
Roady (Client)
  ├─ tenant-manager.js
  │   ├─ GET /my-tenants (REST API call)
  │   └─ POST /choose-tenant (REST API call)
  ├─ sync.js
  │   └─ PouchDB sync: POST /roady (equipment/gigs database)
  └─ db.js
      └─ Local equipment/gig management
```

## New Architecture

```
Roady (Client)
  ├─ tenant-manager.js (updated)
  │   ├─ GET /__tenants (virtual endpoint)
  │   ├─ PUT /__users/<id> (virtual endpoint - update active_tenant_id)
  │   └─ GET /__users/_changes (virtual endpoint - monitor for changes)
  ├─ sync.js (no changes needed)
  │   └─ PouchDB sync: POST /roady (unchanged)
  └─ db.js (no changes needed)
      └─ Local equipment/gig management (unchanged)
```

## Changes Required

### 1. tenant-manager.js

**Current Flow:**
```
getMyTenants() → GET /my-tenants (returns { tenants: [...], activeTenantId: ... })
setActiveTenant(tenantId) → POST /choose-tenant (updates Clerk metadata)
```

**New Flow:**
```
getMyTenants() → GET /__tenants (returns tenant list filtered by user membership)
setActiveTenant(tenantId) → PUT /__users/<user_id> (updates active_tenant_id field)
```

**Specific Changes:**

1. **getMyTenants()** (line 72):
   - Change URL from `/my-tenants` to `/__tenants`
   - Response handling changes:
     - Old: `{ tenants: [...], activeTenantId: ... }`
     - New: Array of tenant documents (filter applied server-side)
     - Update: Extract active_tenant_id from JWT instead of response

2. **setActiveTenant()** (line 126):
   - Change URL from `/choose-tenant` to `/__users/<user_id>`
   - Change method from `POST` to `PUT`
   - Change body: `{ tenantId }` → `{ active_tenant_id: tenantId }`
   - Response: No more Clerk metadata update needed; just update local doc
   - Note: Need to get current user_id (from JWT claims)

3. **extractActiveTenantIdFromJWT()** (new helper):
   - Parse JWT to extract `active_tenant_id` claim
   - Use this for activeTenantId instead of getting from API response
   - Used by: initializeTenantContext() and refreshJWTWithTenant()

### 2. sync.js
**No changes required.** PouchDB sync continues to work with `/roady` database.

### 3. db.js
**No changes required.** Local equipment/gig management unchanged.

## Implementation Steps

1. **Add JWT parsing helper** to tenant-manager.js
   - `extractActiveTenantIdFromJWT(jwt)` - Parse JWT payload
   - `extractUserIdFromJWT(jwt)` - Extract user ID (from `sub` claim)

2. **Update getMyTenants()**
   - Use new `/__tenants` endpoint
   - Handle response as array instead of object with `tenants` property
   - Get activeTenantId from JWT instead of response

3. **Update setActiveTenant()**
   - Use new `/__users/<user_id>` endpoint
   - Send `PUT` with `{ active_tenant_id: tenantId }`
   - Get user_id from JWT `sub` claim

4. **Update initializeTenantContext()**
   - Extract user_id from JWT
   - Handle response as array of tenant documents
   - Use JWT to find active tenant instead of response property

5. **Test Flow**
   - User logs in → initializeTenantContext()
   - getMyTenants() returns user's tenants
   - Select personal tenant → setActiveTenant()
   - refreshJWTWithTenant() validates JWT has updated active_tenant_id
   - DB sync continues with authenticated requests

## Error Handling

| Error | Current Handling | New Handling |
|-------|------------------|--------------|
| 401 Unauthorized | JWT expired | Same (refresh JWT) |
| 403 Forbidden | User not member | Try another tenant |
| 404 Tenant Not Found | User has no tenants | Trigger bootstrap |
| 409 Conflict | Revision mismatch | CouchDB error (CouchDB handles) |

## Timeline

- **Start:** When M5 tests are passing
- **Duration:** 1-2 hours
- **Blockers:** None (virtual endpoints already deployed)
- **Depends on:** MyCouch M1-M4 complete ✅

## Testing Checklist

- [ ] User login flow works (getMyTenants returns correct tenants)
- [ ] Tenant selection works (setActiveTenant updates active_tenant_id)
- [ ] JWT refresh includes updated active_tenant_id claim
- [ ] Tenant switching works
- [ ] PouchDB sync continues working
- [ ] Multi-tenant users can switch between tenants
- [ ] Error handling for 401/403/404
- [ ] Soft-deleted tenants are filtered out
