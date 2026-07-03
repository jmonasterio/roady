# roady — Workshop Web design spec (LOCKED SPINE): "THE ROAD CASE"

This is the authoritative spine for roady's visual-design guide. Every section
of the full guide (`visual-design.md`) derives from this doc and MUST use these
exact tokens, hexes, class names, vocabulary, and component mappings. Do not
invent alternates; do not add tokens the CSS does not already define. Source
aesthetic: Tom Sachs / Van Neistat "Workshop Web" (gaffer tape, stencils, NASA
hardware, knolling, label-everything) — ported into a **dark flight-case /
backstage** variant, "THE ROAD CASE." App: roady = a DIY band's gigs / gear /
songs / set-list PWA (Pico CSS v2 classless + Alpine 3 + Dexie, no build step,
MNA1 nostr auth, offline-first, phone-first). The flight-case layer is appended
last in `css/styles.css` under the header `FLIGHT-CASE DESIGN SYSTEM — "THE ROAD
CASE"`; it wins the cascade over the legacy rules above it.

## LOCKED DECISIONS
- Deliverable relationship: this spine is LOCKED. `visual-design.md` is the full
  LOOK guide and extends this doc; it never overrides a token or restyles a
  class away from what `css/styles.css` already implements.
- **DARK ONLY.** Page/base is `--stage-black`; surfaces are `--case-black`;
  heavier panels are `--tolex`. Structure and text are light `--aluminum`, which
  reads as the aluminum edging of a road case. **The only light surface is
  `--setlist-paper #F4F1E8`, and it is PRINT / PDF ONLY.** Under `@media print`
  the Performance View is forced to `#fff`/`#000` (a clean black-on-white sheet)
  and `nav`/`main` are hidden; the on-screen `.performance-view` **stays dark**
  (`--stage-black` / `--aluminum`). A performer on a dark stage never gets a
  white screen. Never describe a light on-screen app surface.
- **`--cue-green #33D17A` is the PRIMARY accent** — "GO / touch this / patched
  in." It is `--pico-primary`, link color, active tab/nav fill, progress fill,
  checkbox accent, and the GO stamp. Accent metaphor is a mixing-console /
  lighting board: green = signal-present/GO, red = live/stop, amber = nearing
  clip/caution, blue = phantom/focus.
- **No hover, press-only.** There is no `@media (hover:hover)` layer. The only
  interaction feedback is the press: `:active` translates the control
  `translate(2px,2px)` and drops its block-shadow — mechanically pressed into
  the case. Never spec a hover-dependent affordance. Keyboard focus keeps a 3px
  `--patch-blue` `focus-visible` ring. **Respect `prefers-reduced-motion`:** the
  reduce block removes the transition and the translate (press cue via shadow
  removal only).
- **Band-centric, small scale.** Users are a DIY band — one roadie or a small
  van tour, not a pro road crew or big production. Keep the band's own plain
  nouns (Gigs, Gear, Music, Band, Set List, Load-in / Load-out, Songs); stencil
  them in CSS, do not rename them into touring-crew jargon. Use stage vocabulary
  only where `docs/terminology.md` already does (load-in / load-out, set list,
  gig, band, strike).
- **Full cutover.** The flight-case layer replaces the old ad-hoc dark Pico
  theme; the legacy rules are retired by cascade, not kept as a fallback. No
  shims, no light-theme branch.
- Google Fonts CDN is allowed (condensed display + mono body + marker), with
  system fallbacks.
- Intensity = deliberate middle. Always: hard 2px borders, square corners
  (`--radius:0`), 8px knolling grid, mono labels, uppercase stencils, console
  accent only where an action or alert lives. Sparingly: 1–2 gaffer-tape /
  stamp / hazard-stripe flourishes per screen. Never a texture pile-up.

