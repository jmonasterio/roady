# Invite → Role Identity Plan

Durable band identity is the **roster member + role**, not the Nostr key. An
invite grants a role; anyone who redeems an invite tagged to a roster person
*is* that person, with that role — even on a fresh self-generated key, with no
bunker, on a new or replacement device.

## Goals (verbatim intent)

1. **Bunkers optional.** Most members won't run a NIP-46 bunker. Self-generated
   keys must be first-class; a bunker is a nice-to-have graduation, never a
   requirement.
2. **Role survives device loss / multi-device.** No bunker + an invite → you
   have a role. Lose the device (or use a second device) + get *another* invite
   to the same role → you are that role again.
3. **The role lives on.** Anyone holding an invite to a role is known as that
   role, even with only a self-generated key.

## Trust boundary — roster identity is cosmetic (decided)

Two separate axes, and they must stay separate:

- **Authorization** (owner/admin/member) is **server-authoritative**:
  `getCurrentUserRole()` (`app.js:2160`) reads the tenant membership role from
  `/api/my-tenants` (`TenantWithRole`) — never the roster doc. All privileged
  actions gate on this.
- **Roster identity** (`band_member`: name, instrument, `pubkey`, "linked"
  badge) is **client-asserted and cosmetic.** Any member can already edit any
  roster entry via the Band Roster UI by design; `_linkRosterOnAccept` is just
  another such write. `song.lead` is free text, not a pubkey.

**Rule:** never gate authorization or trust on the roster doc. Permissions →
server tenant role. "Who really did X" → server-stamped `updated_by`
(`db.js:213`, set from the MNA1-authenticated request; unspoofable).

Under that rule the spoof blast radius is purely cosmetic (mislabel a
name/instrument, steal a "linked" badge) with zero privilege gain — no
enforcement needed now. **If** roster identity ever becomes load-bearing
(per-person permissions, trust-weighted attribution), harden server-side:
`createInvitation` records `rosterMemberId`, `PATCH /accept` sets the binding,
and `band_member.pubkey`/`userId` become server-managed fields the client can't
write (mycouch-rs change; deferred with the many-keys work).

## Verdict on ninvite / the bech32 recipe

**Do not adopt ninvite.** It carries *Nostr-native* context (pubkeys, relay
hints, group addresses, closed-relay claims) to *generic* Nostr clients. These
goals are about **server-side role membership keyed to a roster person that maps
to many self-generated pubkeys** — orthogonal to ninvite. The current
`https://roady…?invite_token=<token>` link is already the right transport:
clickable from SMS/email/any app, opens roady directly, redeemable on any
device (`app.js parseInviteTokenFromUrl` / `acceptPendingInvitation`).

The one useful idea from that recipe — *generate a key on first visit* — is
**already implemented**: login runs `allowGuestMode: true` + `allowLocalDev:
true` (`index.html:1423`), and guest mode is exactly a self-generated
`LocalSigner` persisted in localStorage (`nostr-universal.js connectGuest`).
Goal 1 is a labeling/UX problem, not a missing capability.

## Current model (grounded)

| Layer | Where | Shape |
|---|---|---|
| Identity | `auth.js:66` | `user_hash = sha256(pubkey)`; auth = per-request signed kind-27235 (MNA1). No tokens. |
| Permission role | `tenant-manager.js:171` `createInvitation(tid,{role})` → `TenantWithRole.role` | `member` / `admin`, enforced server-side via tenant membership. |
| Roster identity | `db.js:608` `band_member` doc `{name, role, createdAt}` + dynamic `pubkey`, `pendingInviteToken`, `email`, `linkedAt`, `userId` | Instrument/role label (e.g. "Lead Guitar"), synced to the whole band. |
| Invite → roster bind | `app.js:2330` sets `pendingInviteToken` on the roster doc; `app.js:2368 _linkRosterOnAccept` sets `target.pubkey = myPubkey` on accept | **Single `pubkey`, overwritten.** |

