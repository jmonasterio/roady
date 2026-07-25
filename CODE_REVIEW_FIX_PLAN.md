# Code Review Fix Plan — 2026-07-08

Full-codebase bug hunt (7 scoped review passes: db/sync, app bootstrap, domain
logic, bands/tenants, auth/network edge, Alpine bindings, nostr lib). Findings
verified against the working tree and, where marked, against the mycouch-rs
server source. Prioritized by user impact; each item carries file:line and a
confidence estimate from the reviewing pass.

Legend: **[server]** = needs mycouch-rs change, not fixable in roady alone.

**Status (2026-07-08): ALL findings addressed.**

- **Frontend — fixed, verified, DEPLOYED (build `20260704u`):** #1, #2, #3, #5,
  #7, #8, #9, #10, #11, #12, #12b, #13, #14, #15, #16, #17, #18, #19, #20, #21,
  #22, #23, #24, #25, #26, #27, #28, #29, #30, #31, #32, #33, #34, #35, #36,
  #37, #38 (already satisfied by the #22 `Number.isFinite` guard in
  `outboxAck`), #39, #40, #41, #42, #43, #44, #45, #47. Verified: `node --check`
  on every touched file, extended `scripts/setlist-dal.test.js` passing, and a
  live boot smoke-test of the deployed build (Alpine init, no console errors).
- **Server (`mycouch-rs`) — #4 & #6 implemented + verified, NOT deployed.** #4
  (tenant-scoped change feed, fail-closed) was completed by the user's own
  in-progress tree; #6 (self-leave `POST /api/tenants/:tid/leave`, idempotent,
  owner→403) added here. `cargo check` + wasm build + `cargo test -p cf-d1
  -p cf-tenant` (113 pass) all green. Left undeployed because that tree also
  holds unrelated user WIP (R2 attachments, auth-logs) — **the user must deploy
  the mycouch Worker** for #4/#6 to go live. The roady client is wired to the
  exact #6 contract and degrades gracefully until then (leave → router 404 →
  "not available yet", no false local clear; #4 client-side refuse is active
  defense-in-depth against the currently-deployed over-sharing server).
- **#46** (guest key persists in localStorage): reviewed — intended, documented
  design; no change.

---

## P0 — Data loss / tenant isolation

1. **Deletes never reach the server** — `js/sync.js:475-484` (conf 0.92)
   `_drainEntry` sends every outbox entry as PUT and ignores `entry.op ===
   'delete'`; the server PUT path hard-codes `deleted = 0`. Deletes don't
   propagate to other devices, the deleting device's doc count mismatch
   triggers a full auto-heal resync every session, and that resync
   **resurrects the deleted item** on the deleting device.
   Fix: branch on `entry.op` and issue `DELETE /:db/:id` with `ifVersion`.