## PALETTE (verbatim hexes — use these variable names)
Materials — backgrounds / surfaces / structure (the 80% + 15%):
  `--stage-black #0E0E10` (page bg — the dark stage; not pure `#000`) ;
  `--case-black #17171A` (content surfaces: `.gig-item`, `.equipment-item`,
  cards, modals) ; `--tolex #202024` (heavier panels: `.top-nav`, tab rack,
  bottom-nav) ; `--input-bg #1D1D21` (form fields, progress track) ;
  `--aluminum #E4E2DC` (text, borders, stencils, structure — case edging; warm
  off-white, not `#FFF`) ; `--gaffer-gray #8A8A82` (secondary/muted text,
  disabled, struck) ; `--case-edge #34343A` (subtle borders / dividers,
  `--pico-border-color`).
Console accents — actions / alerts (the 5%):
  `--cue-green #33D17A` (PRIMARY action: buttons/links/active tab — "GO") ;
  `--live-red #FF3B30` (errors, MISSING, delete/strike, sync fault — the live
  light) ; `--standby-amber #FFB000` (caution: incomplete/syncing/soon) ;
  `--patch-blue #2E7DD1` (secondary / focus ring / active form border) ;
  `--hazard #F2C230` (hazard-stripe banner, `mark` highlight).
Print paper — PRINT / PDF ONLY:
  `--setlist-paper #F4F1E8` (white setlist sheet; screen stays dark).
Rules: **80% materials / 15% aluminum structure / 5% console accent.** No
gradients. No pure `#000` or `#FFF` on-screen. `--radius:0` (square corners),
hard 2px `--border`, 8px `--unit` grid. **Two documented gradient exceptions:**
the `.hazard-stripe` (45° hazard/black repeating stripe) and the ONE permitted
glow — the sync/status LED soft ring. If a screen glows anywhere else, pull
accents back to aluminum structure.

### roady status→stamp color mapping (LOCKED — idle/healthy wears no paint; only actions & problems get accent)
- MISSING / left-behind / error  → `.badge-missing`  → block: `--live-red` fill, `--aluminum` text ("stop").
- INCOMPLETE / syncing / soon     → `.badge-standby`  → caution stamp: `--standby-amber` fill, `--stage-black` text.
- PACKED / GO / ready             → `.badge-go`       → GO stamp: `--cue-green` fill, `--stage-black` text.
- IDLE / upcoming / neutral       → `.badge-idle`     → neutral plate, NO paint: `--case-black` fill + 2px `--aluminum` border, `--aluminum` text.
- STRUCK / past / no data         → `.badge-struck`   → muted plate: `--gaffer-gray` fill, `--stage-black` text.
Badge shape = rectangular DYMO/stamp: `--radius:0`, 2px `--border`, `--font-body`
11px, letter-spacing `.08em`, UPPERCASE, weight 600. Green doubles as the
positive terminal state (PACKED/GO) because it is also the primary "GO" accent —
action and success share the color coherently.
Sync LED (`.sync-dot`) reuses the same signal colors and is the one place a glow
is allowed: `.sync-paused` = `--cue-green` + 6px green glow (connected);
`.sync-active` = `--standby-amber` + amber glow (syncing); `.sync-error` =
`--live-red` + red glow (fault); `.sync-idle` = flat `--gaffer-gray` (no glow);
`.has-errors` adds a 3px red ring.

## TYPOGRAPHY (LOCKED choices)
- Display / headlines: `Oswald` (condensed grotesque), weights 500/600/700, ALL
  CAPS, tight tracking. Token `--font-display`; fallback
  `'Oswald','Archivo Narrow',system-ui,sans-serif`.
- Body / labels / data: `IBM Plex Mono` (field-manual feel), weights 400/500/600.
  Token `--font-body`; fallback
  `'IBM Plex Mono','Courier Prime',ui-monospace,'Cascadia Mono',monospace`.
  This is also `--pico-font-family`.
- Sharpie note: `Permanent Marker`. Token `--font-note`; fallback `cursive`.
  Used ONLY for gaffer-tape labels / margin notes — **max 1–2 per screen.** The
  canonical (and typically only) use is `.band-name` on the tape strip.