Two independent "roles" exist and both must persist across keys:
- **Permission role** (member/admin) — gates editing; granted server-side per
  pubkey at accept. Already many-keys-friendly: each pubkey is its own tenant
  member with the invite's role.
- **Roster role** (instrument/identity) — attribution/display; lives in the
  `band_member` doc.

## The blocker

`band_member.pubkey` is **singular** and **overwritten** on link
(`app.js:2377`), and the invite dialog only offers **unlinked** roster members
(`index.html:938`, `.filter(m => !m.pubkey)`). Together these structurally
forbid "same roster person, additional key" — which is precisely goals 2 & 3.

### Device cap (decided)

`pubkeys[]` is stored **ordered oldest-first** (append on accept).
`MAX_DEVICES_PER_MEMBER = 5` (tunable). FIFO, not LRU — evict oldest-*added*
(array front), since true LRU would need per-request activity tracking. The cap
is enforced **admin-side when issuing an Add-device invite** (the admin has
eviction permission; the invitee, a fresh member, does not): if the roster
member is already at the cap, evict the oldest key's **tenant membership**
(`removeMemberByHash`) and drop it from `pubkeys` before generating the invite.
Falling off the list therefore revokes access, not just the roster slot.
**Replace** is unaffected (evicts all). The cap is a backstop against unbounded
accumulation; instant revocation of a lost key is what **Replace** is for.

## Design: one roster member (role) ↔ many pubkeys

### Frontend changes

1. **Roster doc: `pubkey` (string) → `pubkeys` (string[]).**
   - `app.js _linkRosterOnAccept`: **append** the accepting pubkey instead of
     overwrite. De-dupe. Keep `linkedAt` as first-link; add per-key entries if
     device labels are wanted later.
     ```js
     const set = new Set(target.pubkeys || (target.pubkey ? [target.pubkey] : []));
     set.add(myPubkey);
     target.pubkeys = [...set];
     target.userIds = [...new Set([...(target.userIds||[]), `user_${userHash}`])];
     delete target.pubkey; // migrate legacy singular
     delete target.pendingInviteToken;
     ```
   - Read migration: anywhere that reads `member.pubkey`, treat legacy singular
     as `[pubkey]`. Central helper `memberPubkeys(m)`.

2. **"Am I this roster member?" match becomes set membership.**
   - Everywhere comparing `member.pubkey === myPubkey` → `memberPubkeys(member).includes(myPubkey)`.
   - "linked" badge (`index.html:1095`) and "invite pending" logic:
     linked when `pubkeys.length > 0`.

3. **Allow re-inviting an already-linked roster member.**
   - Invite dialog roster dropdown (`index.html:935-941`): drop the
     `!m.pubkey` filter, or split into two groups — "Unlinked" and
     "Add another device / re-invite (linked)". This is what makes goals 2 & 3
     reachable from the UI.
   - `pendingInviteToken` must coexist with a populated `pubkeys` (recovery /
     second-device invite while already linked).

4. **Login copy (goal 1).** Reframe "Guest Mode" as the default self-serve
   identity for invited members ("Create my key — no app needed"), not a
   throwaway. Immediately after a self-generated key redeems an invite, surface
   a **backup + reconnect** affordance (see caveats) so device loss is a
   re-invite, not a silent lockout.

### Backend touchpoints — [INFERENCE], verify before implementing

Backend is mycouch-rs (Rust, CF Workers), not the Python paths in the old
`roady-amp/INVITATION_ACCEPTANCE_FLOW.md`. Confirm in:
- `mycouch-rs/workers/mycouch/src/routes_tenant.rs` — `POST
  /api/tenants/{tid}/invitations`, `PATCH /api/invitations/accept`.
- `mycouch-rs/crates/cf-tenant/src/types.rs` — Tenant / TenantWithRole.

