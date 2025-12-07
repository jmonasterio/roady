# Strict JWT Tenant Propagation

## Objective
Eliminate the reliance on backend API lookups for tenant identification. The system must rely strictly on the JWT to carry the authoritative `active_tenant_id` claim. If the claim is missing, the request must fail with a 401/403 error, forcing the client to obtain a valid token.

## Problem Statement
Currently, when a user switches tenants, the backend updates the Clerk Session Metadata. However, the immediate next JWT issued to the client often lacks this updated metadata due to propagation delays or missing JWT Template configuration.

To mitigate this, the backend currently implements a "fallback" mechanism: if the `active_tenant_id` claim is missing, it performs a synchronous API call to Clerk to fetch the session metadata.

**Issues with current approach:**
1.  **Performance**: The fallback adds significant latency (HTTP round-trip to Clerk) to every request made with a "stale" token.
2.  **Security/Design**: It violates the stateless design principle of JWTs. The token should be the single source of truth.
3.  **Complexity**: It masks the underlying configuration issue (missing JWT claims) and creates two code paths for tenant resolution.

## Requirements

### 1. Clerk Configuration (JWT Template)
The Clerk Dashboard must be configured to inject the `active_tenant_id` from the session metadata into the JWT.

**Template Name**: `roady` (or default)
**Claims Mapping**:
```json
{
  "active_tenant_id": "{{session.public_metadata.active_tenant_id}}",
  "tenant_id": "{{session.public_metadata.active_tenant_id}}"
}
```

### 2. Frontend Changes (`tenant-manager.js`)
The frontend must ensure it requests a token that adheres to the configured template and validates the presence of the claim before making requests.

*   **Token Request**: When calling `window.Clerk.session.getToken()`, it may need to specify the template if not using the default.
*   **Validation**: After refreshing the token, the frontend must decode and inspect it.
    *   If `active_tenant_id` is missing: **Retry** (with backoff) or **Fail**. Do not proceed with a request that is known to be "blind".
    *   The "warning" log should become an "error" that halts the flow.

### 3. Backend Changes (`main.py`)
The backend must enforce strict JWT validation for *data access* endpoints, but must allow tenant selection endpoints to function without a tenant claim.

*   **Remove Fallback**: Delete the call to `clerk_service.get_user_active_tenant` in `extract_tenant`.
*   **Endpoint Exemptions**:
    *   `POST /choose-tenant`: **Exempt**. This endpoint is used to *set* the tenant, so the user cannot possibly have the claim yet. It only requires a valid User JWT.
    *   `GET /my-tenants`: **Exempt**. This lists available tenants for the user.
*   **Strict Enforcement (Data Endpoints)**:
    For all other endpoints (e.g., CouchDB proxy routes):
    ```python
    tenant_id = payload.get("active_tenant_id") or payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Missing tenant_id claim in JWT")
    ```

## Implementation Plan

1.  **Configure Clerk**: User/Admin must manually update Clerk Dashboard settings.
2.  **Update Backend**: Refactor `extract_tenant` to remove the fallback logic.
3.  **Update Frontend**: Enhance `refreshJWTWithTenant` to loop/retry until the claim appears (handling the propagation delay on the client side, where it belongs).

## Success Criteria
*   Backend logs show **zero** occurrences of "relying on backend API lookup".
*   All authenticated requests to `/my-tenants` or CouchDB proxy contain the `active_tenant_id` claim.
*   Switching tenants works reliably without race conditions, even if it takes a few hundred milliseconds longer for the client to get the correct token.
