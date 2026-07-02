# Terminology

This document defines the key terms used throughout the Roady application and codebase.

## Real-World Context

When touring bands move equipment in and out of venues, there's specialized vocabulary used by the crew. The process of getting everything from the truck onto the stage is called **load-in**, while packing it all back up is called **load-out**.

During load-in, crew members refer to **cases** (hard-shell boxes protecting gear), **racks** (metal frames holding amplifiers/effects), and **stands** (for mics, instruments, or lights). The front-of-house (FOH) engineer talks about **mics**, **DI boxes**, and **snakes**, while the monitor engineer focuses on **wedges** or **in-ear monitors**.

The **truck** or **rig** carries all equipment, while crew members are called **techs**, **roadies**, or **stagehands**. Loading involves careful sequencing with heavy items (drum kits) moved first, followed by guitars, keyboards, and amps. Everything is labeled and referenced against the **stage plot** and **input list**. When the show wraps, the crew performs the **load-out** under tight time constraints. Sometimes **strike** is used—"strike the stage" meaning to completely dismantle it.

### A Day on the Road

> The tour truck rolls up to the venue, and the crew jumps into action. "Alright, cases first, drums on the right, guitars on the left," calls the stage manager as the roadies start unloading heavy flight cases. Techs wheel out the drum riser and set up the backline while another crew patches in wedges and snakes to the stage inputs. "Patch the kick mic to channel one, snare to three," the FOH engineer shouts over the chatter. Meanwhile, the monitor tech is lining up in-ear packs, checking mixes for each band member. Every amp, keyboard, and mic stand has its place according to the stage plot taped to the riser, and the input list guides the soundchecks.
>
> After the last chord of the night, the process flips into load-out mode. "Strike the stage!" someone calls, and the crew moves with practiced efficiency. Drums go back in their padded cases, guitars get unplugged and racked, wedges stacked neatly, and every cable coiled and labeled. The truck swallows the night's work piece by piece, leaving the venue quiet but ready for tomorrow.

---

## Industry Terminology Reference

### Common Roadie & Touring Terms

* **Load-in** – Moving all instruments, amps, and gear from the truck onto the stage before the show.
* **Load-out** – Packing everything back into the truck after the show.
* **Strike** – To completely dismantle a stage setup; often used interchangeably with load-out.
* **Truck / Rig** – Vehicle carrying all the band's gear.
* **Case / Road Case / Flight Case** – Protective box used to transport instruments, amps, or delicate gear.
* **Rack** – Metal frame that holds amplifiers, effects units, or other audio equipment.
* **Stage Plot** – Diagram showing where all instruments, amps, monitors, and microphones go on stage.
* **Input List / Patch List** – List of all audio inputs and how they connect to the mixing console.
* **Snakes / Multicore** – Bundled cables that carry multiple audio signals from stage to FOH.
* **DI Box** – Direct Input box; converts instrument signals for mixing and recording.
* **Wedge / Stage Monitor** – Speaker on stage facing performers so they can hear themselves.
* **In-ear Monitors (IEMs)** – Earphones performers use to hear a customized mix.
* **Tech / Roadie / Stagehand** – Crew members responsible for moving, setting up, and maintaining gear.
* **Rigging** – Setting up lights, speakers, and other suspended stage equipment.
* **Patch** – Connecting cables to the correct channels.
* **Backline** – Key instruments and amplifiers provided on stage (drums, keyboards, guitar/bass amps).
* **Set / Gig** – The scheduled performance.

---

## Roady Application Terms

### Equipment
Individual pieces of gear that need to be transported to gigs.

**Examples**: Microphones, cables, amplifiers, speakers, instruments, stands, power supplies

**Database**: `equipment` collection

---

### Equipment Catalog
The master list of all equipment items available.

**UI Location**: Gear page → Catalog tab

---

### Gig Type
A reusable template defining which equipment is needed for a specific category of performance.

**Examples**: Small Club, Outdoor Festival, Theater Show, House Party

**UI Location**: Gear page → Gig Types tab

**Database**: `gigTypes` collection with array of equipment IDs

---

### Gig Instance (or "Gig")
A specific scheduled performance on a particular date.

**Components**: Name, date, gig type reference, two checklists

**Database**: `gigs` collection

---

### Song
An individual song the band performs, stored in the reusable Song Catalog.

**Components**: Title (required); optional artist, duration, key, BPM, lead, notes

**Database**: `song` collection

---

### Song Catalog
The master list of all songs available to add to set lists.

**UI Location**: Set List page → Songs tab

---

### Set List Template
A reusable, sectioned list of songs (Set 1, Set 2, Encore, …) copied onto a gig to create a per-gig set list.

**Examples**: "Bar Show 90min", "Acoustic Brunch", "Festival Main Set"

**Database**: `setlist_template` collection (sections of song references)

**UI Location**: Set List page → Templates tab

---

