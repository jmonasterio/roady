# Roady — Visual Design Plan: "THE ROAD CASE"

> A Tom Sachs / Van Neistat **Workshop Web** system, ported from `../cars` but
> re-pitched for roady: a **dark flight-case / gaffer-tape** skin for a band that
> **self-setlists and self-loads on a phone**.
> *"Label the work. Show the work. Do the work."*

**Scale:** this is a **DIY band** — one roadie, or a small van tour. **Not big
production.** No arena/festival, no FOH world, no hired crew. The aesthetic is
the band's own beat-up road cases and Sharpie'd gaffer tape in the back of a van
— not a touring company's production office. Every choice below stays at that
scale; when a motif or word starts to feel like a 40-person crew, it's wrong.

**Status:** PLAN (analysis only — no app code yet). Deliverables in Phase 1–2
below are the specs; Phase 3 re-skins the app.

---

## 00 — WHY THIS FITS ROADY

cars invented a "Workshop Web" look (Sachs: plywood, stencils, gaffer tape,
knolling, NASA hardware, label-everything). Roady runs the **identical stack**
(Pico CSS v2 classless + Alpine 3 + Dexie, no build step, MNA1 nostr auth,
offline-first) so the *system* transfers cleanly. Roady's domain is arguably
**more** Sachs-native than cars: a band already stencils flight cases, writes
setlists in Sharpie, gaffer-tapes them to the monitor, and labels every cable.
`docs/terminology.md` is effectively a pre-written vocabulary sheet.

**What we keep from cars (the STRUCTURE):** hard 2px borders, square corners
(`--radius:0`), 8px knolling grid, stencil-display + mono-body type,
label-everything (corner plates, serials), rectangular status **stamps**, the
**80 / 15 / 5** color budget, engineering date format, numbered sections.

**What changes for roady (the three deltas):**

| # | cars | roady | Driver |
|---|------|-------|--------|
| 1 | **Light** warm-wood shop (birch/paper/plywood) | **Dark** flight-case backstage (stage-black / case-black / tolex) | User: "gaffer tape, mic stands, amps are blacker." |
| 2 | Hover-lift + hover-invert (`@media (hover:hover)`) | **No hover.** Press (`:active`) is the only feedback | User: "it's a phone app usually." |
| 3 | Solo mechanic; heavy shop-manual jargon (`UNIT`, `WORK ORDER`, `P/N`) | **Band-centric, plain nouns.** Users are band members self-loading — a DIY band, one roadie or a small van tour, not a pro road crew | User: roster is band members; they self-load & setlist; small scale. |

