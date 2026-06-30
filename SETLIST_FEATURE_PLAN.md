# Set List Feature — Plan

Status: Draft for review
Owner: TBD
Last updated: 2026-06-30

## 1. Summary

Add a **Set List** capability so a band can plan the songs for a show, attach a
set list to a gig, and let every band member (and the roady) view it live on
their device or print it.

The feature reuses the codebase's existing **template → instance copy** pattern —
the same shape as `gig_type` (template) → `gig` (instance) — but for songs
instead of equipment:

- **Song catalog** — a reusable library of songs (like the Equipment catalog).
- **Set list templates** — ordered, sectioned references to catalog songs.
  Managed on a new **Set List** top-menu page (CRUD + duplicate + blank-create).
- **Set list instances** — a frozen **copy** of a template (or a blank list)
  attached to a single gig. Edited only from the gig. View mode + edit mode.

This is deliberately analogous to how gigs already work: `addGig()` copies the
gig type's equipment into the gig's checklists at creation time and never writes
back. Set lists copy the template's songs into the instance the same way.

## 2. Decisions (from interview)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Song representation | **Reusable Song catalog**; set lists reference catalog songs |
| 2 | Structure | **Sections/sets with headers** (Set 1, Set 2, Encore, …) |
| 3 | Template ↔ instance propagation | **Never auto-propagates.** Explicit "Save as new template" / "Update source template" actions only |
| 4 | History on the Set List menu | **No** in v1 — the Set List page is templates only; history lives on each gig |
| 5 | Live view | **Read-only big-text performance view + print/PDF.** No shared "now playing" position in v1 |
| 6 | Per-song fields | **Left open — see §3.1 proposed default below; override before build.** |

### 2.1 Open decision — song fields (needs sign-off)