### Set List (or "Set List Instance")
The actual set list for one specific gig — a frozen copy of a template (or blank), edited only from the gig, and viewed live or printed by the band and crew.

**Components**: Gig reference, optional source-template provenance, sections of songs

**Database**: `setlist` collection (1:1 with a gig in v1)

---

### Section / Set
A named group within a set list (e.g., "Set 1", "Encore") holding an ordered list of songs.

---

### Performance View
A read-only, large-text, scrollable rendering of a gig's set list for live use on a band member's or roady's device. Print-friendly via `@media print`.

---

### Band
The workspace all data lives in — every equipment item, gig, song, and set list belongs to exactly one band. Technically a **tenant** in MyCouch/couch-sitter.

**ID formats**: internal `tenant_<uuid>` (stored in `_id`); virtual/API format is the bare UUID. Callers convert explicitly — no silent conversion (see AGENTS.md).

**App state**: `userBands`, `currentBandTenantId`, `currentBandName`

---

### Active Band
The band currently selected on this device. All views show only the active band's data; switching bands reloads everything.

**Persistence**: Dexie meta `active_tenant_id` (no server-side session under MNA1)

---

### Band Role
Permission level of an account within a band: **owner** (creator; can remove members, claim roster members), **admin** (full access), **member** (can modify).

**UI Location**: Band page → Members tab; role picker in the invite dialog

---

### Roster Member
A *person* in the band (name + role/instrument, e.g. "Anna · drums"). Exists independently of app accounts — a roster member may have zero, one, or many device keys linked.

**Database**: band member docs (`bandMembers`)

---

### Device Key
One Nostr keypair with access to the band. Many device keys can map to one roster member (phone + laptop = two keys, one person).