2. **`/changes` poll fallback destroys local docs & can't bootstrap** —
   `js/sync.js:381-383` (conf 0.9)
   Poll URL omits `include_docs=1`; server then returns `doc: null` for every
   change, which `DB.applyServerChange` treats as an invalidation and
   **hard-deletes the local row**, then advances the cursor past it. Whenever
   the WS doesn't welcome within 5s (flaky mobile network — the norm), every
   bandmate edit since `lastSeq` deletes the corresponding local doc. A fresh
   device with WS blocked syncs to "zero documents, believes it's caught up".
   Fix: append `&include_docs=1`; handle `deleted:true` entries as tombstones
   (see #14).

3. **createBand switches DAL to bare tenant id — new band's data stranded** —
   `js/app.js:2544-2548` (conf 0.95)
   `createBand` passes the **bare** uuid to `switchBand`; everything created in
   the new band is stored/pushed with the unprefixed tenant id. On reload the
   band list only has `tenant_…` ids, so that data is invisible forever.
   In-session symptoms: empty "Switched to " snackbar, members list 400s.
   Fix: pass the internal `tenant_<uuid>` id (`await this.switchBand(internalId)`).

4. **Sync feed is unscoped — every key pulls every band's data** —
   `js/sync.js:120-126` (conf 0.75) **[server]**
   WS `hello` and `/changes` carry no tenant scope; server side is an
   acknowledged "B.6" TODO (`TenantFilter::Any`). Any authenticated Nostr key
   receives the whole deployment's change feed, and the client persists
   foreign-tenant docs into IndexedDB (hidden by `_listByType`, but on disk).
   Fix: server-side membership filtering (B.6); client should also refuse to
   persist docs for tenants it isn't a member of.

## P1 — Broken features / hangs

5. **Refreshed mid-drain writes never sync ("inflight" stranding)** —
   `js/db.js:255-262` (conf 0.95)
   `outboxMarkInflight` flips entries to `inflight`; nothing ever resets them.
   A refresh/tab-kill/iOS-suspend during a drain cycle strands the edit
   locally forever (and the row's `pending` counter suppresses server
   broadcasts for that doc indefinitely).
   Fix: on `Sync.start()`, reset `inflight` → `pending` (safe: duplicate PUT
   just 409s into server-wins).

6. **Leave Band never succeeds for any role** — `js/app.js:3108-3115`
   (conf 0.9) **[server]**
   Server `remove_member` requires manage rights and forbids self/admin/owner
   removal in exactly the combinations Leave Band produces — members get 403
   with a misleading "Owners cannot leave" toast. No leave endpoint exists.
   Fix: server self-removal path (or leave endpoint) + correct client message.

7. **Re-clicked invite link errors on every startup** — `js/app.js:328-336`
   (conf 0.85)
   Server returns **400** for redeemed/expired invites; client only clears the
   sessionStorage token on 404/409/410 (dead branches), so every app start in
   that tab re-sends a signed PATCH and toasts "Server error: 400". Also parses
   `j.detail` but server sends `{message}`, so the real reason never shows.
   Fix: clear token on 400; parse `j.message`.

8. **Undo after deleting a gig from the edit dialog always throws** —
   `js/app.js:1518-1524` (conf 0.95)
   `cancelGigEdit()` nulls `editingGig` before the undo closure is registered;
   the closure reads `this.editingGig._id` at tap time → TypeError, gig not
   restored. Fix: capture `_id` in a local before `cancelGigEdit()`.

9. **Clean-gig template resync silently deletes manually added items** —
   `js/app.js:1604-1613` (conf 0.9)
   Added-to-gig-only items are `checked:false`, so the gig still counts as
   "clean"; the next `viewGigDetail` rebuilds the checklist purely from the
   template and persists the loss — even after the user chose "No, Only This
   Gig". Fix: preserve non-template entries during resync (or count manual
   additions as progress).

10. **Boot hang: default-config boot starts sync before tenant init** —
    `js/app.js:753-757` (conf 0.75)
    With default options (`mycouchBaseUrl: ''`) `loadOptions()` calls
    `saveOptions()`, whose tail calls `enableSync()` — enqueuing the WS
    envelope sign **ahead of** the tenant/bands signs on Auth's serialized
    queue, defeating init's deliberate ordering. With a slow/dead NIP-46
    signer this reproduces the "stuck on Loading" the ordering was written to
    prevent. Fix: gate the `enableSync()` side effect on an `_initDone` flag.

11. **Changing server URL cross-contaminates databases** —
    `js/app.js:823-827` (conf 0.8)
    The URL-switch branch `return`s before `Auth.setMycouchBaseUrl(...)`, so
    sync reconnects to the **old** server while the local Dexie is already
    scoped to the **new** URL: old-server docs written into the new DB, outbox
    drains to the old server until a full reload. Also scopes the DB by
    hashing the raw option string while boot hashes the resolved URL (opens a
    different local DB mid-session vs next boot).
    Fix: set the Auth base first; derive DB scope + sync base from the
    resolved URL.

12. **Fresh device can never catch up past 500 changes** —
    `js/sync.js:241-256` (conf 0.7)
    WS catchup sends one 500-row page with no continuation; `_maybeAutoHeal`
    then rewinds the cursor (`setLastSeq(0)`) and replays the same page —
    converging at ~one page per session, or never. Fix: after a full-limit
    catchup page, run paged `/changes?include_docs=1` pulls to head; never
    rewind the cursor for a pagination shortfall.