Proposed default catalog schema (chosen to match "reusable catalog" + "total
runtime" being the usual #1 ask):

- `title` — **required**
- `artist` — optional (covers / originals)
- `durationSec` — optional; powers per-section and total runtime
- `key` — optional (e.g. `Am`, `E`)
- `bpm` — optional
- `lead` — optional (who fronts the song)
- `notes` — optional free text (cues: "segue", "capo 2", "singer talks")

**If you want fewer fields for v1 (e.g. title + duration + notes only), say so —
it only shrinks the catalog form; the data model below is unaffected.**

## 3. Data model

All docs follow the existing wire/legacy shape (`js/db.js` `_toLegacy` /
`_splitLegacy`): framing fields `_id` / `type` / `tenant` live in wire columns;
everything else lives in `body`. Every doc carries `tenant` for isolation and
participates in soft-delete (`deletedAt`) + outbox sync automatically via
`_putLocal`.

### 3.1 New doc types

```
song            — catalog entry (reusable)
setlist_template — template (lives on Set List page)
setlist          — instance (copy, attached to one gig)
```

#### `song`

```js
{
  _id: 'song_<timestamp>',
  type: 'song',
  tenant: '<tenantId>',
  title: 'String',          // required
  artist: 'String',         // optional
  durationSec: 0,           // optional (number, seconds)
  key: 'String',            // optional
  bpm: 0,                   // optional
  lead: 'String',           // optional
  notes: 'String',          // optional
  createdAt: 'ISO',
  deletedAt: 'ISO|undefined'
}
```

#### `setlist_template`

Sections each hold an ordered list of song references. A reference stores the
`songId` plus a small, denormalized snapshot so a list still renders if a
catalog song is later edited or deleted (mirrors how gigs tolerate orphaned
equipment ids).

```js
{
  _id: 'setlist_template_<timestamp>',
  type: 'setlist_template',
  tenant: '<tenantId>',
  name: 'String',                 // e.g. "Bar Show 90min", "Acoustic Brunch"
  sections: [
    {
      id: 'sec_<n>',              // stable within the doc
      name: 'Set 1',
      items: [
        {
          songId: 'song_...',     // catalog reference
          title: 'String',        // snapshot (resilience to catalog edits)
          durationSec: 0          // snapshot for runtime calc
          // perItem overrides (key/notes for THIS placement) optional, v2
        }
      ]
    }
  ],
  createdAt: 'ISO',
  deletedAt: 'ISO|undefined'
}
```

#### `setlist` (gig instance)

Identical structure to a template plus a back-reference to the gig and an
optional provenance pointer to the template it was copied from (for the
"update source template" action; `null` when blank-created).

```js
{
  _id: 'setlist_<timestamp>',
  type: 'setlist',
  tenant: '<tenantId>',
  gigId: 'gig_...',              // owning gig (1:1 in v1)
  sourceTemplateId: 'setlist_template_...|null',  // provenance, NOT a live link
  name: 'String',               // defaults to gig name or template name
  sections: [ /* same shape as template */ ],
  createdAt: 'ISO',
  deletedAt: 'ISO|undefined'
}
```

### 3.2 Relationships

```
song ──(referenced by, many)──▶ setlist_template.sections[].items[]
                              └▶ setlist.sections[].items[]

setlist_template ──(copied once)──▶ setlist     (sourceTemplateId provenance)

gig ──(1:1 in v1)──▶ setlist                     (setlist.gigId)
```

- A song can appear in many templates / instances.
- A template can be copied into many gig instances.
- **Copy semantics**: creating an instance deep-copies `sections`. No live link.
- **Gig ↔ setlist is 1:1 in v1.** (A gig has at most one set list. Multi-setlist
  per gig is a deliberate non-goal — see §8.)

## 4. Data-access layer (`js/db.js`)

Add methods mirroring the existing `getAllGigTypes` / `addGigType` /
`updateGigType` / `deleteGigType` / `restoreGigType` family. All go through
`_listByType` (reads) and `_putLocal` (writes) so sync + soft-delete come free.

```
// Songs (catalog)
getAllSongs()            → _listByType('song')
getDeletedSongs()
addSong(song)            → doc_id 'song_'+Date.now()
updateSong(song)
deleteSong(id)           // soft delete
restoreSong(id)

// Set list templates
getAllSetlistTemplates() → _listByType('setlist_template')
getDeletedSetlistTemplates()
addSetlistTemplate(tpl)
updateSetlistTemplate(tpl)
deleteSetlistTemplate(id)
restoreSetlistTemplate(id)
duplicateSetlistTemplate(id)   // deep-copy sections, new _id, name + " (copy)"

// Set list instances (per gig)
getSetlistForGig(gigId)        // returns the gig's setlist or null
addSetlistFromTemplate(gigId, templateId)  // deep-copy → setlist (sourceTemplateId set)
addBlankSetlist(gigId)         // empty sections → setlist (sourceTemplateId null)
updateSetlist(setlist)
deleteSetlist(id)
duplicateSetlist(id)           // duplicate an instance (→ another instance OR template, see §6.4)
```

`addSetlistFromTemplate` is the analog of `addGig(gig, gigType)` — read the
template, deep-clone `sections` (re-snapshotting `title`/`durationSec` from the
current catalog so the instance starts fresh and correct), write a `setlist`
doc.

## 5. UI — top-level navigation

Add a **Set List** entry to the top nav in `index.html` (the
`currentView`-driven `<nav>`), alongside Gigs / Equipment / Templates / Members.

```
currentView === 'setlists'
```

The Set List page has two tabs (same pattern as Equipment's
catalog/templates split via a sub-tab variable, e.g. `setlistTab`):

1. **Songs** (`setlistTab === 'songs'`) — the catalog.
2. **Templates** (`setlistTab === 'templates'`) — set list templates.

> Per decision #4, there is **no History tab** in v1.

### 5.1 Songs tab (catalog CRUD)

- List of songs (title, artist, duration, key…). Add / Edit / Delete.
- Delete uses the existing **snackbar-with-undo** soft-delete pattern
  (`showSnackbar(..., undo)` as in `deleteGigType`).
- Mirrors the Equipment Catalog view structure.

### 5.2 Templates tab (set list template CRUD)

- List of templates: name, section count, song count, total runtime.
- Buttons: **New blank set list**, **Duplicate**, **Edit**, **Delete** (undo).
- **Editor** (modal or full view):
  - Add/rename/reorder/delete **sections**.
  - Within a section: add songs **from the catalog** (picker), reorder, remove.
  - Quick-add: typing a new song title in the picker offers "Add to catalog".
  - Live per-section + total runtime readout (from `durationSec`).

Reordering: start with up/down buttons (no new dep). Drag-and-drop is a v2 nicety.

## 6. UI — gig integration

On the gig detail view (the `selectedGig` panel in `index.html`), add a
**Set List** section.

### 6.1 No set list yet

Show two actions:
- **Pick a template** → dropdown of `setlist_template`s →
  `addSetlistFromTemplate(gigId, templateId)`.
- **Start blank** → `addBlankSetlist(gigId)`.

(Selection UI mirrors the existing gig-type `<select>` in the new-gig form.)

### 6.2 Set list exists — View mode (default)

- Read-only rendering: sections with headers, numbered songs, per-section +
  total runtime.
- **Open performance view** button (§7).
- **Print** button (§7).
- **Edit** button → edit mode.

### 6.3 Set list exists — Edit mode

- Same editor as the template editor (§5.2), bound to the **instance**.
- Edits write only to the `setlist` doc. **Never touch the template** (decision #3).
- Provenance-aware actions:
  - **Save as new template** → `addSetlistTemplate` from current sections.
  - **Update source template** → overwrite `sourceTemplateId`'s sections
    (shown only when `sourceTemplateId != null`; confirm dialog, since it
    affects future gigs).

### 6.4 Duplicate

- **Duplicate a template** → new template (`duplicateSetlistTemplate`).
- **Duplicate a gig's set list** → primarily **"Save as new template"**
  (the durable reuse path). Copying one gig's instance directly onto another
  gig is possible but lower priority; default v1 path is via template.

## 7. Live view + print

### 7.1 Performance (live) view

- Read-only, **large legible text**, high contrast, scrollable.
- One screenful-friendly layout: section header + big song titles; optional
  small meta (key/duration) per song.
- Each person opens it on their own device independently.
- **No shared "now playing" position in v1** (decision #5). A device-local
  "tap song to highlight my place" is an optional small add; cross-device sync
  is explicitly deferred (would ride the existing outbox/WS sync — see §8).
- Implementation: a dedicated `currentView`/overlay state (e.g.
  `performanceSetlistId`) rendering full-screen; "wake lock" to keep the screen
  on is a nice-to-have.

### 7.2 Print / PDF

- A print-optimized layout via CSS `@media print` in `css/styles.css` (hide
  nav/buttons, black-on-white, page-break-friendly sections).
- "Print" button calls `window.print()`; the browser's print dialog covers
  "Save as PDF". No new dependency.

## 8. Non-goals (v1)

- Cross-device synced "now playing" cursor.
- Historical "what we actually played" browser on the Set List menu
  (instances still exist per gig; aggregation view deferred).
- Multiple set lists per gig.
- Per-placement song overrides (a song's key/notes differing per list slot).
- Drag-and-drop reordering (up/down buttons in v1).
- Lyrics / chord charts / attachments.
- Importing set lists from external services.

## 9. Implementation phases

1. **Data + DAL**
   - Add `song`, `setlist_template`, `setlist` doc types.
   - Implement all `js/db.js` methods in §4 (+ `js/storage.js` pass-throughs if
     that shim layer is still wired for the other types).
   - Load into Alpine state in `loadData()` (`songs`, `setlistTemplates`; gig
     setlist loaded on gig select).

2. **Song catalog UI** — Songs tab CRUD with undo soft-delete.

3. **Set list template UI** — Templates tab: list, blank-create, duplicate,
   section/song editor, runtime readout.

4. **Gig integration** — pick-template / start-blank, view mode, edit mode,
   "save as new template" / "update source template".

5. **Live view + print** — performance view + `@media print` styles.

6. **Verification + cleanup** — see §10; update `docs/database-design.md`,
   `docs/terminology.md`, `FEATURES.md`; changelog.

## 10. Acceptance criteria

- New **Set List** top-menu item; page has **Songs** and **Templates** tabs.
- Songs: create/edit/delete (with undo) catalog entries; tenant-isolated.
- Templates: create blank, duplicate, edit (sections + songs from catalog),
  delete (with undo); runtime totals correct.
- Gig: pick a template → a **copy** appears on the gig; editing the gig's set
  list does **not** change the template.
- Gig set list has working **view mode** and **edit mode**.
- "Save as new template" and "Update source template" behave per §6.3 (the
  latter only when copied from a template, behind a confirm).
- Performance view renders large, read-only, scrollable; print produces a clean
  black-on-white sheet.
- All new docs sync via the outbox and respect soft-delete.

## 11. Risks / notes

- **Catalog song edits vs. existing lists**: snapshots (`title`/`durationSec` on
  each item) keep old lists rendering; the snapshot can drift from the catalog.
  v1 accepts drift (view shows the snapshot); a "refresh from catalog" action is
  a possible v2.
- **Orphaned references**: deleting a catalog song must not break lists that
  reference it — render from the snapshot, flag as "(removed from catalog)".
  Same tolerance the app already has for orphaned equipment ids.
- **1:1 gig↔setlist** keeps gig wiring simple; revisit if bands want multiple
  set lists per show.
- **Field set (§2.1) is the one open decision** — confirm before Phase 1.