- Google Fonts embed — the exact `<link>` set now in `index.html <head>`, before
  `styles.css`:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Permanent+Marker&display=swap" rel="stylesheet">
  ```
- Headlines ALL CAPS Oswald (`h1–h6` uppercase, letter-spacing `.01em`); body
  sentence-case mono; labels UPPERCASE MONO, letter-spacing `.06–.08em`, 11–12px.
  Underlines = flat rule via `border-bottom:var(--border)` / `main h2`, never a
  thin browser default. Emphasis = `--hazard` `mark` highlight or `--live-red`
  text, never italics.
- Dates in engineering format: `2026.07.03` or `03 JUL 2026`. Never `7/3/26`.
- Number sections `00, 01, 02 …` (Sachs numbers everything).

## VOCABULARY MAP (LOCKED — light touch, band's own words; keyed to `docs/terminology.md`)
Rule: keep the real app noun, stencil it, annotate sparingly. Only stage terms
already in `terminology.md` get promoted. No invented big-production jargon.
- Top bar (`.top-nav`) → riveted **case ID panel**; band label left, sync LED + avatar right. Band name is the label, not a "SHOP MANUAL" wordmark.
- Band switcher (`.band-switcher-btn` / `.band-name`) → band name on a **gaffer-tape strip** (`--font-note`, rotated −1.5°); ▾ chevron only when multi-band. The one Permanent-Marker flourish per screen. (`terminology.md#band`, `#band-switcher`.)
- Gigs view (`#gigs`) → section head "01 · GIGS"; keep the app's word **GIGS**.
- Gig card (`.gig-item`) → flight-case **SHOW card**: corner `GIG` plate + DATE stamp (`03 JUL 2026`), venue in mono, packed-count stamp. `.past-gig` → muted / `STRUCK` (replaces the "(Past)" text).
- Load-out / Load-in ("To Gig" / "From Gig") → **LOAD-OUT / LOAD-IN** checklists; NASA-checklist clipboard, big square check rows. These ARE the terms (`terminology.md`).
- Checklist progress (`.checklist-progress`) → `X/Y` **PACKED / LOADED** stamp + hard progress bar.
- Items not brought (`.section-heading-missing`) → `--live-red` **CHECK** heading; items brought (`.section-heading-loaded`) → `--cue-green` **PACKED** heading. (Align to badge tokens; drop ad-hoc hexes.)
- Gear view (`.equipment-item`, tabs) → section "02 · GEAR"; items = **manifest line items**. Catalog tab = the inventory; Gig Types tab = **KIT** presets (band word for "gig type").
- Music view (Songs / Set Lists tabs) → **MUSIC**; Songs = **repertoire** rows with key/BPM/duration as data-plate figures; Set Lists = the book.
- Set List + Performance View → **SET LIST** / **STAGE VIEW**: the signature screen, kept DARK (`--stage-black`, big `--aluminum` song text, `--cue-green` section rules). White paper only when printed. (`terminology.md#performance-view`.)
- Band view (Members / Info / Options / Trash) → **BAND**; Members = **band roster** (`NAME · INSTRUMENT`, e.g. "Anna · drums"); Trash = **STRUCK**. Roster is band members, not hired crew.
- Invitation / device key → plain **INVITE** / device ("Add a device," "Invite member"). Keep `terminology.md` wording; no pass/laminate metaphor.
- Sync dot (`.sync-dot`) → **signal LED** (green connected / amber syncing / red error), maps 1:1 to existing `.sync-paused/.sync-active/.sync-error/.sync-idle`.
- Snackbar → **talkback cue** line (styling only). Login overlay (`#nostr-login-overlay`) → dark backdrop + chrome only (card owned by `nostr-universal.js`). Footer / Options bottom → case-stencil **DATA PLATE** (SERIAL npub, BUILD, VERSION, `ROADY`).