**Invite modes**: **Add a Device** (extra key for an existing member; oldest key drops off past the limit) vs. **Replace Lost Device** (revokes ALL of that member's current keys — only the new device works afterward)

---

### Claiming (Assign Yourself)
The owner linking their own device key to a roster member ("List yourself as X in the roster"). Owner-only action.

---

### Invitation
A generated, shareable link granting band access with a chosen role, optionally pre-linked to a roster member. Created via backend API (online-only, token-based — tokens expire); accepted on any device. Includes a pre-filled share message template.

**UI Location**: Band page → Members tab → "+ Invite Member" → "Generate Invite Link"


## Workflow Terms

### Leaving for Gig / To Gig
Loading equipment into vehicle(s) before departing from home to the venue.

**Checklist**: `loadoutChecklist`

**UI**: "To Gig" button opens this checklist

---

### Leaving from Gig / From Gig
Loading equipment back into vehicle(s) after the gig ends to return home.

**Checklist**: `loadinChecklist`

**UI**: "From Gig" button opens this checklist

**Smart Feature**: Shows only items checked when leaving home, with collapsible section for items not brought

---

### Items Brought
Equipment checked off when leaving for the gig.

**Logic**: `loadoutChecklist[].checked === true`

**Display**: Primary list in "Leaving from Gig" dialog

---

### Items Not Brought
Equipment NOT checked off when leaving for the gig.

**Logic**: `loadoutChecklist[].checked === false`

**Display**: Collapsible "safety check" section with warning

**Purpose**: Catch forgotten items or equipment unexpectedly found at venue

---

## UI Navigation

### My Gigs (Main View)
Primary day-to-day interface for creating and managing gig instances.

**Workflow**: Create gigs, use checklists during travel

---

### Bottom Tab Bar (Mobile)
Fixed navigation bar on screens ≤768px with four tabs: Gigs · Gear · Music · Band. Replaces the desktop link row on phones.

---

### Band Page
One hub for people and administration, with tabs: **Members** (accounts + roster + invitations), **Info** (band rename, leave/delete band, create another band), **Options** (profile, sign out, sync settings), **Trash**.

---

### Band Switcher
The band name in the top bar. With one band it's a plain title (tap → Band page); with multiple bands it shows a ▾ chevron and opens a sheet listing bands (checkmark on current, "+ Create band"). Replaces the old Bands page.

---

### Top Bar
App chrome: band-name switcher on the left (no brand text once a band is loaded), sync status + avatar on the right. Desktop adds the four view links and user details; mobile slims to switcher, **sync dot**, and avatar.

---

### Sync Dot
Small colored indicator of sync status in the mobile top bar: green = connected (paused), yellow = syncing (active), red = error.

---

### Snackbar
Transient toast notification for action feedback (e.g. "Switched to The Blue Notes").


### Gear Page
Equipment management: Catalog tab (all items) and Gig Types tab (reusable equipment lists per kind of show).

---

### Music Page
Song catalog (Songs tab) and reusable set lists (Set Lists tab).

---

### Add Item to This Gig
Feature allowing on-the-fly equipment addition while preparing for a gig.

**Options**:
- Select from existing equipment not in this gig
- Create new equipment item

**Follow-up**: Prompts to add item to the gig's gig type for future gigs

---

## Status & Progress Terms

### Future Gigs
Gigs with dates equal to or after today.

**Significance**: When editing gig types, only future gigs are updated; past gigs remain unchanged

---

### Progress Indicator
Completion status shown as "X/Y" (e.g., "3/5" = 3 of 5 items checked)

---

## Identity & Authentication (Nostr)

### Nostr Identity / npub
A user is identified by a Nostr public key, displayed as an `npub…` string. Display name and avatar come from the key's Nostr profile. There are no passwords or email accounts.

---

### Signer
The component holding the private key and producing signatures — the app never sees the key. Kinds:

* **NIP-07 browser extension** – Alby, nos2x, Flamingo (desktop)
* **NIP-46 remote signer** – a separate signer app reached via relay:
  * `bunker://` – signer-initiated; user pastes the URI
  * `nostrconnect://` – client-initiated; shown as QR or deep link (e.g. Amber on Android)
* **Local dev key** – raw nsec/hex import, development only
* **Guest mode** – throwaway local identity

---

### MNA1 (MyCouch Nostr Auth v1)
Per-request signed envelopes replacing token sessions. Every HTTP request carries `Authorization: Nostr <base64(NIP-98 event)>` (kind 27235, with a `payload` body hash when non-empty); WebSocket frames carry envelopes in `hello`/`reauth`. No tokens, no server session.

---

### Signer Offline vs. Signer Denied
Two distinct failure states:

* **Signer offline** – network/relay outage; dismissible banner, auto-retry with backoff, changes keep saving locally
* **Signer denied** – identity exists but signing permission was not granted; blocking modal forcing a reconnect that re-requests permissions

---

## Sync & Storage

### MyCouch
The auth/sync proxy the app talks to for everything (REST + WebSocket). The frontend never talks to CouchDB directly.

---

### couch-sitter
The tenant registry backend. Band creation registers the tenant there with `applicationId: "roady"` so cascade deletion works.

---

### Outbox
Queue of local writes not yet acknowledged by the server. Drained in batches (`PUT /:db/:id`); each document row carries a `pending` count of unacked ops.

**Database**: Dexie `outbox` table

---

### Live Changes
Real-time updates over WebSocket `/:db/_ws` (hello → catchup → change). Falls back to HTTP `GET /changes?since=` polling when the WS can't connect.

---

### Sync Status
`idle | connecting | active | paused | error` — surfaced as text on desktop ("Not syncing" / "Syncing..." / "Connected" / "Sync Error") and as the sync dot on mobile. Note: **paused means healthy** (connected, nothing to push).

---

### Local-First / Optimistic Update
Writes land in Dexie immediately and sync in the background — gigs, equipment, songs, checklists all work offline. Exceptions are online-only by design: band creation, invitations, member removal (access control and expiring tokens need immediate server answers).

---

## Technical Terms

### Dexie
IndexedDB wrapper storing all data client-side: `documents` + `outbox` + `meta` tables per band/remote scope, plus a `roady_options` local-only store (never synced).

**History**: Replaced PouchDB in the Phase C.9 rewrite (`js/db.js`) with the same DAL surface; PouchDB references elsewhere in the docs are historical.

---

### Alpine.js
Lightweight reactive JavaScript framework.

**Usage**: `x-data`, `x-show`, `x-model`, `@click` attributes

---

### Pico CSS
Classless CSS framework providing base styling.

**Features**: Semantic HTML, mobile-first, dark mode support

---

### Dialog
Native HTML `<dialog>` elements for modals/popups.

**Mobile**: Full-screen on devices under 768px width

---

## Important Notes

### Terminology in Roady vs. Real World

**Real World**: "Load-in" = arriving at venue and setting up on stage

**Roady App**: "Leaving for Gig" / "To Gig" = loading vehicle at home before travel

The app deliberately uses different terminology to avoid confusion, since the focus is on vehicle loading (not venue setup).

---

### Anti-Patterns (Terms to Avoid)

❌ **Don't say "load-in" for leaving home**
- Incorrect: "Load-in checklist for leaving home"
- Correct: "Leaving for Gig" or "To Gig"

❌ **Don't say "database tables"**
- Incorrect: "Equipment table"
- Correct: "Equipment collection" or "equipment database"

❌ **Don't say "gig template"**
- Incorrect: "Select a gig template"
- Correct: "Select a gig type"

---

## Abbreviations

* **PRD** – Product Requirements Document
* **PWA** – Progressive Web App
* **CRUD** – Create, Read, Update, Delete
* **UI** – User Interface
* **UX** – User Experience
* **FOH** – Front of House (sound engineer position)
* **IEM** – In-Ear Monitor
* **DI** – Direct Input
* **NIP** – Nostr Implementation Possibility (protocol spec, e.g. NIP-07, NIP-46, NIP-98)
* **MNA1** – MyCouch Nostr Auth v1 (per-request signed envelopes)
* **WS** – WebSocket
* **DAL** – Data Access Layer
