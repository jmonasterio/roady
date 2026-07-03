# roady — VISUAL DESIGN GUIDE

> **THE ROAD CASE** — a Tom Sachs / Van Neistat *Workshop Web* system, re-cut
> for a band that self-setlists and self-loads on a phone.
> *"Label the work. Show the work. Do the work."*

This guide governs the **LOOK** of the roady app. Its companion
`docs/design-spine.md` governs **STRUCTURE + the locked token contract** (palette,
type, vocabulary map, component inventory, status mapping) and `AGENTS.md` indexes
both — read all three before restyling.

roady is a multi-band, offline-first PWA for a **DIY band** — one roadie, or a
small van tour. **Not** a pro road crew, not a festival, not a production office.
The app is built like the band's own beat-up gear, not a product: a **flight
case**. Every seam is visible, every noun is stencilled, nothing is polished past
the point of function. Gigs are **SHOWS** on flight-case cards, gear is a
**MANIFEST**, load-out is a **checklist**, the set list is a **taped-up sheet** —
the aesthetic and the domain are the same thing.

**Status of this guide:** IMPLEMENTED. `index.html` / `css/styles.css` wear this
system today — the flight-case layer is appended last in `styles.css` under
`FLIGHT-CASE DESIGN SYSTEM — "THE ROAD CASE"` and wins the cascade over the legacy
dark-Pico rules. When you change any asset, bump the `?v=` cache-buster on every
asset (see §09; already at `20260703a`).

**Locked decisions (the three deltas from cars):** (1) **DARK** flight-case
backstage, not a light wood shop; (2) **NO HOVER** — the press (`:active`) is the
only feedback, because it is a phone in the dark; (3) **band-centric plain nouns**
(Gigs, Gear, Music, Band, Set List, Load-out) — stencilled, never renamed into
touring-crew jargon.

---

## 00 — PHILOSOPHY (READ FIRST)

A band already stencils flight cases, writes setlists in Sharpie, gaffer-tapes
them to the monitor, and labels every cable. roady is not a "product" — it is the
**road case and clipboard** you keep in the back of the van. It schedules shows,
packs the manifest, and checks the load-out. The interface should feel *built*,
not *designed*: made by the band, for the band, on a phone, often on a dark stage.
Eight principles, in order of authority:

1. **The app is the band's tool, not a product.** No marketing gloss, no hero
   shots. Every screen earns its place by helping load a gig or run a set. If a
   pixel isn't doing a job, it's clutter — scrap it.
2. **Show the seams.** Never hide how it's built. Hard 2px `--aluminum` borders
   (the case edging), visible dividers, exposed grid, honest edges
   (`--border`, `--radius:0`). Structure is ornament; the joinery is the finish.
3. **Always be knolling.** Everything laid out at right angles, aligned to the
   `--unit:8px` grid, nothing floating. A gig list reads like cases stacked square
   in a van — parallel rows, square corners, tidy negative space.
4. **Handmade beats perfect — ±2°, not chaos.** One taped label may sit a hair
   off-axis (the band-name strip is rotated `-1.5deg`). Deliberate, singular
   imperfection — never randomized mess. One or two flourishes per screen, max.
5. **Label everything.** Cards get corner plates (`GIG`), figures get their units
   (`128 BPM`, `4:12`), statuses get **stamps**. If it exists, it is stamped and
   titled in UPPERCASE MONO. Ambiguity is the enemy of a load-out.
6. **Function is the aesthetic.** The progress bar looks good *because* it reads
   `7/12 packed` cleanly. Beauty is a side effect of legibility and fit — never
   applied on top. Data plates, not decoration.
7. **Safety / console paint is earned, never worn.** Green, red, amber, blue are
   reserved for where an action or an alert actually lives (see §01). A healthy
   screen is calm aluminum-on-black. Color is a signal, not a mood.
8. **DIY-band scale.** One roadie or a small van tour. When a motif or a word
   starts to feel like a 40-person crew (FOH, laminate, itinerary, production
   office), it's wrong — cut it back to the band's own plain word.

This document governs the **LOOK**. For the locked tokens, the vocabulary map, and
the structural contract, see the companion `docs/design-spine.md`.

---

## 01 — COLOR

Two families: **materials** (the dark case — stage-black, case-black, tolex,
aluminum edging) and **console accents** (the paint on the mixing desk — earned
only by actions and alerts). Variable names and hexes are **verbatim** from the
implemented `:root` in `css/styles.css`; use these, never alternates. The whole
system inverts cars: structure/text is **light aluminum on dark**, and the borders
read as the **aluminum edging of a road case**.

### Materials — backgrounds / surfaces / structure (the 80% + 15%)

| Token | Hex | Role in roady |
| --- | --- | --- |
| `--stage-black` | `#0E0E10` | Page background — the dark stage / empty venue (not pure `#000`) |
| `--case-black` | `#17171A` | Content surfaces: `.gig-item`, `.equipment-item`, `.checklist-progress`, cards. Flight-case ABS |
| `--tolex` | `#202024` | Heavier panels/bands: `.top-nav`, `.tab-buttons` rack, `.bottom-nav`. Amp tolex / case lid |
| `--input-bg` | `#1D1D21` | Form-field wells and the empty `.progress-bar` track |
| `--case-edge` | `#34343A` | Seams / dividers / Pico form-element borders — the raw case seam |
| `--aluminum` | `#E4E2DC` | Text, borders, stencils, corner plates — the case edging (warm off-white, not `#FFF`) |
| `--gaffer-gray` | `#8A8A82` | Secondary text, disabled, `STRUCK`/idle plates. Faded gaffer tape |