## roady COMPONENT INVENTORY (real elements the guide MUST map, with current class names)
Every element exists in `index.html` today; the re-skin is CSS + label text +
small motif markup — Alpine logic untouched.
- `.top-nav` (bg `--tolex`, 2px bottom border) with `.nav-brand` / `.band-switcher-btn` / `.band-name` → case ID panel; band name on the gaffer-tape strip; ▾ multi-band.
- `.nav-links` a (desktop) + `.bottom-nav` (mobile, phone-primary) → tool-rack nav. Active link = `--cue-green` (`nav a.active`); active bottom-nav button = `--cue-green` text + inset 3px green top rule. No hover.
- `.sync-dot` (`.sync-paused` / `.sync-active` / `.sync-error` / `.sync-idle` / `.has-errors`) → 12px square **signal LED** with the one permitted glow.
- `.tab-buttons` (Gear / Music / Band sub-tabs) → one bordered **tool rack**: `--tolex` bg, 2px `--aluminum` dividers between slots (`border-right`), no gaps, uppercase mono, ≥44px; active slot = `--cue-green` block on `--stage-black` text.
- `.gig-item` (+ `.past-gig`) → flight-case SHOW card: `--case-black`, 2px border, `GIG` corner plate (`::before`), `:active` press; `.past-gig` = `opacity:.55` + `· STRUCK` suffix.
- `.equipment-item` → manifest line item: `--case-black`, 2px border, Oswald title (gear / gig types / songs / set-list templates / trash all reuse it).
- `.checklist-progress` / `.progress-bar` / `.progress-bar-fill` → hard PACKED progress: square, `--input-bg` track, `--cue-green` fill, no radius.
- `.check-row` / `.check-box` (`.is-checked`) → NASA-checklist rows; checked box tints `--cue-green`.
- `.badge` + `.badge-missing` / `.badge-standby` / `.badge-go` / `.badge-idle` / `.badge-struck` → console status stamps (see mapping above).
- `.hazard-stripe` → offline / queued banner: 45° `--hazard`/`--stage-black` gaffer hazard stripe under a dark scrim, 2px border, uppercase mono.
- `<dialog>` modals (`.dialog-body`, footer Cancel / Save) → NASA-checklist forms: `--case-black` surface, labels above fields, neutral Cancel / green Save.
- `.empty-state` → stencil plate: 2px border on `--case-black`, `--gaffer-gray` uppercase mono ("NO UPCOMING GIGS," etc.).
- `.performance-view` / `.performance-section` → Stage View: **DARK** on-screen (`--stage-black` / `--aluminum`, `--cue-green` section rules); switched to `#fff`/`#000` only under `@media print`.
- Buttons (`button`, `[role="button"]`, submit/reset) → flat fill, square, uppercase mono, press-only (`:active` translate + shadow drop); `.secondary` = transparent + aluminum border; `focus-visible` = 3px `--patch-blue`.

