# Tenant Isolation & Access Control PRD

## Overview

Add two security constraints to prevent cross-tenant data contamination and enforce consistency:

1. **Tenant Creation Requires Online API** - No local-first for tenants, must call backend
2. **Tenant Field Validation** - All documents must belong to user's authorized tenants

## Constraint 1: Tenant Creation via API Only

### Requirement

Users cannot create tenants locally. Tenant creation requires:
- Online connection to MyCouch
- API call to `/api/tenants` endpoint
- Server validation and assignment

### Implementation

#### Client (Roady)

**File:** `js/app.js`

```javascript
// Before: Could create tenant locally
// await DB.saveBandInfo({ name: "Blue Notes", tenantId: "..." });

// After: Must call API
async createBand() {
    if (!this.options.mycouchBaseUrl) {
        this.showSnackbar('Must be online to create a band', 'error');
        return;
    }
    
    const token = await Clerk.session?.getToken();
    const response = await fetch(`${this.options.mycouchBaseUrl}/api/tenants`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: this.newBandName
        })
    });
    
    if (!response.ok) {
        this.showSnackbar('Failed to create band', 'error');
        return;
    }
    
    const tenant = await response.json();
    // Now we have server-assigned tenantId
    this.currentBandTenantId = tenant._id;
    DB.setTenant(tenant._id);
    
    // Pull in the new tenant via sync
    await this.refreshTenantsFromSync();
    this.showSnackbar(`Band "${tenant.name}" created`);
}
```

#### Server (MyCouch)

**File:** `tenant_routes.py` - Already exists! Just clarify:

```python
@router.post("/api/tenants")
async def create_tenant(
    request_data: Dict[str, Any] = Body(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create a new tenant (band).
    
    CONSTRAINT: Only works online. User must have valid JWT.
    Server assigns tenantId and validates user.
    
    Returns: Tenant document with server-assigned _id
    """
    name = request_data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Tenant name required")
    
    # Server generates and assigns tenant ID
    tenant = await couch_sitter_service.create_workspace_tenant(
        user_id=current_user.get("user_id"),
        name=name,
        application_id=current_user.get("application_id", "roady")
    )
    
    return {
        "_id": tenant.get("_id"),
        "name": tenant.get("name"),
        "userId": tenant.get("userId"),
        "createdAt": tenant.get("createdAt")
    }
```

### Benefits

- ✅ No orphaned local tenants
- ✅ Server assigns unique IDs
- ✅ User must be online to join a band
- ✅ Clear tenant ownership

---

## Constraint 2: Tenant Field Validation

### Requirement

Every document written to app databases (roady-staging, roady) must:
1. Include a `tenant` field
2. That `tenant` value must belong to the authenticated user
3. Server validates on every write (PUT, POST, _bulk_docs, DELETE)

### Implementation

#### Server Middleware (MyCouch)

**File:** `main.py` - Add document validation middleware

```python
from fastapi import Request, HTTPException
import json

async def validate_tenant_access_middleware(request: Request, call_next):
    """
    Validate that documents being written belong to user's authorized tenants.
    
    Enforces: Every doc in app DB must have tenant field matching user's tenants.
    """
    
    # Only validate writes to app databases
    if not is_app_database(request.url.path):
        return await call_next(request)
    
    if request.method not in ['PUT', 'POST']:
        return await call_next(request)
    
    # Get authenticated user
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user = decode_jwt(token)  # From auth_middleware
    except:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    user_id = user.get('user_id')
    user_tenants = await get_user_tenant_ids(user_id)  # From couch-sitter
    
    # Read request body
    body = await request.body()
    
    try:
        # Handle bulk docs
        if '_bulk_docs' in request.url.path:
            data = json.loads(body)
            for doc in data.get('docs', []):
                validate_doc_tenant(doc, user_tenants, user_id)
        else:
            # Single document
            doc = json.loads(body)
            validate_doc_tenant(doc, user_tenants, user_id)
    except TenantAccessError as e:
        raise HTTPException(status_code=403, detail=str(e))
    
    # Continue with request
    return await call_next(request)

def validate_doc_tenant(doc: Dict, user_tenants: List[str], user_id: str):
    """
    Validate document has allowed tenant field.
    
    Rules:
    1. Document must have 'tenant' field
    2. 'tenant' value must be in user's authorized tenants
    3. User-specific docs (band-info) should have tenant matching context
    """
    
    # Special case: band-info documents
    if doc.get('type') == 'band-info':
        # Format: band-info_{tenantId}
        doc_id = doc.get('_id', '')
        if doc_id.startswith('band-info_'):
            tenant_id = doc_id.split('_', 1)[1]
            if tenant_id not in user_tenants:
                raise TenantAccessError(
                    f"Cannot create band-info for tenant you don't own"
                )
        return
    
    # All other documents must have explicit 'tenant' field
    tenant_id = doc.get('tenant')
    
    if not tenant_id:
        raise TenantAccessError(
            f"Document missing required 'tenant' field. "
            f"Must belong to one of: {user_tenants}"
        )
    
    if tenant_id not in user_tenants:
        raise TenantAccessError(
            f"Cannot write to tenant '{tenant_id}'. "
            f"You only have access to: {user_tenants}"
        )
    
    logger.info(f"✅ Document validation passed: user={user_id}, tenant={tenant_id}")

class TenantAccessError(Exception):
    """Raised when document tenant doesn't match user's access"""
    pass

def get_user_tenant_ids(user_id: str) -> List[str]:
    """Get all tenant IDs user owns or is member of"""
    # Query couch-sitter for user's tenants
    # Returns: ['tenant_uuid1', 'tenant_uuid2', ...]
    pass

def is_app_database(path: str) -> bool:
    """Check if request targets an app database (not couch-sitter)"""
    return 'roady' in path or 'booking' in path or 'inventory' in path
```