12b. **NIP-46 relay hang: `connect()` timeout never drains queued waiters** —
    `js/nostr-universal.js:1033-1039` (conf 0.75)
    When two `connect(url)` calls race the same relay's connecting window, the
    second parks in `relay.queue`, settled only by `onopen`/`onerror`. If the
    connection timeout fires first it sets `failed`, `_safeCloseWs` (detaches
    the ws handlers), deletes the relay, and rejects only the outer promise —
    `relay.queue` waiters hang forever, and the `publish()` awaiting them
    inside `Promise.allSettled` never resolves. Reproduces under an
    offline→online sign burst or NIP-46 restore hitting a slow relay — another
    silent-hang source alongside the signer timeout already fixed. Fix: reject
    and clear `relay.queue` in the timeout handler, matching `onerror`.

## P2 — Corruption edges, races, offline breakage

13. **~30 `showSnackbar(msg, 'error')` callsites render a phantom Undo
    button** — `js/app.js` many sites + `index.html:1474` (conf 0.93)
    Second param is the undo **callback**; passing `'error'`/`'warning'`
    (leftover `(message, type)` signature) makes every error toast show an
    Undo that throws TypeError when tapped. Fix: drop the arg at callsites (or
    add a real `type` param); guard `x-show` on `typeof action === 'function'`.

14. **Server-side deletes hard-delete local rows — no trash on other
    devices** — `js/db.js:335-344` (conf 0.8)
    `applyServerChange` ignores `change.deleted`; tombstone changes fall into
    the invalidation branch and remove the Dexie row (no "Recently Deleted"
    entry, and rows destroyed under queued outbox edits). Fix: write a
    `deleted:1` tombstone when `change.deleted`; only treat `!doc &&
    !deleted` as invalidation.

15. **Stale open checklist reverts bandmates' synced checkmarks** —
    `js/app.js:1629-1641` (conf 0.75)
    Toggles persist the entire stale `selectedGig`; `db-sync-change` never
    refreshes it, and the 3-way merge reads the local row (already containing
    the remote ticks) as `base`, so the stale write "un-checks" the
    bandmate's items. Fix: re-read the gig row before toggle writes.

16. **Checklist resync aliases loadout/loadin item objects** —
    `js/app.js:1610-1612` (conf 0.85)
    Rebuild assigns the same item objects to both lists and keeps the live
    (non-cloned) doc in `selectedGig` — first loadout toggle also flips the
    loadin row and persists both. Fix: per-item clones for the second list.

17. **Removing a member can leave their access fully intact** —
    `js/app.js:2893-2897` (conf 0.85)
    If `_evictMemberKeys` fails (offline / 403), the roster doc is deleted
    anyway: person vanishes from every UI while their keys and tenant
    membership stay authorized, with nothing left to retry from.
    Fix: abort roster deletion when revocation failed.

18. **Leaving/deleting your last band leaves the departed tenant active** —
    `js/app.js:3130-3133` (conf 0.85)
    Zero-bands branch nulls the UI band but not `DB.currentTenant` and never
    clears the arrays: old data stays rendered and new writes go to the
    departed tenant (stranded/forbidden in the outbox). Fix: clear DB tenant +
    empty the collections in that branch.

19. **Parallel WebSockets after drop + option save / band switch** —
    `js/app.js:887-892` + `js/sync.js:183-199` (conf 0.65/0.8)
    `enableSync`'s guard misses `paused`/`error`, `start()` doesn't clear the
    pending reconnect timer, and a stale socket's `onclose` can null the NEW
    socket's handle mid-handshake → 2-3 live sockets, duplicate catchups,
    leaked sockets invisible to `stop()`. Fix: onclose/onerror bail when
    `this.ws !== ws`; make `_connect` a no-op when OPEN/CONNECTING; widen the
    app-side guard.