### Console accents — actions / alerts (the 5%)

Metaphor = a **mixing console / lighting board**: signal-present & cue-**GO** are
green, **clip / live** is red, **VU-approaching-clip** is amber. This is the clean
differentiator from cars' coned-orange.

| Token | Hex | Meaning |
| --- | --- | --- |
| `--cue-green` | `#33D17A` | **PRIMARY action** — buttons, links, active tab/nav, checkbox, progress fill, `GO / touch this` |
| `--live-red` | `#FF3B30` | Errors, `MISSING` items, delete/strike, sync fault — the record/live light ("stop") |
| `--standby-amber` | `#FFB000` | Caution: incomplete / syncing / soon — VU nearing clip |
| `--patch-blue` | `#2E7DD1` | Secondary / focus ring / archival — phantom-power blue |
| `--hazard` | `#F2C230` | Hazard-stripe offline/queued banner, highlights — gaffer hazard tape |

### The one light surface — PRINT ONLY

| Token | Hex | Role |
| --- | --- | --- |
| `--setlist-paper` | `#F4F1E8` | White setlist paper — **`@media print` / PDF only**. The on-screen Stage/Performance view **STAYS DARK**. A performer on a dark stage does not want a blinding white screen (see §05). |

### The 80 / 15 / 5 rule, inverted for dark

Every screen is budgeted:

- **80% materials** — stage/case/tolex black. The venue is mostly dark.
- **15% aluminum structure** — `--aluminum` borders, stencils, rules, corner plates.
- **5% console accent** — `--cue-green` on the *one* action per screen; red/amber
  only on real alerts. If a screen glows, pull accents back to aluminum structure.

**Green = touch this. Red = stop.** Green marks the one thing on a screen you
should act on (the primary `Create` button, the active tab, the checked box, the
progress fill). Red marks a thing that is wrong and must stop you (`MISSING`, a
failed sync, a destructive delete). Never decorate with either.

### Flat everywhere — with exactly two documented exceptions

**No gradients, no soft shadows, no rounded corners** (`--radius:0`), no pure
`#000`/`#FFF`. Two — and only two — surfaces are allowed to be non-flat:

1. **The sync LED glow.** The `.sync-dot` is the one element permitted a soft
   ring, because an LED glows (§4.3).
2. **The hazard stripe.** The offline banner is a 45° hard-stop
   `repeating-linear-gradient` of hazard/black — gaffer tape, not a gradient wash
   (§4.12).

```css
/* implemented — the block-shadow ghost is an ALUMINUM lift on dark, never black */
:root { --shadow-block:3px 3px 0 rgba(228,226,220,.14); }
```

---

## 02 — TYPOGRAPHY

Three type roles, each with a job. Display stencils the headers, mono runs all the
data and labels (field-manual feel), marker is the rare Sharpie annotation — and
here the marker role is *more* native than in cars, because a band writes setlists
and tapes labels in Sharpie for real.

### Roles

| Role | Family | Fallback stack (implemented) | Usage |
| --- | --- | --- | --- |
| **Display / headlines** | `Oswald` (500–700, ALL CAPS, tight tracking) | `'Oswald','Archivo Narrow',system-ui,sans-serif` | Screen titles, `.gig-item`/`.equipment-item` names, `.nav-links`, tab labels, `.performance-title` |
| **Body / labels / data** | `IBM Plex Mono` (400–600) | `'IBM Plex Mono','Courier Prime',ui-monospace,'Cascadia Mono',monospace` | All body copy, dates, key/BPM/duration figures, form fields, badge text, `.text-muted` |
| **Sharpie note** | `Permanent Marker` | `'Permanent Marker',cursive` | The gaffer-tape band label. **MAX 1–2 per screen** — never structural |

Bound to `--font-display`, `--font-body`, `--font-note` (implemented in `:root`).

### Google Fonts embed (exact — already in `<head>`, before `styles.css`)

```html
<!-- index.html:22-24 -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Permanent+Marker&display=swap" rel="stylesheet">
```

### Rules

- **Headlines = ALL CAPS** Oswald, tight tracking. Every heading and card title.
- **Body = sentence case** IBM Plex Mono — reads like a manual, not a shout.
- **Labels / metadata = UPPERCASE MONO, letterspaced** `.05–.08em`, 9–12px
  (`.text-muted`, `.badge`, corner plates).
- **Underlines = a flat hard rule** — links carry `text-decoration-thickness:2px`
  (3px on the active nav link), never the thin browser default.
- **Emphasis = hazard highlight or red text, never italics.** `mark` is a hazard
  block (`--pico-mark-background-color:var(--hazard)`).
- **Dates = engineering format:** `03 JUL 2026` or `2026.07.03`. Never `7/3/26`.
- **Sections numbered** `00, 01, 02 …` — Sachs numbers everything; so do we.

### Implemented rules (verbatim)