Verify / ensure:
- **Accept grants the redeeming pubkey's `user_hash` the invite's role,
  regardless of prior membership** (a brand-new self-generated key must become a
  member on first authenticated request). The Python-era flow did this
  unconditionally; confirm the Rust accept path does too.
- **Invites are single-use** (token → accepted). Multi-device / recovery issues
  a *new* token each time — do **not** try to reuse one token across keys.
- **Re-invite to a tenant you're already in** currently 409s ("already a
  member"). For a *different* pubkey that is *not* yet a member, accept must
  succeed. Confirm the 409 keys on `user_hash`, not on the roster person.

### Two invite flows — additive vs. replace

"Lost device" and "another device" are **different cases with different
buttons**, distinguished by what happens to the member's *existing* keys:

| Button | Case | Effect on old keys | Result |
|---|---|---|---|
| **Add a device** | Member wants a 2nd/3rd active device | **Kept** | `pubkeys` accumulates; every key is a live member with the role. |
| **Replace lost device** | Device lost/stolen; key unrecoverable | **All revoked** | Old `user_hash`es evicted from the tenant; `pubkeys` reset to just the new key. |
| **Remove (left band)** | Member has left the band | **All revoked** | Same eviction as Replace, **minus** the re-invite; roster doc deleted. |

Both issue a fresh single-use invite tagged to the same roster member; the
difference is a flag on the invite/flow and the cleanup performed.

**Add a device** (additive):
- `_linkRosterOnAccept` appends the new pubkey (the base design above). No
  eviction. Old devices keep working.

**Replace lost device** (destructive, admin action in the Members list):
1. For the roster member, enumerate current keys `memberPubkeys(m)` → for each,
   `user_${sha256(pubkey)}`, and **evict each from the tenant** so the lost
   device can no longer act.
2. **Clear** the roster doc: `pubkeys = []`, set a fresh `pendingInviteToken`.
3. `createInvitation` (mark it a replace/reset invite) → new link.
4. Member accepts on a new self-generated key → appended as the **sole** key,
   re-granted the role.

**Remove member — left band** (destructive, no re-invite):
1. Evict **every** `user_hash` in the member's `pubkeys` from the tenant (same
   loop as Replace step 1).
2. Delete the roster doc (`deleteBandMember`, `app.js:2275`).

This is just Replace without steps 2b–4. All three flows share one eviction
primitive: *evict all of a roster member's hashes from the tenant.*

Eviction gaps to close (both real changes):
- `tenant-manager.js:208 removeMember` removes **only self** (`user_${this.currentUserHash}`).
  Needs a variant `removeMember(tenantId, userHash)` taking an explicit target
  so an admin can evict a lost device's hash.
- Client can only compute `user_hash` for self today (`auth.js` `_sha256Hex` is
  module-local). Expose a `sha256Hex(pubkey)` helper to hash arbitrary member
  pubkeys for eviction.
- Only **admins/owners** may run Replace (it evicts others). Gate the button on
  the caller's tenant role.

## Does removing the role prevent login? — No.

**Login is keypair-only and fully decoupled from band membership.** Auth is
MNA1: `isAuthenticated()` = `!!getActivePubkey()` (`auth.js:47`), and every
request is signed by the user's key (kind-27235). Authentication proves "I hold
this keypair" — it consults no tenant, role, or roster. So removing a person's
role/membership **cannot** stop them logging into roady; it only removes their
**access to that band's data** (their signed requests to that tenant are
rejected once the `user_hash` is evicted).

Edge case — it was their *only* band: `tenant-manager.js init()` auto-mints a
fresh personal tenant when the server returns an empty list, so they still land
in a usable app, just without the band you removed them from. No lockout path.

**Correctness gap to fix:** the roster (`band_member` docs, `bandMembers`) and
tenant membership (`currentBandMembers`, keyed by `user_<hash>`) are **two
separate lists** joined only by the invite→roster pubkey binding. Deleting the
*role* alone (`deleteBandMember`) tombstones the name card but **leaves the
person's pubkey(s) authorized** on the band — they can still read/write. A real
departure MUST do both: evict all their `user_hash`es *and* delete the roster
doc. Today `removeMember` (`app.js:2440`) evicts a single `member.userId`; in
the many-keys model it must iterate all of the member's pubkeys.