20. **Offline boot can adopt another account's band** — `js/app.js:449-456`
    (conf 0.7)
    `lastSelectedBandId` is a global key adopted with no membership check —
    account B offline-boots into account A's band; B's offline writes are
    eventually dropped as forbidden. Fix: key per pubkey/userHash and validate
    against the cached band list.

21. **Offline launch dies once the browser HTTP cache expires the CDN
    scripts** — `sw.js:56-63` (conf 0.85)
    Alpine/Dexie/Pico are opaque responses (no `crossorigin`), so the
    `status === 200` guard never caches them; offline boot then loads a dead
    shell. Fix: cache opaque responses for the CDN allowlist, or add
    `crossorigin="anonymous"` to the CDN tags.

22. **Dropped outbox entries freeze the doc's sync forever** —
    `js/sync.js:465-473, 555-560` (conf 0.85)
    Max-attempts and 403 drops delete the outbox entry without decrementing
    the row's `pending`, so `applyServerChange` suppresses server broadcasts
    for that doc indefinitely and the UI keeps showing the rejected body as
    saved. Fix: route drops through an `outboxDrop` that decrements pending
    (and restores server state for the 403 case).

23. **Same-millisecond doc ids silently overwrite** — `js/db.js:386+` (all
    `Date.now()` id mints) (conf 0.85)
    Double-fired add handlers and two devices creating in the same ms collide;
    `_putLocal` turns the second create into an update of the first. Fix:
    append a random suffix (`Date.now() + '_' + crypto.randomUUID().slice(0,8)`).

24. **Quantity-only gig-type edits never propagate to clean gigs** —
    `js/app.js:1604-1609` (conf 0.85)
    Resync compares distinct equipment-ID sets, so 2→3 speakers changes
    nothing. Fix: compare multiset counts (or lengths).

25. **Boot fatal-error surface is doubly dead** — `index.html:77` + `:214`
    (conf 0.88)
    `@init` listens for a DOM event nothing dispatches (Alpine auto-invokes
    `init()` uncaught), and the fatal dialog binds non-reactive
    `window.fatalError` — it can never open. Fix: wrap init internally (or
    `init() { return this._init().catch(e => this.fatalError = e) }` with a
    reactive `fatalError` state field) and bind the dialog to component state.

## P3 — Latent traps, polish, dead code

26. `js/app.js:2048` — `formatRuntime` renders "1h 60m" (round minutes first). (0.9)
27. `js/app.js:1434-1443` — `saveGig` gig-type rebuild doesn't filter
    soft-deleted equipment → permanent "Unknown" rows once gig is dirty. (0.85)
28. `index.html:418` — load-out progress bar `width: NaN%` on empty checklist
    (default first-run gig type); use the guarded pct helper. (0.85)
29. Double-tap guards missing: setlist **Add** (`index.html:968`, duplicates
    song + row) and **Generate Invite Link** (`index.html:1084`, two live
    tokens, revocation ran twice in replace mode). Add busy flags like
    `isCreatingBand`. (0.75)
30. `index.html:1364-1372` — trash pagination strands on empty page after
    restore; clamp page in `restoreDeletedItem`/`loadDeletedItems`. (0.8)
31. Dead code to delete: duplicate no-arg `switchBand()` +`selectTenant()` +
    tenant-selection dialog state (`js/app.js:1186-1215`; the dup key also
    stacks `setupSyncListeners` if ever revived); unreachable Diagnostics
    modal (`index.html:1511`); nav sync-status `<li>` gated on
    migration-deleted `options.couchDbUrl` (`index.html:120`); unloaded
    `js/storage.js` (drifted shim — also remove the SETLIST plan-doc mention). (0.85-0.95)
32. `js/tenant-manager.js:417` — persisted tenant cache not rewritten on
    delete/leave; offline startup resurrects departed bands. (0.8)
33. `js/app.js:300-303` — roster link token only in sessionStorage; tab close
    before roster sync permanently orphans the invitee↔roster binding. (0.75)
34. `js/app.js:2958-2966` — re-inviting the same roster member orphans the
    previous still-redeemable invite token (revoke it or use resend). (0.7)