```css
/* every heading is stencilled display caps */
h1,h2,h3,h4,h5,h6 {
  font-family:var(--font-display); text-transform:uppercase; letter-spacing:.01em;
}
main h2 { border-bottom:var(--border); padding-bottom:4px; }   /* a hard rule under section heads */
a { color:var(--cue-green); text-decoration-thickness:2px; text-underline-offset:2px; }

/* the ONE Sharpie flourish: the band name on a gaffer-tape strip, rotated -1.5deg */
.band-name {
  display:inline-block; font-family:var(--font-note); text-transform:none;
  background:var(--aluminum); color:var(--stage-black); padding:2px 10px;
  transform:rotate(-1.5deg); box-shadow:2px 2px 0 rgba(0,0,0,.35); line-height:1.25;
}
```

The `.band-name` strip is the canonical `Permanent Marker` use — light tape on the
dark tolex bar, one per screen. Everything else is Oswald or Plex Mono.

---

## 03 — LAYOUT & KNOLLING GRID + INTERACTION

The van packs on a grid. Every screen is a stack of **flight cases**: hard 2px
aluminum edges box every card, drawn on stage-black stock. Nothing floats, nothing
is centered by default, nothing is round. If you can't see the edges, you drew it
wrong.

**Governing rules (apply everywhere, no exceptions):**

- **Right angles only.** `border-radius:0` globally (`--radius:0`; Pico's
  `--pico-border-radius` is overridden to `0`). A rounded corner anywhere is a bug.
- **Visible structure.** Cards and racks carry a real `--border` (`2px solid
  var(--aluminum)`) — the case edging. Depth is a hard `--shadow-block`
  (`3px 3px 0` aluminum ghost) or nothing. No soft shadows.
- **8px module.** All spacing is a multiple of `--unit` (8px). Card gutters =
  `var(--unit)`; card inner padding = `calc(var(--unit)*2)`.
- **Knolling.** Related objects lay out parallel, on a grid, even gutters — the
  `.gig-list` and the manifest lists are literal knolling stacks.
- **Label everything.** Hero cards wear a **corner LABEL PLATE** (the `GIG` plate,
  below). Nothing is anonymous.
- **80 / 15 / 5.** ~80% dark material, ~15% aluminum structure, ~5% console
  accent. If a screen reads as colorful, it's wrong.

### 3.1 The corner LABEL PLATE (implemented as `.gig-item::before`)

A stencilled aluminum tag riveted to a card's top-left corner, overlapping the
border. This is the single most repeated motif; it is implemented today on the gig
card as a `GIG` plate. The card is `position:relative` and padded to clear it.

```css
/* implemented — the riveted corner plate */
.gig-item {
  position:relative; display:block; background:var(--case-black);
  border:var(--border); border-radius:0; box-shadow:none; margin-bottom:var(--unit);
  padding:calc(var(--unit)*2); padding-top:calc(var(--unit)*2 + 8px);  /* clear the plate */
}
.gig-item::before {
  content:"GIG"; position:absolute; top:-2px; left:-2px;   /* sit on the border line */
  background:var(--aluminum); color:var(--stage-black);
  font-family:var(--font-body); font-size:9px; font-weight:600; letter-spacing:.12em;
  padding:1px 6px;
}
```

### 3.2 INTERACTION MODEL — phone-first, NO hover

The single biggest behavioral delta from cars. roady is used on a phone during
load-out and on a dark stage — one thumb, often in the dark.

- **No hover anywhere.** There are **no `:hover` rules** in the flight-case layer.
  The **press is the feedback**: `:active` translates the control `2px` down-right
  and drops its shadow — mechanically pressed into the case. That is all a user
  ever gets, so it must always be present.
- **Touch targets ≥ 44px.** Tab slots set `min-height:44px`; checklist `.check-row`
  and bottom-nav buttons are full-width tap zones.
- **Active state is a solid fill, not a hover tint.** Active tab / bottom-nav =
  `--cue-green`; everything else aluminum-on-dark.
- **Focus-visible ring stays** (keyboard / a11y): `3px solid var(--patch-blue)`.
- **Respect `prefers-reduced-motion`:** drop the translate; the press still reads
  via shadow removal.

```css
/* implemented — the press, and its reduced-motion fallback */
button:not(.sync-dot):not(.band-switcher-btn):active,
[role="button"]:active { transform:translate(2px,2px); box-shadow:none; }
.gig-item:active { transform:translate(2px,2px); }

button:focus-visible, [role="button"]:focus-visible,
input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline:3px solid var(--patch-blue); outline-offset:0;
}
@media (prefers-reduced-motion: reduce) {
  button, [role="button"] { transition:none; }
  button:active, [role="button"]:active { transform:none; }
}
```

---

## 04 — UI COMPONENTS (mapped to roady's REAL elements)

Every component maps to an element that exists in `index.html` today (class names
verified against source). Spec = what it is → roady name → visual rules → a short
snippet against the real markup + the implemented CSS. Alpine logic is untouched;
this is the finish.

### 4.1 CASE ID PANEL — top bar (`.top-nav` / `.band-name` / `.band-switcher-btn`)