## Explicit non-goal / honest caveat

Self-generated keys have **no cryptographic recovery**. "Recover with an invite"
means **regain the role with a new key**, not resurrect the old key. In the
**Add a device** flow a lost key stays valid until someone runs **Replace**;
that's why Replace exists and evicts eagerly. Optionally surface an nsec backup
(NIP-49) or bunker-migration prompt for members who want key continuity without
re-invites — but neither is required to meet goals 1–3.

## Guest → bunker on-ramp — DEFERRED

> Deferred by decision: guest → nostr/bunker *migration* (nsec export, bunker
> graduation, same-key import) is out of scope for this pass. Onboarding *into* a
> guest key on invite (goal 1) stays in scope. Detail retained below.

A guest login is a `LocalSigner`; its key is in `localStorage[..._guest]` and
`getNsec()` (`nostr-universal.js:1355`) exposes it. nostr-universal only
*connects to* an existing bunker (`connectBunker`, `:2003`) — it never
provisions a key into one — and roady surfaces no nsec-export UI today. Two ways
out, neither a dead end:

- **Export-free (preferred), via the many-keys model:** user creates a fresh,
  never-exposed key in a bunker → admin issues an **Add a device** invite for
  the same roster member → user accepts with the bunker identity → optionally
  **Replace** to evict the old guest key. No secret ever leaves a browser; role
  continuity holds because the anchor is the roster member, not the key. This is
  the payoff of the many-keys design and needs no new crypto.
- **Same-key migration:** reveal the guest nsec → import into nsec.app/Amber →
  reconnect via `bunker://`. Same pubkey → same `user_hash` → roles preserved.
  Needs a "Back up / export my key" affordance (not present); note the key was
  already browser-exposed, so this is portability, not pristine security.

## Change checklist

- [ ] `band_member`: `pubkey` → `pubkeys[]`, with legacy-read migration helper.
- [ ] `_linkRosterOnAccept`: append + de-dupe instead of overwrite (`app.js:2377`).
- [ ] All `member.pubkey ===` comparisons → set membership.
- [ ] "linked" / "invite pending" UI keyed on `pubkeys.length` (`index.html:1095-1098`).
- [ ] Invite dialog: allow re-inviting linked roster members (`index.html:935`).
- [ ] **Invite-aware login** (goal 1): `NostrLoginUI` is decoupled from the invite token — `loginUI.start()` (`nostr-universal.js:3434`) never reads it and only auto-connects a *saved* session. When `sessionStorage.pendingInviteToken` exists and there's no saved session, lead the card with a primary "Accept invite — create your key" button (→ `auth.connectGuest()`) and demote signer options to "I already have a Nostr signer." Drop the "Just trying things out?" wording for invited members. Seam: pass the token into the UI or read `sessionStorage` in `start()`.
- [ ] Post-accept backup/reconnect nudge for self-generated keys.
- [ ] (Optional) "Back up / export my key" (nsec, ideally NIP-49) on the connected card — enables same-key bunker migration (path A).
- [ ] Verify backend accept grants role to any new pubkey; 409 keys on user_hash (mycouch-rs).
- [ ] `removeMember(tenantId, userHash)` — explicit target, callable per hash (`app.js:2440`, `tenant-manager.js:208`).
- [ ] Expose `sha256Hex(pubkey)` helper to hash arbitrary member pubkeys (`auth.js`).
- [ ] **Add a device** button — additive re-invite to a linked roster member.
- [ ] **Replace lost device** button (admin) — evict all hashes + re-invite.
- [ ] **Remove (left band)** button — evict all hashes + delete roster doc.
- [ ] Gate Replace/Remove on caller's admin/owner role.