35. `js/app.js:2727-2745` — Add/Replace-device dialogs default role to
    'member', silently downgrading an admin's replacement key; pre-select the
    member's current role. (0.7)
36. `js/app.js:664-669` — manual Reconnect waits 15s before its first attempt;
    attempt immediately, back off only automatic retries. (0.75)
37. `js/sync.js:167-171` — `lastSeq | 0` truncates the i64 cursor to 32 bits. (0.9)
38. `js/sync.js:520-527` — `outboxAck` adopts `version: undefined` from an
    unparseable 200 → later writes become blind PUTs bypassing optimistic
    concurrency. Treat missing version as retryable. (0.7)
39. `js/db.js:196-205` — `_putLocal` accepts `tenant_id: null` for
    tenant-scoped types; row is excluded from the compound index and invisible
    everywhere. Fail loud instead. (0.65)
40. `js/sync.js:400-410` — poll backoff only counts thrown errors; persistent
    401/5xx re-signs at full 10s cadence. Bump `_pollFailures` on `!res.ok`. (0.8)
41. `sw.js:72-75` — offline nav fallback keys on never-cached `/index.html`;
    use `/` or `ignoreSearch`. (0.85)
42. `sw.js:5-6` — runtime cache unversioned/unevicted; old `?v=` assets pile
    up forever and `/?invite_token=…` URLs persist as cache keys. Version by
    `ROADY_BUILD` + skip caching query-string navigations. (0.8)
43. `js/dlog.js:38-42` — no per-entry size cap; one multi-KB server error body
    can hit the localStorage quota and silently kill log persistence. Truncate
    `msg` to ~500 chars. (0.7)
44. `js/app.js:1683-1702` — `getItemsBrought`/`getItemsNotBrought` index
    `loadoutChecklist[i]` unguarded; a server merge that diverges the two
    array lengths blanks the dialog. Add `?.checked`. (0.4 — speculative)
45. `js/nostr-universal.js:1160-1177` — `publish()` resolves `{ok:true,
    unconfirmed:true}` on a 2s fallback whether or not any relay confirmed, and
    returns the raw `Promise.allSettled` array with no accepted/failed summary.
    Internal callers are fire-and-forget (unaffected); the external contract is
    easy to misuse. Return an explicit accepted/failed summary. (0.5)
46. `js/nostr-universal.js:2173-2189` — guest identity private key stored in
    localStorage plaintext, and `logout()`/`logoutAll()` don't clear it (only
    `clearGuest()` does). Consistent with the documented "persists until
    explicitly cleared" design and common web-nostr practice; no key is ever
    logged or placed in an event (verified). Confirm the residual-guest-key
    behavior is intended. (0.45)
47. `js/nostr-universal.js:884` — `signNip98` JSDoc says `timeout=10000` but the
    default is `60000`. Cosmetic; align doc and code. (0.6)

## Suggested fix order

1. **Sync integrity batch** (#1, #2, #5, #14, #22 — all in sync.js/db.js,
   mutually entangled; fix + test together with `scripts/setlist-dal.test.js`
   extended to cover the outbox lifecycle).
2. **Tenant correctness batch** (#3, #11, #18, #20 — wrong-tenant writes are
   the scariest failure mode after sync).
3. **Quick high-value one-liners** (#7, #8, #10, #13, #23).
4. **Checklist correctness** (#9, #15, #16, #24).
5. **Server-dependent** (#4, #6 — mycouch-rs changes; file there).
6. P3 sweep last.

## Notes

- `js/nostr-universal.js` was reviewed (items 12b, 45-47); the following focus
  areas were verified **clean**: NIP-44 pad/unpad vs spec, NIP-46 `_rpc`
  pending-request lifecycle (no leak), stale/replayed response rejection,
  reconnect resubscribe (filter preserved), relay-map iteration safety, ping
  timer cleanup, NIP-46 response trust model (ECDH + pubkey gate), and NIP-01
  event signing/hashing.
- Already fixed this session (not re-listed): formatDate UTC shift, signMna1
  20s timeout, init loadData guard, stuck-loading banner, setlist template
  picker, gig-setlist Remove placement.