**What it is:** the app chrome across the top.
**roady name:** the riveted **case ID panel**; the band name is the label.
**Visual rules:** tolex bar, 2px aluminum bottom border, sticky, no shadow — the
border does the separating. The band name rides on a **gaffer-tape strip** in
`Permanent Marker`, light tape on dark, rotated `-1.5deg` (the one Sharpie
flourish). A `▾` chevron appears only with multiple bands. Sync LED + avatar sit
right.

```css
/* implemented */
.top-nav { background:var(--tolex); border-bottom:var(--border); }
.band-name {
  display:inline-block; font-family:var(--font-note); text-transform:none;
  background:var(--aluminum); color:var(--stage-black); padding:2px 10px;
  transform:rotate(-1.5deg); box-shadow:2px 2px 0 rgba(0,0,0,.35);
}
```
```html
<!-- index.html:63-73 — markup unchanged; the strip + LED are pure CSS -->
<nav class="container-fluid top-nav">
  <ul class="nav-brand">
    <li x-show="!isLoading && isAuthenticated && userBands.length > 0">
      <button class="band-switcher-btn"
        @click="userBands.length > 1 ? (showBandSwitcher = true) : (currentView = 'band')">
        <strong class="band-name" x-text="currentBandName"></strong>
        <svg x-show="userBands.length > 1" width="14" height="14" ...><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </li>
  </ul>
```

### 4.2 NAV — desktop links (`.nav-links`) + phone bar (`.bottom-nav`)

**What it is:** primary view switching (Gigs · Gear · Music · Band).
**roady name:** the tool rack. **Bottom-nav is primary** (phone); the top link row
is the desktop enhancement.
**Visual rules:** Oswald caps, uppercase, letterspaced. **No hover.** Active =
`--cue-green` — the desktop link thickens its underline to 3px; the bottom-nav
button lights green with a `3px` **inset bar** along its top edge (a lit console
button).

```css
/* implemented */
.nav-links a { font-family:var(--font-display); text-transform:uppercase; letter-spacing:.05em; }
nav a.active { color:var(--cue-green); text-decoration-thickness:3px; }

.bottom-nav { background:var(--tolex); border-top:var(--border); }
.bottom-nav button { color:var(--gaffer-gray); text-transform:uppercase; letter-spacing:.04em; }
.bottom-nav button.active { color:var(--cue-green); box-shadow:inset 0 3px 0 var(--cue-green); }
```
```html
<!-- index.html:1451-1460 — phone-primary bar; active class is the only change -->
<nav class="bottom-nav" x-show="!isLoading && isAuthenticated" x-cloak>
  <button :class="{ active: currentView === 'gigs' }" @click="currentView = 'gigs'">
    <svg ...></svg><span>Gigs</span>
  </button>
  <!-- Gear · Music · Band … -->
</nav>
```

### 4.3 SIGNAL LED — sync status (`.sync-dot`)

**What it is:** the sync indicator in the top bar.
**roady name:** the **signal LED** on the console.
**Visual rules:** a hard 12px **square** (not a round dot), the one element allowed
a glow — a soft colored ring. States map 1:1 to the existing classes:
green = connected (`sync-paused`), amber = syncing (`sync-active`), red = fault
(`sync-error`), gray = idle. `has-errors` adds a red halo.

```css
/* implemented — the ONE permitted glow */
.sync-dot { width:12px; height:12px; border-radius:0; border:1px solid rgba(0,0,0,.45); box-shadow:none; }
.sync-dot.sync-paused { background:var(--cue-green);     box-shadow:0 0 6px rgba(51,209,122,.7); }
.sync-dot.sync-active { background:var(--standby-amber); box-shadow:0 0 6px rgba(255,176,0,.7); }
.sync-dot.sync-error  { background:var(--live-red);      box-shadow:0 0 6px rgba(255,59,48,.7); }
.sync-dot.sync-idle   { background:var(--gaffer-gray); }
.sync-dot.has-errors  { box-shadow:0 0 0 3px rgba(255,59,48,.35); }
```
```html
<!-- index.html:91-95 -->
<button type="button" class="sync-dot"
  :class="[syncDotClass(), syncErrorLog.length ? 'has-errors' : '']"
  :aria-label="'Sync status: ' + getSyncStatusText()" ...></button>
```

### 4.4 TAB RACK — sub-tabs (`.tab-buttons`)

**What it is:** the Gear / Music / Band sub-tab strips (Catalog · Gig Types, Songs
· Set Lists, Members · Info · Options · Trash).
**roady name:** the **tool rack** — one continuous strip, pick a slot.
**Visual rules:** one bordered tolex rack; slots divided by 2px aluminum rules, no
gaps; uppercase mono; `min-height:44px`; horizontal scroll rather than wrap.
**Active slot = solid `--cue-green` block** with stage-black text (the button
*without* `.outline`/`.secondary`); inactive slots are gaffer-gray on tolex.

