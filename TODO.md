Got it. I’ll clean up the entire document and ensure it’s valid Markdown throughout, with proper code blocks, headings, lists, and spacing. Here’s the corrected version:

````markdown
# TODO / Implementation Plan

This document organizes the multi-tenant design, admin features, and future roadmap for Roady in an implementation-oriented order.

---

## 1. Core Tenant System

### 1.1 User Signup & Personal Tenant
Here’s a concise rewrite of **Step 1.1** using the database check for new signup vs login:

---

## Step 1.1: User Signup & Personal Tenant

1. **User logs in via Clerk PWA**

   * Clerk issues a JWT containing `sub` (user ID).

2. **Backend receives JWT**

   * Extract `sub` from JWT.
   * Query **user collection** in CouchDB.

     * **No user or tenant document** → treat as **new signup**.
     * **User document exists** → treat as **login** (skip tenant creation).

3. **New Signup Flow**

   * Create a personal tenant document:

     ```json
     {
       "_id": "tenant_<uuid>",
       "name": "<User's Personal Tenant>",
       "appId": "roady",
       "metadata": {"createdBy": "user_<sub>", "createdAt": "..."},
       "userIds": ["user_<sub>"]
     }
     ```
   * Add the tenant to the user document:

     ```json
     {
       "_id": "user_<sub>",
       "email": "...",
       "tenants": [{"tenantId": "tenant_<uuid>", "role": "owner", "personal": true}],
       "metadata": {...},
       "createdAt": "..."
     }
     ```

4. **Update Clerk session metadata**

   * Set `active_tenant` to personal tenant via Clerk API.
   * Frontend reloads session to receive updated JWT.

5. **Login Flow**

   * If user exists, backend returns current tenants without creating a new one.
   * `active_tenant` is already stored in Clerk session or updated if switching tenants.

---

* Personal tenant is **always present** and cannot be removed.
* JWT `active_tenant` is the **source of truth** for backend tenant scoping.


### 1.2 Invites
- Send invite code linking to an invite document (`/api/invite/make`):