#### Client (Roady)

**File:** `js/db.js` - Ensure tenant field is set

```javascript
async addGig(gig, gigType) {
    // ... existing code ...
    
    const doc = {
        _id: 'gig_' + Date.now(),
        type: 'gig',
        tenant: this.currentTenant,  // ← REQUIRED
        name: gig.name,
        // ... rest of fields
    };
    
    return await this.db.put(doc);
}

async addEquipment(item) {
    const doc = {
        _id: 'equipment_' + Date.now(),
        type: 'equipment',
        tenant: this.currentTenant,  // ← REQUIRED
        name: item.name,
        // ... rest of fields
    };
    
    return await this.db.put(doc);
}
```

### Error Handling

When validation fails, server returns 403:

```javascript
// Client receives
{
    error: 403,
    detail: "Cannot write to tenant 'abc123'. You only have access to: ['xyz789']"
}
```

Client can catch and inform user:

```javascript
try {
    await DB.addGig(gig, gigType);
} catch (err) {
    if (err.status === 403) {
        this.showSnackbar('Access denied: cannot create gig for this band', 'error');
    }
}
```

---

## Architecture Diagram

```
User Action (Create Gig)
    ↓
1. Client validates: currentTenant is set
2. Client adds to local DB with tenant field
3. PouchDB syncs document
    ↓
4. MyCouch receives PUT request
5. Middleware extracts JWT
6. Validates: user owns tenant_id
7. If valid → document saved
8. If invalid → 403 Forbidden returned
    ↓
Result: Document in server DB
        OR
        Sync error (document rejected)
```

## Testing Plan

### Test Case 1: Tenant Creation API

```javascript
// ✅ Successful creation
POST /api/tenants
{ "name": "Blue Notes" }
→ 200 { "_id": "tenant_uuid", "name": "Blue Notes" }

// ❌ Offline
POST /api/tenants (no network)
→ Network error
→ User sees "Must be online to create band"

// ❌ No JWT
POST /api/tenants
→ 401 Unauthorized
```

### Test Case 2: Tenant Field Validation

```javascript
// ✅ Valid write
PUT /roady-staging/gig_123
{ "type": "gig", "tenant": "tenant_xyz", ... }
User owns "tenant_xyz"
→ 200 OK

// ❌ Missing tenant field
PUT /roady-staging/gig_123
{ "type": "gig", ... }  // No tenant field
→ 403 Forbidden "Document missing required 'tenant' field"

// ❌ User doesn't own tenant
PUT /roady-staging/gig_123
{ "type": "gig", "tenant": "tenant_other", ... }
User owns: ["tenant_xyz"]
→ 403 Forbidden "Cannot write to tenant 'tenant_other'"

// ✅ Bulk docs with multiple tenants
POST /roady-staging/_bulk_docs
{ "docs": [
    { "type": "gig", "tenant": "tenant_xyz", ... },  ✅
    { "type": "gig", "tenant": "tenant_xyz", ... }   ✅
] }
→ 200 OK (all docs valid)

// ❌ Bulk docs with one invalid
POST /roady-staging/_bulk_docs
{ "docs": [
    { "type": "gig", "tenant": "tenant_xyz", ... },  ✅
    { "type": "gig", "tenant": "tenant_other", ... } ❌
] }
→ 403 Forbidden (reject entire bulk op)
```

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `js/app.js` | createBand() must use API | HIGH |
| `js/db.js` | All docs include tenant field | HIGH |
| `tenant_routes.py` | Already has POST /api/tenants | - |
| `main.py` | Add validation middleware | HIGH |
| `DESIGN.md` | Document these constraints | MEDIUM |

---

## Rollout Plan

1. **Phase 1**: Deploy middleware to MyCouch (non-breaking)
   - Validates but logs errors instead of rejecting
   - Client still works offline
   
2. **Phase 2**: Update client to use API for tenant creation
   - Test thoroughly
   - Users must go online to create bands
   
3. **Phase 3**: Enforce validation
   - Middleware now returns 403 on invalid tenant
   - All existing documents should be valid by now

---

## Benefits

✅ **Security**: Users can't accidentally write to another user's data  
✅ **Consistency**: Server enforces data ownership rules  
✅ **Simplicity**: No local tenant creation complexity  
✅ **Conflict Prevention**: No orphaned local tenants  
✅ **Audit Trail**: All mutations go through API validation  