```css
/* implemented */
.tab-buttons {
  gap:0; padding:0; max-width:none; background:var(--tolex);
  border:var(--border); border-radius:0; overflow-x:auto;
}
.tab-buttons button, .tab-buttons button.outline, .tab-buttons button.secondary {
  flex:1 0 auto; border:0; border-right:var(--border); border-radius:0;
  background:var(--tolex); color:var(--gaffer-gray);
  text-transform:uppercase; letter-spacing:.06em; font-weight:600;
  padding:.7rem .8rem; min-height:44px; white-space:nowrap;
}
.tab-buttons button:last-child { border-right:0; }
.tab-buttons button:not(.outline):not(.secondary) {   /* the active slot */
  background:var(--cue-green); color:var(--stage-black);
}
```
```html
<!-- index.html:745-749 — active button drops .secondary/.outline; logic unchanged -->
<div class="tab-buttons">
  <button @click="setlistTab = 'songs'"     :class="setlistTab === 'songs' ? '' : 'secondary outline'">Songs</button>
  <button @click="setlistTab = 'templates'" :class="setlistTab === 'templates' ? '' : 'secondary outline'">Set Lists</button>
</div>
```

### 4.5 GIG CARD — a flight-case SHOW (`.gig-item` / `.past-gig`)

**What it is:** one scheduled show in the Gigs list.
**roady name:** a **flight-case SHOW card** with a corner `GIG` plate.
**Visual rules:** case-black surface, 2px aluminum edge, corner plate (§3.1), name
in Oswald caps, date + gig type as uppercase mono `.text-muted`, To/From/Set
List/Edit as the action group. `.past-gig` fades to `.55` opacity and appends a
muted `· STRUCK` stencil to the title (the load-out word for a torn-down stage) —
this *replaces* a "(Past)" text hack. The press translates it 2px.

```css
/* implemented */
.gig-item strong { font-family:var(--font-display); text-transform:uppercase; letter-spacing:.02em; }
.gig-item .text-muted { font-family:var(--font-body); text-transform:uppercase; letter-spacing:.05em; font-size:.8rem; }
.gig-item.past-gig { opacity:.55; }
.gig-item.past-gig strong::after {
  content:" · STRUCK"; color:var(--gaffer-gray);
  font-family:var(--font-body); font-size:.7em; letter-spacing:.1em; font-weight:400;
}
```
```html
<!-- index.html:283-311 — .gig-item wears the corner plate + STRUCK via CSS -->
<article class="gig-item" :class="{ 'past-gig': isGigInPast(gig) }">
  <div style="flex: 1;">
    <strong x-text="gig.name || 'Unnamed Gig'"></strong>
    <p class="text-muted"><span x-text="formatDate(gig.date)"></span> •
       <span x-text="getGigTypeName(gig.gigTypeId)"></span></p>
  </div>
  <div class="button-group">
    <button @click="viewGigDetail(gig._id, 'leavingForGig')" class="contrast">To Gig</button>
    <button @click="viewGigDetail(gig._id, 'leavingFromGig')">From Gig</button>
    <button @click="openGigSetlist(gig._id)" class="secondary outline">Set List</button>
    <button @click="editGig(gig)" class="secondary outline">Edit</button>
  </div>
</article>
```

### 4.6 MANIFEST LINE ITEMS (`.equipment-item`)

**What it is:** every catalog/list row — gear, gig types (kits), songs, set-list
templates, trash.
**roady name:** **manifest line items**.
**Visual rules:** case-black line, 2px aluminum edge, square, no shadow, name in
Oswald caps, detail beneath as mono `.text-muted`. Same edging as the gig card so a
list reads as knolled cases.

```css
/* implemented */
.equipment-item {
  background:var(--case-black); border:var(--border); border-radius:0;
  box-shadow:none; margin-bottom:var(--unit); padding:calc(var(--unit)*1.5);
}
.equipment-item strong { font-family:var(--font-display); text-transform:uppercase; letter-spacing:.02em; }
```
```html
<!-- index.html:648-654 — reused verbatim across gear/kits/songs/templates/trash -->
<article class="equipment-item">
  <div><strong x-text="item.name"></strong>
       <p x-text="item.description" class="text-muted"></p></div>
</article>
```

### 4.7 BUTTONS

**What it is:** every action control.
**roady name:** console switches — flip them, they physically move.
**Visual rules:** flat fill, 2px border, square, uppercase mono. **One
`--cue-green` primary per screen** (Pico `--pico-primary` is mapped to cue-green,
so a plain `<button>` is the green GO action with stage-black ink). `.secondary` =
**hollow aluminum** (transparent + aluminum border). `.outline` inherits Pico's
**cue-green outline**. `.contrast` (the `To Gig` button) is the solid aluminum
plate. **Press, not hover** — the only feedback is `:active` (§3.2). Ink on a green
fill is always `--stage-black`. No gradient, no glow, no pill.

```css
/* implemented — base, press, secondary, focus, reduced-motion */
button:not(.sync-dot):not(.band-switcher-btn),
[role="button"], input[type="submit"], input[type="button"], input[type="reset"] {
  border-radius:0; font-family:var(--font-body); text-transform:uppercase;
  letter-spacing:.06em; font-weight:600;
  transition:transform var(--snap), box-shadow var(--snap), background var(--snap);
}
button:not(.sync-dot):not(.band-switcher-btn):active,
[role="button"]:active { transform:translate(2px,2px); box-shadow:none; }
button.secondary { background:transparent; color:var(--aluminum); border:var(--border); }  /* hollow aluminum */
```
The green fill and green outline come from the Pico override
`--pico-primary:var(--cue-green)` with `--pico-primary-inverse:var(--stage-black)`.

### 4.8 FORMS & MODALS (`<dialog>`, labels above, cue-green checkboxes)