```json
{
  "expir": "...",
  "invited_to_tenant_id": "target tenant",
  "target_app": "roady"
}
````

* Accept invite via `/api/invite/accept?id=xxx` → adds current user ID to the tenant.
* Backend validates membership and updates references.

---

## 2. Multi-Tenant Support

### 2.1 Clerk Authentication

* Users log in via Clerk PWA.
* JWT contains `sub` (user ID) and optional metadata.

### 2.2 Tenant Lookup

* Backend exposes `GET /my-tenants`.
* Returns list of tenants the user belongs to.
* Frontend uses this list to show tenant picker.

### 2.3 Active Tenant Selection

* Frontend calls `POST /choose-tenant` with selected tenant ID.
* Backend validates membership and updates Clerk session metadata (`active_tenant`) via Clerk API.
* Frontend reloads session to get JWT reflecting the active tenant.

### 2.4 Session & Backend Enforcement

* JWT includes `active_tenant`.
* Proxy inspects JWT on every request.
* Inject `active_tenant` into CouchDB queries.
* Backend rejects requests missing `active_tenant` or outside tenant membership.

---

## 3. Security Principles

* `active_tenant` in JWT is trusted only if issued by Clerk (server-updated metadata).
* Frontend cannot assign tenants arbitrarily.
* All backend actions are scoped to `active_tenant`.

---

## 4. Admin PWA & mycouch-admin App

### 4.1 Admin Capabilities

* View all tenants and users.
* Add users to tenants.
* Tenant admins can invite users.
* Access proxied Fauxton with proper role checks.

### 4.2 Admin Database

* Read/write access only by backend; Roady users cannot access directly.
* Contains:

  * Apps (`roady`, `admin`, etc.)
  * Tenants
  * User IDs
  * User-to-tenant mappings

### 4.3 mycouch-admin Clerk App

* Restricted signup to allowed domains.
* JWT audience (`aud`) and issuer (`iss`) validated by backend.
* Allows access to tenants DB and admin features.

---

## 5. Proxy Enforcement

### 5.1 DB Routing

* Apps cannot write to unauthorized databases.
* Single proxy instance routes based on JWT issuer:

```python
ISSUER_TO_DATABASE = {
    "https://roady.clerk.accounts.dev": "roady",
    "https://booking.clerk.accounts.dev": "admin",
}
```

### 5.2 Enforcement Rules

* Validate target DB against allowed DB per issuer.
* Reject any CouchDB proxy request missing `active_tenant`.
* Ignore frontend-sent DB or tenant IDs.

### 5.3 Benefits

* Single proxy, single port, single domain.
* Automatic DB routing per Clerk app.
* Centralized configuration.

### 5.4 Example `.env`

```
CLERK_ISSUER_URL=https://roady.clerk.accounts.dev,https://booking.clerk.accounts.dev
PROXY_PORT=5985
ENABLE_TENANT_MODE=true
TENANT_CLAIM=org_id
```

---

## 6. CouchDB Schema: Users with Tenant References

### 6.1 Users

Each user document contains basic user info and a list of tenant memberships, referencing tenant documents:

```json
{
  "_id": "user_<uuid>",
  "email": "jane@example.com",
  "name": "Jane Doe",
  "tenants": [
    { "tenantId": "tenant_personal", "role": "owner", "personal": true },
    { "tenantId": "tenant_band1", "role": "member", "personal": false }
  ],
  "metadata": { "phone": "...", "profilePic": "..." },
  "createdAt": "2025-11-07T14:00:00Z"
}
```

* `tenants` references tenant documents.
* `personal: true` marks permanent personal tenant.
* Backend validates membership via `tenants` array.

### 6.2 Tenants

```json
{
  "_id": "tenant_band1",
  "name": "The Blue Notes",
  "appId": "roady",
  "metadata": { "plan": "pro", "createdBy": "user_<uuid>", "createdAt": "..." },
  "userIds": ["user_123", "user_456"]
}
```

* `userIds` optional; used for admin queries or invitation validation.

### 6.3 Access Patterns

1. Fetch tenants for user → backend reads user doc → returns tenant list.
2. Switch active tenant → backend validates → updates Clerk session → frontend reloads JWT.
3. Backend enforces `active_tenant` on all reads/writes; rejects missing or invalid tenant.

---

## 7. Advantages of This Model

* Efficient user-centric queries for tenant picker.
* Centralized tenant documents for admin operations.
* Personal tenant always present, immutable, enforced via JWT.
* Avoids join tables; CouchDB-friendly.
* Extensible metadata for future features.

---

## 8. Future Features (Roadmap)

### 8.1 CouchDB Sync

* Bidirectional sync, offline queue, conflict resolution.
* Manual sync, authentication, statistics.

### 8.2 Stage Plots

* Visual stage diagrams, drag-and-drop, templates.

### 8.3 Set Lists

* Song management, ordering, duration, notes, gig links.

### 8.4 Print Functionality

* Load-out/check-in/out checklists.
* Stage plots, set lists.
* Print-friendly styling.

### 8.5 Communication

* SMS/text messaging, arrival/soundcheck notifications.

### 8.6 Equipment Ownership

* Track who brings items, member-specific checklists.

### 8.7 Band/Organization Management

* Band selector, members/roles, permissions, invitations.

### 8.8 Multi-Band Gigs

* Track band order, set times, shared equipment.

### 8.9 Lost/Missing Equipment

* Track lost/replacement items, link to gigs.

### 8.10 Enhanced Checklist States

* Enum-based states with visual indicators and statistics.

---

## 9. Implementation Notes

* Stage plots: Canvas/SVG, mobile-friendly, exportable.
* Set lists: text initially, add reordering/tracking.
* Print: CSS `@media print`, hide UI, optional QR code.
* Communication: backend service, logging, opt-in/out.
* Equipment: assign ownership, per-member checklists.
* Band management: `bandId` field, roles (admin/member/view-only).
* Multi-band gigs: drag-and-drop band order, set times.
* Lost equipment: status field, link to gig, reorder workflow.
* Checklist states: string/enum, color coding, summary stats.

---

## 10. Enforcement Principles / Concerns

1. JWT `active_tenant` is the source of truth.
2. Backend must validate tenant membership on every request.
3. Admin-only features require correct JWT audience/issuer.
4. Frontend reads tenant list from backend; cannot send raw IDs.
5. **Backend must reject any CouchDB proxy call missing `active_tenant`.**
6. All reads/writes must filter using `active_tenant` to prevent cross-tenant access.

```

This version keeps all sections properly in Markdown format, with headings, subheadings, lists, and code blocks consistently applied.  

If you want, I can also **reorder the Future Features section to match priority for incremental implementation**. That would make this a clean step-by-step roadmap.
```