## CSS TOKEN SHEET (LOCKED base — the guide's token section extends this, verbatim from `css/styles.css`)
```css
:root {
  /* materials */
  --stage-black:#0E0E10; --case-black:#17171A; --tolex:#202024;
  --input-bg:#1D1D21; --aluminum:#E4E2DC; --gaffer-gray:#8A8A82; --case-edge:#34343A;
  /* console accents */
  --cue-green:#33D17A; --live-red:#FF3B30; --standby-amber:#FFB000;
  --patch-blue:#2E7DD1; --hazard:#F2C230;
  /* white setlist paper — PRINT / PDF ONLY; screen stays dark */
  --setlist-paper:#F4F1E8;
  /* structure */
  --border:2px solid var(--aluminum); --radius:0; --unit:8px;
  --shadow-block:3px 3px 0 rgba(228,226,220,.14); --snap:120ms linear;
  /* type */
  --font-display:'Oswald','Archivo Narrow',system-ui,sans-serif;
  --font-body:'IBM Plex Mono','Courier Prime',ui-monospace,'Cascadia Mono',monospace;
  --font-note:'Permanent Marker',cursive;
}

/* --- Pico variable overrides (re-skin the classless base) --------- */
:root, [data-theme="dark"] {
  --pico-background-color:var(--stage-black);
  --pico-color:var(--aluminum);
  --pico-h1-color:var(--aluminum); --pico-h2-color:var(--aluminum);
  --pico-h3-color:var(--aluminum); --pico-h4-color:var(--aluminum);
  --pico-h5-color:var(--aluminum); --pico-h6-color:var(--aluminum);
  --pico-muted-color:var(--gaffer-gray); --pico-muted-border-color:var(--case-edge);
  --pico-border-color:var(--case-edge); --pico-border-radius:0;
  --pico-card-background-color:var(--case-black);
  --pico-card-sectioning-background-color:var(--tolex);
  --pico-card-box-shadow:none;
  --pico-primary:var(--cue-green); --pico-primary-background:var(--cue-green);
  --pico-primary-border:var(--cue-green); --pico-primary-hover:var(--cue-green);
  --pico-primary-hover-background:var(--cue-green);
  --pico-primary-focus:rgba(46,125,209,.5); --pico-primary-inverse:var(--stage-black);
  --pico-secondary:var(--aluminum); --pico-secondary-background:var(--case-edge);
  --pico-secondary-border:var(--aluminum); --pico-secondary-hover:var(--aluminum);
  --pico-secondary-hover-background:var(--case-edge); --pico-secondary-inverse:var(--stage-black);
  --pico-contrast:var(--aluminum); --pico-contrast-background:var(--aluminum);
  --pico-contrast-hover:var(--aluminum); --pico-contrast-inverse:var(--stage-black);
  --pico-form-element-background-color:var(--input-bg);
  --pico-form-element-active-background-color:var(--input-bg);
  --pico-form-element-border-color:var(--case-edge);
  --pico-form-element-active-border-color:var(--patch-blue);
  --pico-form-element-focus-color:var(--patch-blue);
  --pico-form-element-color:var(--aluminum);
  --pico-form-element-placeholder-color:var(--gaffer-gray);
  --pico-form-element-valid-border-color:var(--cue-green);
  --pico-form-element-valid-active-border-color:var(--cue-green);
  --pico-form-element-invalid-border-color:var(--live-red);
  --pico-form-element-invalid-active-border-color:var(--live-red);
  --pico-switch-background-color:var(--case-edge);
  --pico-switch-checked-background-color:var(--cue-green);
  --pico-mark-background-color:var(--hazard); --pico-mark-color:var(--stage-black);
  --pico-font-family:var(--font-body); --pico-font-family-sans-serif:var(--font-body);
  --pico-blockquote-border-color:var(--cue-green);
}
```
`visual-design.md` extends this base (component rules, wireframes, motif markup)
but never redefines a token or its value.

## CONVENTIONS FOR THE FINAL DOC (`visual-design.md`)
- Markdown, numbered sections `00`–`10` (Sachs numbers everything).
- Each component spec follows one shape: **what it is → roady name → visual
  rules → a short CSS/HTML snippet grounded in roady's REAL class names**
  (`.top-nav`, `.band-name`, `.tab-buttons`, `.gig-item`/`.past-gig`,
  `.equipment-item`, `.checklist-progress`/`.progress-bar-fill`, `.check-row`,
  `.badge-*`, `.sync-dot.*`, `.hazard-stripe`, `.empty-state`,
  `.performance-view`, `<dialog>`). Reference the ACTUAL element, never a
  generic site.
- Keep it implementable and terse — show the implemented rule rather than
  inventing a new one; no marketing prose, no emojis.
- Hard invariants the guide inherits and must never break: **dark-only
  on-screen** (white surface = `@media print` only), **no hover** (all feedback
  via `:active`/press), **respect `prefers-reduced-motion`**, square corners,
  hard 2px borders, 8px grid, no gradients (hazard stripe + the one LED glow are
  the documented exceptions), and band-scale vocabulary.