**What it is:** the create/edit dialogs (gig, equipment, gig type, song, set list,
invite) and the sync/confirmation modals.
**roady name:** the **load-out clipboard** — a checklist form.
**Visual rules:** full-height `<dialog>` `article` with a back-arrow header;
**labels sit ABOVE fields** (as the markup already does); fields are `--input-bg`
wells with `--case-edge` borders; the focus/active border and the focus ring are
**`--patch-blue`**; checkboxes/radios are **cue-green** via `accent-color`; valid =
green, invalid = red (Pico form tokens). Cancel is hollow/neutral, Save is the one
green primary.

```css
/* implemented — cue-green ticks; blue focus/active plumbing via Pico tokens */
input[type="checkbox"], input[type="radio"] { accent-color:var(--cue-green); }
:root, [data-theme="dark"] {
  --pico-form-element-background-color:var(--input-bg);
  --pico-form-element-border-color:var(--case-edge);
  --pico-form-element-active-border-color:var(--patch-blue);
  --pico-form-element-focus-color:var(--patch-blue);
  --pico-form-element-valid-border-color:var(--cue-green);
  --pico-form-element-invalid-border-color:var(--live-red);
}
```
```html
<!-- index.html:247-251 — label ABOVE the field, mono helper beneath -->
<label>
  Arrival Time (optional)
  <input type="time" x-model="newGig.arrivalTime" ... />
  <small class="text-muted">When crew should arrive</small>
</label>
```

### 4.9 CHECKLISTS & PROGRESS (`.checklist-progress` / `.progress-bar-fill` / `.check-row`)

**What it is:** the Load-out ("To Gig") and Load-in ("From Gig") checklists and
their progress readout.
**roady name:** the **load-out clipboard** with a **PACKED** progress bar.
**Visual rules:** the progress block is a case-black plate with a 2px edge; the
track is `--input-bg`, the fill is a hard **`--cue-green`** block with **no
radius** (a console meter, not a pill). Rows are ≥44px tap zones; a checked
`.check-row` turns its box **cue-green**.

```css
/* implemented */
.checklist-progress { background:var(--case-black); border:var(--border); border-radius:0; }
.progress-bar { border:var(--border); border-radius:0; background:var(--input-bg) !important; }
.progress-bar-fill { background:var(--cue-green) !important; }
.check-row.is-checked .check-box { color:var(--cue-green); }
```
```html
<!-- index.html:357-378 — the load-out clipboard -->
<div class="checklist-progress">
  <div class="progress-text"><span x-text="getChecklistProgress(selectedGig.loadoutChecklist)"></span> loaded</div>
  <div class="progress-bar"><div class="progress-bar-fill" :style="`width: ${…}%`"></div></div>
</div>
<div class="checklist">
  <template x-for="(item, index) in selectedGig.loadoutChecklist" :key="index">
    <div class="check-row" :class="{ 'is-checked': item.checked }" @click="toggleChecklistItem('loadout', index)">
      <div class="check-box" x-text="item.checked ? '✅' : '⬜'"></div>
      <div class="check-name" x-text="getEquipmentName(item.equipmentId, item.itemNumber)"></div>
    </div>
  </template>
</div>
```

### 4.10 STATUS STAMPS (`.badge` / `.badge-missing|standby|go|idle|struck`)

**What it is:** every status chip.
**roady name:** **console-indicator stamps** — rectangular DYMO plates.
**Visual rules (LOCKED status → color):** square corners, 2px border, UPPERCASE
MONO. **Idle/neutral wears no paint;** only actions and problems get accent.

| State | Class | Fill | Text |
| --- | --- | --- | --- |
| MISSING / left behind / error | `.badge-missing` | `--live-red` | `--aluminum` |
| INCOMPLETE / syncing / soon | `.badge-standby` | `--standby-amber` | `--stage-black` |
| PACKED / GO / ready | `.badge-go` | `--cue-green` | `--stage-black` |
| IDLE / upcoming / neutral | `.badge-idle` | `--case-black` (aluminum border) | `--aluminum` |
| STRUCK / past / no data | `.badge-struck` | `--gaffer-gray` | `--stage-black` |

```css
/* implemented */
.badge {
  display:inline-block; border:var(--border); border-radius:0; padding:2px 6px;
  font-family:var(--font-body); font-size:11px; letter-spacing:.08em;
  text-transform:uppercase; font-weight:600;
}
.badge-missing { background:var(--live-red);      color:var(--aluminum); }
.badge-standby { background:var(--standby-amber); color:var(--stage-black); }
.badge-go      { background:var(--cue-green);     color:var(--stage-black); }
.badge-idle    { background:var(--case-black);    color:var(--aluminum); }
.badge-struck  { background:var(--gaffer-gray);   color:var(--stage-black); }
```
Green is allowed as a positive terminal state (`PACKED/GO`) because green is also
the primary "GO" accent — action and success share the color coherently.

### 4.11 EMPTY STATES (`.empty-state`)

**What it is:** the "nothing here yet" copy on every list.
**roady name:** a stencilled **empty-case plate** — labeled, awaiting stock.
**Visual rules:** a 2px aluminum-edged case-black plate, gaffer-gray uppercase mono
(no italics). It reads as an empty flight case with its stencil still on.

