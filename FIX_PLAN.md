# Data Model Fix Plan

## Current Issues

1. **ID Format Mismatch**: Tenant documents store Clerk user IDs (e.g., `user_34tzJwWB3jaQT6ZKPqZIQoJwsmz`) in `userId` and `userIds` instead of database IDs (e.g., `user_{hash}`)
2. **Missing User Documents**: No `user_xxx` documents exist in couch-sitter - users are created with wrong format
3. **Missing Tenants in Roady**: Only seeing 1 tenant instead of 2 because the new created tenant isn't in user's `tenantIds` list
4. **Auth Middleware Returns Wrong Format**: Returns `user_id = f"user_{sub}"` but downstream code expects the hashed format

## Root Cause Analysis

### User Document Creation
- **Current**: `user_{hash(sub)}` format is created correctly in `create_user_with_personal_tenant_multi_tenant()`
- **Actual**: User document in DB shows `user_user_34...` format
- **Implication**: Either old users were created differently, or auth_middleware is being used inconsistently

### Tenant Creation
- **Current**: `create_workspace_tenant()` receives `user_id = f"user_{sub}"` from auth_middleware
- **Issue**: Should receive `user_id = user_{hash(sub)}` (the database ID, not Clerk ID)
- **Result**: Tenant stores wrong format in `userId` and `userIds`

### User's Tenant List
- When querying `/my-tenants`, the backend calls `get_user_tenants(sub)` which:
  1. Hashes the sub
  2. Looks up user by hash
  3. Returns `tenantIds` array
- **Problem**: New tenant wasn't added to `tenantIds` because user lookup failed due to ID format mismatch

## Fix Strategy

### Phase 1: Ensure Consistent User IDs

**In MyCouch `auth_middleware.py`:**
- Change `user_id` format from `f"user_{sub}"` to a way that works with existing data
- Two options:
  1. Keep `user_id = f"user_{sub}"` but make all lookups handle both formats ✓ (current approach)
  2. Always hash in middleware and return `user_id = f"user_{hash(sub)}"`

**Decision**: Option 1 - handle both formats (more flexible, backward compatible)
- Already partially done with the try/except lookup fix
- Need to ensure this works throughout the codebase

### Phase 2: Fix Tenant Document Creation

**In MyCouch `tenant_routes.py` POST `/api/tenants`:**
- Don't pass raw `user_id` from auth_middleware
- Instead, do one of:
  1. Look up actual user document and use its `_id` ✓
  2. Pass both the `sub` claim and let service figure out the right ID
  3. Have auth_middleware return both formats

**Decision**: Look up the user document first to get the correct `_id`

**Changes needed**:
```python
# In tenant_routes.py create_tenant():
user_id = current_user.get("user_id")  # This is the format from middleware
sub = current_user.get("sub")          # Add this

# In create_workspace_tenant(), store BOTH:
# - userId: the database user doc ID
# - userIds: array of database user doc IDs
# NOT the Clerk user IDs
```

### Phase 3: Ensure User Document Exists

**When auth_middleware is called:**
- If user doesn't exist, ensure it's created
- Ensure creation uses correct ID format
- Add better error handling

**In auth_middleware or extract_tenant:**
- Call `ensure_user_exists()` if not found
- Return the actual user document `_id`

### Phase 4: Verify Band List Works End-to-End

**Flow**:
1. User creates band → POST `/api/tenants`
2. Backend stores correct user IDs in tenant `userIds`
3. Backend adds tenant to user's `tenantIds` list
4. Frontend calls GET `/my-tenants`
5. Backend returns all user's tenants
6. Frontend sees both personal + new bands

## Implementation Order

1. **Audit existing data**: Check what format existing user/tenant docs have
2. **Fix auth_middleware**: Ensure it returns/provides both formats of user ID
3. **Fix tenant creation**: Store correct database IDs in tenant documents
4. **Fix user lookup**: Handle both old and new user ID formats
5. **Test full flow**: Create band → see in list → switch to it
6. **Migration (optional)**: Fix existing data if needed

## Data Format Standards

Going forward:
- **User documents**: `_id: user_{sub_hash}`, contains `sub: "{Clerk sub}"`
- **Tenant documents**: `userId: "user_{sub_hash}"`, `userIds: ["user_{sub_hash}", ...]`
- **Equipment/Gigs**: `tenant: "tenant_xyz"` (tenant ID, not user ID)
- **Never store Clerk IDs** in tenant/user relationship fields

## Questions to Resolve

1. Why does existing user doc show `user_user_34...` format?
   - Was it created by old code that didn't hash?
   - Do we need to migrate existing data?

2. Should we create users on-demand in auth_middleware or expect them to exist?
   - Current: Created via `ensure_user_exists()` on first JWT validation
   - Should we also create on band creation?

3. What's the actual production user count?
   - Can we afford to recreate/migrate all users?
