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

**UI Location**: Settings tab → Equipment Catalog section

---

### Gig Type
A reusable template defining which equipment is needed for a specific category of performance.

**Examples**: Small Club, Outdoor Festival, Theater Show, House Party

**Database**: `gigTypes` collection with array of equipment IDs

---

### Gig Instance (or "Gig")
A specific scheduled performance on a particular date.

**Components**: Name, date, gig type reference, two checklists

**Database**: `gigs` collection

---

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

### Settings (Admin View)
Administrative interface for managing equipment catalog and gig type templates.

**Workflow**: Setup and configuration (done occasionally)

---

### Add Item to This Gig
Feature allowing on-the-fly equipment addition while preparing for a gig.

**Options**:
- Select from existing equipment not in this gig
- Create new equipment item

**Follow-up**: Prompts to add item to gig type template for future gigs

---

## Status & Progress Terms

### Future Gigs
Gigs with dates equal to or after today.

**Significance**: When editing gig types, only future gigs are updated; past gigs remain unchanged

---

### Progress Indicator
Completion status shown as "X/Y" (e.g., "3/5" = 3 of 5 items checked)

---

## Technical Terms

### PouchDB
Client-side NoSQL database storing all data in browser's IndexedDB.

**Characteristics**: Schema-less, offline-capable, persistent

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