```css
/* implemented */
.empty-state {
  border:var(--border); border-radius:0; background:var(--case-black);
  color:var(--gaffer-gray); font-style:normal;
  font-family:var(--font-body); text-transform:uppercase; letter-spacing:.08em;
}
```
```html
<!-- index.html:313-315 — same class across gigs/gear/music/trash -->
<p x-show="!isLoading && getFilteredGigs().length === 0 && !showPastGigs" class="empty-state">
  No upcoming gigs. First, add your gear and gig types on the Gear page…</p>
```

### 4.12 HAZARD-STRIPE OFFLINE BANNER (`.hazard-stripe`)

**What it is:** the offline / queued-changes banner.
**roady name:** a strip of **gaffer hazard tape**.
**Visual rules:** the second documented non-flat surface — a 45° hard-stop
`repeating-linear-gradient` of `--hazard`/`--stage-black`, dimmed under a flat
scrim so aluminum text stays legible; 2px aluminum edge, uppercase mono.

```css
/* implemented — hazard tape, not a gradient wash */
.hazard-stripe {
  background:
    linear-gradient(rgba(14,14,16,.72), rgba(14,14,16,.72)),
    repeating-linear-gradient(45deg,var(--hazard) 0 12px,var(--stage-black) 12px 24px);
  color:var(--aluminum); border:var(--border); border-radius:0;
  padding:.5rem .75rem; font-family:var(--font-body);
  text-transform:uppercase; letter-spacing:.06em; font-weight:600;
}
```

---

## 05 — STAGE VIEW (the signature screen)

The Performance View (`.performance-view`) is roady's live hero screen: a gig's
set list, read-only, large-text, scrollable, used on stage and printable to PDF.

**On screen it STAYS DARK.** This is deliberate and load-bearing: the surface is
`--stage-black`, the song text is `--aluminum`, section headers are Oswald caps
underlined with a `2px --cue-green` rule (a lit cue line). The gaffer-tape /
Sharpie motif appears here only as **accents** (the green section rules, aluminum
titles) — never as a light surface.

**Rationale — on a dark stage.** A performer glancing down mid-song must not get a
blinding white screen. A phone flaring white kills night vision and reads across a
dark room. So the live view is dark by design; high-contrast aluminum-on-black is
the *most* readable choice under stage lighting, and it matches the room.

```css
/* implemented — the live view is dark; only headers carry the green cue rule */
.performance-view { background:var(--stage-black); color:var(--aluminum); }
.performance-title, .performance-section h3 {
  font-family:var(--font-display); text-transform:uppercase; letter-spacing:.02em;
}
.performance-section h3 { border-bottom:2px solid var(--cue-green); }
/* (white paper is applied only under @media print, above.) */
```

**White paper is PRINT / PDF ONLY.** The single light surface (`--setlist-paper`)
lives entirely in the existing `@media print` block, which flips the performance
view to a clean black-on-white sheet, hides the app chrome, and sizes type in
points. Screen = dark; paper = print. Never the reverse.

```css
/* implemented — css/styles.css @media print block (excerpt) */
@media print {
  @page { margin: 1.5cm; }
  nav, main, .no-print { display:none !important; }
  .performance-view { background:#fff !important; color:#000 !important; }
  .performance-view * { color:#000 !important; }
  .performance-section { page-break-inside: avoid; }
  .performance-title   { font-size: 22pt; }
  .performance-section h3 { font-size: 16pt; }
  .performance-section li { font-size: 14pt; }
}
```

### 5.1 ASCII wireframe — STAGE VIEW (live, DARK)

```
┌────────────────────────────────────────────┐  ← .performance-view (stage-black)
│                                    [ CLOSE ] │  ← .performance-toolbar .no-print
│  THE BLUE NOTES — MAIN SET                   │  ← .performance-title (Oswald caps, aluminum)
│  03 JUL 2026 · ARRIVAL 18:00 · START 21:00   │  ← .performance-meta (mono)
│                                              │
│  SET 1 ══════════════════════════════════    │  ← h3 + 2px cue-green underline
│   1  MIDNIGHT DRIVE                    4:12   │  ← aluminum song text, mono duration
│   2  NEON RAIN                         3:48   │
│   3  SLOW BURN                         5:03   │
│                                              │
│  ENCORE ═════════════════════════════════    │  ← green cue rule = the only accent
│   1  LAST CALL                         4:30   │
└────────────────────────────────────────────┘
```

---

## 06 — MOTION

Motion is **mechanical, not fluid** — a switch throwing, a case dropping into its
slot. Everything is a *step*, never a glide.

- **The press is the whole vocabulary.** On `:active`, controls
  `translate(2px,2px)` and drop their shadow — pressed into the case. The gig card
  does the same. There is **no hover transition to rely on**; the flight-case layer
  ships zero `:hover` rules.
- **`--snap:120ms linear`** is the only timing — a hard, even step. No `ease`, no
  `cubic-bezier`, no spring. It's applied to `transform`, `box-shadow`, and
  `background` on buttons.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, transitions are
  removed and `:active` no longer translates — the press still registers via shadow
  removal, so feedback never disappears.

```css
/* implemented */
:root { --snap:120ms linear; }
button:not(.sync-dot):not(.band-switcher-btn),
[role="button"], input[type="submit"], input[type="button"], input[type="reset"] {
  transition:transform var(--snap), box-shadow var(--snap), background var(--snap);
}
@media (prefers-reduced-motion: reduce) {
  button, [role="button"] { transition:none; }
  button:active, [role="button"]:active { transform:none; }
}
```