**Delta 3 is a discipline, not a theme swap:** the flight-case *look* is loud;
the *language* is quiet, plain, and small-scale. We label things with the band's
own words (Gigs, Gear, Songs, Set List, Load-out), lightly stencilled — we do
**not** rename the app into big-production cosplay (no "production office," "AAA
laminate," "itinerary," "FOH," "crew call"). Stage vocabulary is used **only
where `docs/terminology.md` already uses it**: *load-in / load-out, set list,
gig, band*. If a word implies more than a van and a few people, cut it.

---

## 01 — COLOR (the core analysis)

Two families, same as cars: **materials** (the dark case) and **console accents**
(earned only by actions/alerts — the 5%). The whole system inverts cars: on
roady, structure/text is **light aluminum on dark**, and the borders read as the
**aluminum edging of a road case**.

### Materials — backgrounds / surfaces / structure (the 80% + 15%)

| Token | Hex | Role |
|---|---|---|
| `--stage-black` | `#0E0E10` | Page background — the dark stage / empty venue. (Not pure `#000`.) |
| `--case-black` | `#17171A` | Content surfaces: `.gig-item`, `.equipment-item`, modals, cards. Flight-case ABS. |
| `--tolex` | `#202024` | Heavier panels/bands: `.top-nav`, tab rack, section heads. Amp tolex / case lid. |
| `--aluminum` | `#E4E2DC` | Text, borders, stencils, structure — the case edging. (Warm off-white, not `#FFF`.) |
| `--gaffer-gray` | `#8A8A82` | Secondary text, disabled, NO-SIGNAL plates. Faded gaffer tape. |

### Console accents — actions / alerts (the 5%)

Metaphor = a **mixing console / lighting board**: signal-present & cue-**GO** are
green, **clip/record/live** is red, **VU-approaching-clip** is amber. This is the
clean differentiator from cars' coned-orange.

| Token | Hex | Meaning |
|---|---|---|
| `--cue-green` | `#33D17A` | **PRIMARY action** — buttons, links, active tab, "GO / touch this / patched-in." |
| `--live-red` | `#FF3B30` | Errors, MISSING items, DELETE/STRIKE, sync fault — the record/live light ("stop"). |
| `--standby-amber` | `#FFB000` | Caution: INCOMPLETE load, upcoming-soon, syncing — VU nearing clip. |
| `--patch-blue` | `#2E7DD1` | Secondary / visited / archival — phantom-power blue. |
| `--hazard` | `#F2C230` | Hazard-stripe banners (offline/queued), highlights — gaffer hazard tape. |

### The one light surface — PRINT ONLY

| Token | Hex | Role |
|---|---|---|
| `--setlist-paper` | `#F4F1E8` | White setlist paper — **`@media print` / PDF only** (black-on-white sheet, already how print works). **The on-screen live view stays DARK.** A performer on a dark stage does not want a blinding white screen; the current `#000` Performance View is correct and we keep it. |

### 80 / 15 / 5, inverted for dark

- **80% materials** — stage/case/tolex black. The venue is mostly dark.
- **15% aluminum structure** — `--aluminum` borders, stencils, rules, plates.
- **5% console accent** — green on the one action; red/amber only on real
  alerts. If a screen glows, pull accents back to aluminum structure.

**Rules:** no gradients; no pure `#000`/`#FFF`; `--radius:0`. **One exception to
"flat":** LEDs glow. A *tiny* soft ring is permitted **only** on the sync LED and
status-LED dots (§05) — nowhere else. Optional ≤6%-opacity **diamond-plate /
tolex grain** tile behind flat black reads as *material*, never decoration.

### Accent decision — OPEN (recommend before Phase 3)

`--cue-green` is the recommendation (console "GO," maximally distinct from cars).
Alternates if you want a different mood — swap this one token, nothing else:

| Option | Primary hex | Feel |
|---|---|---|
| **Cue green** *(recommended)* | `#33D17A` | Console signal-present / stage cue "GO." |
| Stage amber | `#FFB300` | Warm incandescent Fresnel wash. (Closer to cars — less contrast with it.) |
| Hi-vis / spike-tape | `#C6FF00` | Fluoro marking tape; punchy, very "gaffer." |

---

## 02 — TYPOGRAPHY

Same three roles as cars — but the marker role is *more* native here (a band
writes setlists and tapes labels in Sharpie).

| Role | Family | Usage |
|---|---|---|
| **Display** | `Oswald` 600–700, ALL CAPS, tight tracking | Screen titles, card headers, tab labels, stencilled names. |
| **Body / data** | `IBM Plex Mono` 400–600 | Body copy, dates, key/BPM/duration figures, form fields, labels. |
| **Sharpie note** | `Permanent Marker` | Gaffer-tape labels & margin notes. **Max 1–2 per screen.** |

Tokens: `--font-display`, `--font-body`, `--font-note`. Fallbacks mirror cars
(`'Archivo Narrow',system-ui`; `'Courier Prime',ui-monospace,monospace`;
`cursive`). Single Google-Fonts `<link>` in `<head>` before `styles.css`.

- Headlines ALL CAPS Oswald; body sentence-case mono; labels UPPERCASE MONO
  letterspaced `.08em`, 11–12px.
- Underlines = flat 3px rule (never thin browser default). Emphasis = hazard
  highlight or red text, **never italics**.
- Dates engineering format: `2026.07.03` or `03 JUL 2026`. Never `7/3/26`.
- **Display-font swap is OPEN:** keep Oswald (proven, parity with cars) vs a
  stencil face (e.g. `Saira Stencil One`) for extra flight-case flavor. Recommend
  keeping Oswald for display and reserving stencil styling for CSS letter-spacing.

---

## 03 — INTERACTION MODEL (phone-first, NO hover)

The single biggest behavioral delta from cars. Roady is used on a phone during
load-out and on stage — one thumb, often in the dark.

- **No hover anywhere.** Drop cars' `@media (hover:hover)` lift/invert entirely.
  The **press is the feedback**: `:active` translates the control 2px down-right
  and drops its block-offset — mechanically pressed into the case. That is all a
  user ever gets, so it must always be present.
- **Touch targets ≥ 44px.** Buttons, tab slots, checklist rows, bottom-nav.
- **Active state is a solid fill, not a hover tint.** Active tab / bottom-nav =
  `--cue-green` block; everything else aluminum/paper-on-dark.
- **Focus-visible** ring stays (keyboard/a11y): 3px `--patch-blue` outline.
- **Respect `prefers-reduced-motion`:** no translate; keep the press cue via
  shadow removal only.
- Block-shadow on dark = an aluminum ghost, not black:
  `--shadow-block: 3px 3px 0 rgba(228,226,220,.14)` (reads as a case lifted in
  stage light). Used for the pressed→released rest state, not hover.

---

## 04 — VOCABULARY MAP (light touch — band's own words)

Rule: **keep the real app noun; stencil it; annotate sparingly.** Only the
already-in-`terminology.md` stage terms get promoted. No invented crew jargon.

| Real screen / element (class) | Keep the word | Stencil / motif treatment | Notes |
|---|---|---|---|
| Top bar (`.top-nav`) | app chrome | Riveted **case ID panel** across the top; sync **LED** + avatar right. | Band name is the label, not a "SHOP MANUAL" wordmark. |
| Band switcher (`.band-switcher-btn`, `.band-name`) | band name | Band name on a **gaffer-tape strip** (Sharpie font, ±2°); ▾ when multi-band. | `docs/terminology.md#band`. The one Permanent-Marker flourish per screen. |
| Gigs view (`.nav-links`, `#gigs`) | **GIGS** | Section head "01 · GIGS" ruler; each gig a **SHOW card**. | Keep "Gigs" — it's the app's word. |
| Gig card (`.gig-item`) | gig | Flight-case card: corner plate `GIG` + **DATE stamp** (`03 JUL 2026`), venue mono, packed count stamp. `.past-gig` → muted `STRUCK` plate (replaces "(Past)"). | Self-load band's own show. |
| Load-out / Load-in ("To Gig" / "From Gig") | **LOAD-OUT / LOAD-IN** | NASA-checklist / stage-manager clipboard; big square checkboxes. | These ARE the terms (`terminology.md`). The self-load core. |
| Checklist progress (`.checklist-progress`) | packed count | `X/Y` **PACKED** stamp + hard progress bar. | Console-style, see §06. |
| "Items not brought" (`.section-heading-missing`) | left behind | `--live-red` **CHECK** hazard heading. | Catch forgotten gear. |
| "Items brought" (`.section-heading-loaded`) | packed | `--cue-green` **PACKED** heading. | |
| Gear view (`.equipment-item`, tabs) | **GEAR** | Section "02 · GEAR"; items = **manifest line items** with an asset-tag serial. | Catalog tab = the inventory; Gig Types tab = **KIT** presets (band word for "gig type"). |
| Music view (Songs / Set Lists tabs) | **MUSIC** | Songs = **repertoire** rows w/ key/BPM/duration as data-plate figures; Set Lists = the book. | |
| Set List (instance) & **Stage View** (Performance View) | **SET LIST** | THE signature screen, **kept DARK**: `--stage-black` surface, big high-contrast `--aluminum` song text, `--cue-green` section rules; **gaffer-tape corners** as the one accent. White paper only when printed. | `terminology.md#performance-view`. Dark = readable on a dark stage. |
| Band view (Members/Info/Options/Trash) | **BAND** | Members = **band roster** (name · instrument, like a stage-plot slot); Trash = **STRUCK**. | Roster is band members, not hired crew. |
| Roster member (`bandMembers`) | member | `NAME · INSTRUMENT` data plate. | "Anna · drums." No "personnel/laminate." |
| Invitation / device key | **INVITE** / device | Plain — "Add a device," "Invite member." | Keep terminology.md wording; skip pass/laminate metaphor. |
| Sync dot (`.sync-dot`) | sync | **Signal LED** (§05): green=connected, amber=syncing, red=error. | Maps 1:1 to existing `.sync-paused/.sync-active/.sync-error`. |
| Snackbar | toast | A **talkback cue** line (styling only). | |
| Login overlay (`#nostr-login-overlay`) | sign in | Backdrop + chrome only (card owned by `nostr-universal.js`). | Only skin the surround. |
| Footer / Options bottom | — | **Case stencil DATA PLATE**: SERIAL (npub), BUILD, VERSION, `ROADY`. | Mirrors cars §3.5. |

---

## 05 — SIGNATURE MOTIFS (1–2 flourishes per screen, max)

1. **Gaffer-tape label** — a tape strip, `Permanent Marker` text, rotated ±2°.
   The band-name switcher is the canonical use. Replaces cars' masking-tape.
2. **Flight-case card** — dark `--case-black`, 2px `--aluminum` border, a
   stencilled **corner label plate** (`GIG` / `KIT` / `SET`), and **ball-corner
   brackets** (cars' `.reg-marks`, re-themed) on 1 hero card per screen.
3. **Console LED** — the sync dot and status dots are hard **squares** with the
   *one* permitted glow (tiny ring). green/amber/red = connected/working/fault.
4. **Setlist / Stage View** — the live hero screen stays **DARK** (stage-black,
   aluminum text). The gaffer-tape/Sharpie motif appears as **taped corners +
   section labels**, not a light surface. White paper is reserved for print/PDF.
5. **Hazard stripe** — offline/queued banner = yellow/black gaffer hazard-tape
   strip (cars' caution-tape, ported).
6. **Tick-ruler section dividers + numbered heads** (`01 · GIGS`) — cars §3.3,
   re-themed to aluminum-on-dark.

---

## 06 — STATUS → STAMP MAPPING (console indicators; LOCKED shape)

Rectangular DYMO/stamp: square corners, 2px border, UPPERCASE MONO. Philosophy
(from cars): **idle/healthy wears no paint; only actions & problems get accent.**

| State | Class (new/existing) | Treatment | Fill | Text |
|---|---|---|---|---|
| MISSING / left behind / error | `.badge-missing` | Solid block ("stop") | `--live-red` | `--aluminum` |
| INCOMPLETE / syncing / soon | `.badge-standby` | Caution stamp | `--standby-amber` | `--stage-black` |
| PACKED / GO / ready | `.badge-go` | GO stamp | `--cue-green` | `--stage-black` |
| IDLE / upcoming / neutral | `.badge-idle` | Neutral plate, **no paint** | `--case-black` + `--aluminum` border | `--aluminum` |
| STRUCK / past / no data | `.badge-struck` | Muted plate | `--gaffer-gray` | `--stage-black` |

Green is allowed as a positive terminal state (`PACKED/GO`) because green is also
the primary "GO" accent — action and success share the color coherently. Sync LED
reuses green/amber/red per the existing `.sync-dot` classes.

---

## 07 — COMPONENT INVENTORY (mapped to roady's REAL classes)

Every item exists in `index.html` today; the re-skin is CSS + label text +
small motif markup, **Alpine logic untouched**.

- **`.top-nav` / `.nav-brand` / `.band-switcher-btn` / `.band-name`** → case ID
  panel; band name on gaffer-tape strip; ▾ multi-band.
- **`.nav-links` (desktop) + `.bottom-nav` (mobile)** → tool-rack nav. Active =
  `--cue-green` block. **No hover.** Bottom-nav is primary (phone).
- **`.sync-dot` (`.sync-paused/.sync-active/.sync-error/.sync-idle/.has-errors`)**
  → square **signal LED** with tiny glow.
- **`.tab-buttons`** (Gear/Music/Band sub-tabs) → one bordered rack, 2px black
  dividers, no gaps, uppercase mono; active slot = green block. (Replaces the
  current rounded segmented control.)
- **`.gig-item` (+`.past-gig`)** → flight-case SHOW card w/ corner plate + DATE
  stamp; `.past-gig` → `STRUCK` badge (drop the `" (Past)"` `::after` text hack).
- **`.equipment-item`** (gear / gig types / songs / set-list templates / trash)
  → manifest line item, 2px top rule, asset-tag serial, right-aligned actions.
- **`.checklist-progress` / `.progress-bar` / `.progress-bar-fill`** → hard
  PACKED progress (square, `--cue-green` fill, no radius).
- **`.section-heading-missing` / `.section-heading-loaded`** → red CHECK / green
  PACKED headings (align to §06 tokens; drop ad-hoc `#ef4444`/`#10b981`).
- **`.checklist` rows** → NASA-checklist lines; oversized square checkboxes,
  ≥44px rows.
- **Modals (`<dialog>`, `.dialog-body`)** → NASA-checklist forms: labels ABOVE
  fields, `[REQ]` token not asterisk, Cancel (neutral) / Save (green).
- **`.band-switcher-list` / `.band-switcher-row`** → case-label list, ✓ = green.
- **`.empty-state`** → stencilled plates: "STAGE IS DARK — NO GIGS,"
  "NOTHING ON THE MANIFEST."
- **Buttons** → flat fill, 2px border, square, uppercase mono; ONE green primary
  per screen; `.secondary`/`.outline` = aluminum/hollow; press-only feedback.
- **`#nostr-login-overlay`** → dark backdrop + chrome only.

---

## 08 — TOKEN SHEET (draft base for the spine)

```css
:root{
  /* materials */
  --stage-black:#0E0E10; --case-black:#17171A; --tolex:#202024;
  --aluminum:#E4E2DC; --gaffer-gray:#8A8A82;
  /* console accents */
  --cue-green:#33D17A; --live-red:#FF3B30; --standby-amber:#FFB000;
  --patch-blue:#2E7DD1; --hazard:#F2C230;
  /* white setlist paper — PRINT / PDF ONLY; screen stays dark */
  --setlist-paper:#F4F1E8;
  /* structure */
  --border:2px solid var(--aluminum); --radius:0; --unit:8px;
  --shadow-block:3px 3px 0 rgba(228,226,220,.14);
  --font-display:'Oswald','Archivo Narrow',system-ui,sans-serif;
  --font-body:'IBM Plex Mono','Courier Prime',ui-monospace,monospace;
  --font-note:'Permanent Marker',cursive;
  --snap:120ms linear;
}
/* Map Pico onto these: --pico-background-color:var(--stage-black);
   --pico-color:var(--aluminum); --pico-primary:var(--cue-green);
   --pico-border-radius:0; card/surface bg → var(--case-black); etc. */
```

---

## 09 — IMPLEMENTATION PHASES

**Phase 1 — Design spine (doc).** Write `docs/design-spine.md` (roady): locked
tokens, palette, type, the light-touch vocabulary map, component inventory,
status mapping, interaction rules. Authoritative lock (mirrors cars' spine).

**Phase 2 — Visual guide (doc).** Write `visual-design.md`: full LOOK guide,
numbered 00–10, CSS/HTML snippets grounded in roady's real class names, ASCII
wireframes for **Gigs**, **Load-out checklist**, and **Stage View (setlist)**.
Add both docs to `AGENTS.md` "Read first" index.

**Phase 3 — Re-skin (code).**
- Add Google-Fonts `<link>` to `<head>`.
- Rewrite the token layer + Pico overrides in `css/styles.css`; replace the
  current dark-Pico surfaces with the flight-case system. Clean cutover (retire
  the ad-hoc dark theme — matches `AGENTS.md`: few users, favor clean cutover).
- Relabel UI nouns + add motif markup in `index.html` (corner plates, gaffer
  label, LED, setlist paper, hazard banner). Alpine logic unchanged.
- **Strip all hover rules; press-only.** Verify ≥44px targets.
- **Bump `?v=` on every asset** in `index.html` (`ui-guide` cache-buster rule).

**Phase 4 — Verify.**
- Browser smoke at **≤480px first** (phone is primary), then desktop: Gigs →
  create/open gig → Load-out & Load-in checklists → Gear (Catalog/Kits) →
  Music (Songs/Set Lists) → **Stage View** → Band (Members/Info/Options/Trash).
- Confirm **no hover dependency** (all feedback via press/active), sync LED
  states (paused/active/error), offline hazard banner, contrast
  (`--aluminum` on `--stage-black`; accents on dark; printed setlist black-on-paper).

---

## 10 — OPEN DECISIONS (lock before Phase 3)

1. **Primary accent** — `--cue-green` (recommended) vs stage-amber vs hi-vis (§01).
2. **Display font** — keep `Oswald` (recommended) vs stencil face (§02).
3. **Textures** — add ≤6% diamond-plate/tolex grain tiles, or stay flat.
4. **Cutover scope** — confirm full replacement of the current dark Pico theme
   (recommended, per `AGENTS.md`).
