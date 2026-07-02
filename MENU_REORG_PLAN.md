# Menu Reorganization Plan — Gigs · Gear · Music · Band

Reorganize navigation around one mental model per tab, kill the scope-mixing
(account vs band vs device), the double "Templates" naming collision, and the
brand text wasting top-bar space.

## Target

```
┌─────────────────────────────────┐
│ The Blue Notes ▾        ● 🧑    │  ← band switcher (no "Roady" brand text)
├─────────────────────────────────┤
│ [view content]                  │
├─────────────────────────────────┤
│  Gigs   Gear   Music   Band     │  ← bottom tabs (mobile) / top links (desktop)
└─────────────────────────────────┘
```

| Destination | Contents | Source pages absorbed |
|---|---|---|
| **Gigs** | unchanged | — |
| **Gear** | tabs: Catalog · **Gig Types** (renamed from "Templates") | Equipment |
| **Music** | tabs: Songs · Set Lists | Set List |
| **Band** | Members (roster/devices/invites) · Band info (rename) · Sync · Profile · Leave/Delete band · Sign out | Members, Settings, parts of Bands, More |
| **Top-bar switcher** | band list + checkmark + "+ Create band" (bottom sheet) | Bands page (deleted) |

**Deleted pages**: Bands, More, standalone Members, standalone Settings.
**`currentView` values after**: `gigs | equipment | setlists | band` (+ `bandTab`).

## Phase 1 — Band switcher (top bar)

1. `index.html:58-96` top bar:
   - Drop the `Roady` brand `<strong>` (mobile AND desktop; PWA icon/splash and
     the login screen carry branding).
   - Band name: bold body-color **button** (not link-blue anchor). Delete the
     pencil icon (rename moves to Band page).
   - **Single band (common case): no chevron, no switcher** — the name is a
     plain title; tap goes to the Band page. Chevron `▾` + switcher sheet only
     appear when `userBands.length > 1`. "Create band" always lives on the
     Band page.
2. Band-switcher sheet (multi-band only): Alpine `showBandSwitcher`. Rows =
   `userBands` — **name + checkmark only, no role/member details** →
   `switchBand(id)`; footer "+ Create band" → existing `openCreateBandDialog()`.
3. CSS: `.band-switcher` sheet styles (reuse `dialog` full-screen infra or a
   small anchored panel; safe-area bottom padding).

## Phase 2 — Band hub page

1. New view `currentView === 'band'` with `bandTab: 'members' | 'info' | 'app'`
   (same tab-row pattern as Music/Gear):
   - **Members** tab: move the entire Members view markup wholesale
     (`index.html:919-1045`) — roster list, invite dialog, generated-link
     dialog. Do not rewrite; it's the most complex flow in the app.
   - **Info** tab: band rename (from Settings→My Band), member count, leave
     band, delete band (`openDeleteBandConfirmationForBand`, from Bands page).
   - **App** tab: sync settings + diagnostics (from Settings), profile block +
     Sign out (from More).
2. Promote `bandTab` to root Alpine state (the current nested
   `x-data="{ settingsTab: 'myband' }"` on the Settings div shadows root scope —
   the top-bar pencil already writes `settingsTab` into root where the settings
   view can't see it; this merge fixes that latent bug).

## Phase 3 — Navigation swap + deletions

1. Bottom tabs → `Gigs · Gear · Music · Band` (icons: calendar / box / note /
   people). Remove More tab; `Band` active for `currentView === 'band'`.
2. Desktop `.nav-links` → same four links.
3. Delete views: Bands (`index.html:529`), More (`:568`), standalone Members,
   standalone Settings — after their contents land in Phase 2.
4. Rewire every `currentView` write (all in `index.html` except
   `app.js:982` reset — verified by grep): top-bar pencil target, More-list
   buttons (gone), any dialog close targets.

## Phase 4 — Renames + copy audit

1. Gear page: `<h2>Gear</h2>`, tabs **Catalog · Gig Types** — resolves the
   Templates/Templates collision and matches `docs/terminology.md` ("gig type",
   never "gig template").
2. Music page: `<h2>Music</h2>`, tabs **Songs · Set Lists**.
3. Copy audit: gigs empty-state ("go to Settings to add equipment" — stale),
   snackbars, invite message, create-gig dialog labels referencing "template".
4. `docs/terminology.md`: update UI Locations (Gear page → Catalog/Gig Types
   tab; Music page → Songs/Set Lists tab), remove the "rename pending" note,
   update Top Bar / Bottom Tab Bar / More entries (More dies).

## Phase 5 — Verification

1. `node scripts/check-directives.js` (all Alpine expressions compile).
2. Browser at 390×844: every destination reachable ≤2 taps; switcher opens,
   switches, creates; Band tabs work; invite-link flow smoke test.
3. Desktop 1280px: four links + switcher; no bottom bar.
4. Commit left to user (per AGENTS.md); deploy on request.

## Risks

- **Members markup move** is the riskiest diff — move verbatim, then re-run the
  directive checker; the invite dialogs reference ~15 Alpine state fields.
- **Deleted `currentView` values**: `'members'|'settings'|'bands'|'more'` must
  not survive anywhere (grep after Phase 3); a stale write would show a blank
  main area.
- **Band deletion/leave** currently lives on Bands-page cards; ensure both
  actions exist on Band→Info before deleting the page, or bands become
  unleavable.
- No routing/persistence migration needed: `currentView` is in-memory only,
  resets to `gigs` on load; invite-accept URL flow doesn't reference views.