---

## 07 — ASCII WIREFRAME: GIGS (the main list)

Phone width, phone-first. Case ID panel on top, knolled flight-case SHOW cards
with corner plates, phone nav on the bottom.

```
┌────────────────────────────────────────────┐
│ ⟦ The Blue Notes ⟧ ▾              ● GEAR  ◐  │  ← .top-nav: gaffer-tape .band-name + sync LED
├────────────────────────────────────────────┤
│▟▟ OFFLINE — 2 CHANGE(S) QUEUED ▟▟   [RETRY] │  ← .hazard-stripe (only when offline)
├────────────────────────────────────────────┤
│ GIGS                              [ + GIG ]  │  ← h2 with hard bottom rule
│                                              │
│ ┌──────────────────────────────────────────┐│
│ │▐GIG▌                                      ││  ← .gig-item::before corner plate
│ │ MIDNIGHT SHOW                             ││  ← strong, Oswald caps
│ │ 03 JUL 2026 • SMALL CLUB                  ││  ← .text-muted mono
│ │ TO GIG: 7/12 | FROM GIG: 0/12             ││
│ │ [ TO GIG ][ FROM GIG ][ SET LIST ][ EDIT ]││  ← green primary + hollow/outline
│ └──────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────┐│
│ │▐GIG▌                                      ││
│ │ BACKYARD PARTY · STRUCK                   ││  ← .past-gig → .55 opacity + STRUCK stencil
│ │ 21 JUN 2026 • HOUSE PARTY                 ││
│ └──────────────────────────────────────────┘│
├────────────────────────────────────────────┤
│  ▐GIGS▌    GEAR     MUSIC     BAND          │  ← .bottom-nav; active = cue-green + inset bar
└────────────────────────────────────────────┘
```

---

## 08 — ASCII WIREFRAME: LOAD-OUT CHECKLIST ("To Gig")

The load-out clipboard: PACKED progress meter over a stack of ≥44px check rows.

```
┌────────────────────────────────────────────┐
│ ←  LEAVING FOR GIG — MIDNIGHT SHOW           │  ← <dialog> header, back arrow
├────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐│  ← .checklist-progress plate
│ │ 7/12 LOADED                              ││
│ │ ▐███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░▌ ││  ← .progress-bar-fill = cue-green, square
│ └──────────────────────────────────────────┘│
│                                              │
│  ✅  VOCAL MIC — SM58 #1        (cue-green)   │  ← .check-row.is-checked → green box
│  ✅  XLR CABLE 25FT #2                        │
│  ⬜  GUITAR AMP — DELUXE #1                   │  ← unchecked, aluminum
│  ⬜  DI BOX #1                                │
│  ⬜  MIC STAND #3                             │
│                                              │
│  [ + ADD ITEM TO THIS GIG ]                  │  ← .secondary outline (hollow)
├────────────────────────────────────────────┤
│                                     [ DONE ] │  ← green primary
└────────────────────────────────────────────┘
```

---

## 09 — DEPLOY

There is no build step. Browsers cache `styles.css` and the app JS hard, so **every
time you change any CSS or JS asset you MUST bump the `?v=` cache-buster on that
asset's tag in `index.html`.** Use one date-stamped token per deploy
(`YYYYMMDD` + a letter). This re-skin shipped at **`?v=20260703a`**.

```html
<!-- index.html:28-35 — bump these together on any CSS/JS change -->
<link rel="stylesheet" href="css/styles.css?v=20260703a">
<script src="js/auth.js?v=20260703a"></script>
<script src="js/sync.js?v=20260703a"></script>
<script src="js/db.js?v=20260703a"></script>
<script src="js/tenant-manager.js?v=20260703a"></script>
<script src="js/app.js?v=20260703a"></script>
```

(`nostr-universal.js` carries its own version and is bumped only when that module
changes.)

---

## 10 — "LOOKS RIGHT" CHECKLIST

Run this at ≤480px first (phone is primary), then desktop:

- [ ] **Dark.** Every on-screen surface is stage/case/tolex black; aluminum text.
      No light app surface anywhere (paper is `@media print` only).
- [ ] **Phone width.** Bottom-nav is the primary nav; the layout holds at ≤480px.
- [ ] **No hover.** Nothing depends on hover — the press (`:active`, translate 2px)
      is the only feedback; there are zero `:hover` rules in the flight-case layer.
- [ ] **≥44px targets.** Tab slots, check rows, and nav buttons are thumb-sized.
- [ ] **Square corners.** `border-radius:0` holds on cards, tabs, badges, inputs,
      buttons, dialogs, the progress bar, and the banner.
- [ ] **One accent per screen.** `--cue-green` marks the single action; red/amber
      appear only on real alerts; idle/healthy wears no paint.
- [ ] **Sync LED + hazard stripe are the only non-flat surfaces.** No gradients or
      soft shadows elsewhere; the block-shadow is the aluminum ghost.
- [ ] **Reduced motion respected** — translate drops, the press still reads.
- [ ] **Cache-buster bumped** on every changed CSS/JS asset in `index.html`.
