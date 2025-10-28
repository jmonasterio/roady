# Product Requirements Document: Roady

## Overview
Roady is a web-based equipment checklist application for band roadies and touring professionals. It helps ensure all equipment is loaded before traveling to a gig and collected before leaving the venue.

## Technical Stack
- **Frontend Framework**: Alpine.js (no build step)
- **Database**: PouchDB (in-memory for initial version)
- **Architecture**: Pure frontend, no backend
- **Development**: Live reload dev mode
- **Platform**: Web application (mobile-responsive)

## Core Concepts

### 1. Equipment Catalog
A master list of all available equipment items.
- Each item has:
  - Name
  - Description (optional)
  - Photo placeholder (future version)

### 2. Gig Types
Templates for different types of shows with pre-configured equipment lists.
- Examples: "Small Club", "Outdoor Festival", "Theater", "House Show"
- Each type has:
  - Name
  - Associated equipment items from catalog

### 3. Gig Instances
Specific gigs scheduled for a particular date.
- Created from a Gig Type template
- Each instance has:
  - Date
  - Gig type reference
  - Two checklists:
    - **Load-out**: Check items as loaded into vehicle(s) before departure
    - **Load-in**: Check items as collected into vehicle(s) after gig

## User Workflows

### Initial Setup
1. Create equipment catalog (add individual items)
2. Create gig types (e.g., "Small Club")
3. Assign equipment items to gig types

### Per-Gig Workflow
1. Create new gig instance from a gig type template
2. Set gig date
3. Before travel:
   - Open load-out checklist
   - Check off each item as loaded into vehicle
4. After gig:
   - Open load-in checklist
   - Check off each item as collected into vehicle

### Future: Sharing
- Generate shareable link for gig checklist
- Others can view checklist status
- Multi-user check-off coordination

## MVP Features (Version 1.0)

### Must Have
- [ ] Equipment catalog management (create, edit, delete items)
- [ ] Gig type management (create, edit, delete types)
- [ ] Assign equipment to gig types
- [ ] Create gig instance from template
- [ ] Load-out checklist with check/uncheck capability
- [ ] Load-in checklist with check/uncheck capability
- [ ] Checklist progress indicator (X of Y items checked)
- [ ] Data persists in browser (PouchDB)
- [ ] Mobile-responsive design

### Should Have
- [ ] Search/filter equipment catalog
- [ ] Duplicate gig type
- [ ] Delete gig instance
- [ ] View past gigs (history)

### Won't Have (Future Versions)
- Photo uploads for equipment
- Sharing/collaboration features
- Backend synchronization
- User accounts
- Export/import data
- Notifications/reminders

## User Interface

### Main Navigation
- Equipment Catalog
- Gig Types
- Upcoming Gigs
- Past Gigs

### Key Screens

#### 1. Equipment Catalog
- List view of all equipment
- Add new item button
- Edit/delete actions per item

#### 2. Gig Types
- List of gig type templates
- Add new type button
- For each type: view/edit equipment list

#### 3. Gig Instance Detail
- Gig date and type
- Two tabs/sections:
  - **Load-out Checklist** (before travel)
  - **Load-in Checklist** (after gig)
- Progress indicator for each checklist
- Large checkboxes for easy mobile interaction

#### 4. Create/Edit Gig Type
- Name field
- Multi-select list of equipment from catalog

## Data Models

### Equipment Item
```javascript
{
  id: string,
  name: string,
  description: string,
  createdAt: timestamp
}
```

### Gig Type
```javascript
{
  id: string,
  name: string,
  equipmentIds: [string], // references to Equipment Items
  createdAt: timestamp
}
```

### Gig Instance
```javascript
{
  id: string,
  gigTypeId: string,
  date: date,
  loadoutChecklist: [
    { equipmentId: string, checked: boolean }
  ],
  loadinChecklist: [
    { equipmentId: string, checked: boolean }
  ],
  createdAt: timestamp
}
```

## Development Setup

### Dev Mode Requirements
- Simple HTTP server (Python `http.server` or similar)
- File watcher for auto-reload (live-server, browser-sync, or custom)
- No build/compile step required

### Project Structure
```
/roady
  /css
    styles.css
  /js
    app.js
    db.js
  /lib
    alpine.js (CDN or local)
    pouchdb.js (CDN or local)
  index.html
  PRD.md
  README.md
```

## Success Metrics
- User can create a complete equipment catalog in < 5 minutes
- User can create and schedule a gig in < 2 minutes
- Checklist interaction is intuitive enough for use while loading equipment
- Zero data loss on browser refresh

## Future Enhancements (Post-MVP)
1. Photo support for equipment items
2. Shareable gig checklists (read-only or collaborative)
3. Equipment categories/tags
4. Notes field per gig instance
5. Venue information
6. Vehicle assignment per item
7. Backend sync for multi-device access
8. Export to PDF/print
