# Agent Guide

This document provides guidance for AI agents (like Claude Code) working on the Roady codebase.

## Project Overview

**Roady** is a web-based equipment checklist application for band roadies and touring professionals. It helps ensure all equipment is loaded before traveling to a gig and collected before leaving the venue.

## Architecture

- **Frontend**: Alpine.js (no build step)
- **Database**: PouchDB (in-browser, no backend)
- **Styling**: Pico CSS + custom CSS
- **No compilation**: Direct browser execution

## Key Documents

- [`PRD.md`](../PRD.md) - Product requirements and feature specifications
- [`README.md`](../README.md) - Setup instructions and quick start
- [`database-design.md`](./database-design.md) - Database schema and design decisions
- [`terminology.md`](./terminology.md) - Glossary of terms used in the application

## Project Structure

```
/roady
  /css
    styles.css          # Custom styles (Pico CSS overrides)
  /js
    app.js              # Alpine.js application logic
    db.js               # PouchDB database operations
  /docs
    agent.md            # This file
    database-design.md  # Database schema documentation
  index.html            # Main application (single page)
  PRD.md                # Product requirements document
  README.md             # User documentation
```

## Core Concepts

### 1. Equipment Catalog
Master list of all equipment items (mics, cables, amps, etc.)

### 2. Gig Types
Reusable templates defining equipment lists for different types of shows:
- Small Club
- Outdoor Festival
- Theater
- etc.

### 3. Gig Instances
Specific scheduled gigs with two separate workflows:
- **Leaving for Gig** (home → venue): Check items as loaded into vehicle
- **Leaving from Gig** (venue → home): Check items as loaded back into vehicle

## User Workflows

### Setup Workflow (Settings)
Occasional administrative tasks:
1. Add equipment to catalog
2. Create/edit gig type templates
3. Assign equipment to gig types

### Active Workflow (My Gigs)
Day-to-day operations:
1. Create gig instance from template
2. Before travel: check off items as loaded
3. After gig: check off items as collected
4. Add ad-hoc items during loading (optional: add to template)

## Development Guidelines

### Code Style
- Use Alpine.js reactive patterns (`x-data`, `x-show`, `x-model`)
- Keep logic in `app.js`, database operations in `db.js`
- Use Pico CSS classes where possible, custom CSS for specific needs
- No build tools - all code runs directly in browser

### Database Operations
- Always use `async/await` for PouchDB operations
- Reload data after mutations: `await this.loadData()`
- Refresh selected gig after updates: `this.selectedGig = await DB.getGig(this.selectedGigId)`
- See [`database-design.md`](./database-design.md) for schema details

### UI Patterns
- **Navigation**: Two main views (My Gigs, Settings)
- **Dialogs**: Native `<dialog>` elements with Pico CSS styling
- **Mobile**: Full-screen dialogs on devices under 768px
- **Forms**: Use Pico form elements, validate before submission

### Key Features to Preserve

1. **Separate Checklist Dialogs**
   - "To Gig" and "From Gig" are separate dialogs (not tabs)
   - Different workflows with distinct UX

2. **Smart Return Checklist**
   - Shows only items checked when leaving home
   - Collapsible section for items NOT brought (safety check)

3. **Add Items During Loading**
   - Can add new items while preparing for gig
   - Prompt to add to gig type template for future

4. **Gig Type Editing**
   - When editing gig type, update all future gigs (date >= today)
   - Preserve checked states for existing items
   - Past gigs remain unchanged

## Testing Workflow

Since there's no build step, testing is manual:

1. Start local server:
   ```bash
   # Option 1: Python
   python -m http.server 8000

   # Option 2: live-server (recommended)
   npm install -g live-server
   live-server --port=8000
   ```

2. Open browser to `http://localhost:8000`

3. Test workflows:
   - Settings: Add equipment, create gig types
   - My Gigs: Create gig, use checklists
   - Mobile: Test in responsive mode (full-screen dialogs)

## Common Tasks

### Adding a New Field to Equipment
1. Update `DB.addEquipment()` in `db.js`
2. Add input field to form in `index.html`
3. Update display in equipment list
4. No migration needed (schema-less)

### Adding a New Feature
1. Check PRD for requirements
2. Add to `app.js` (logic) and `index.html` (UI)
3. Update CSS if needed
4. Test both desktop and mobile views

### Fixing a Bug
1. Identify affected component (equipment, gig types, gigs)
2. Check database operations in `db.js`
3. Verify Alpine.js reactivity in `app.js`
4. Test the complete user workflow

## Important Notes

### What NOT to Do
- ❌ Don't add build tools (webpack, vite, etc.)
- ❌ Don't add Node.js dependencies (except dev servers)
- ❌ Don't use npm packages (use CDN links)
- ❌ Don't add backend/server code
- ❌ Don't modify PouchDB schema (it's schema-less)

### Mobile-First Considerations
- Touch targets should be 44px minimum
- Dialogs are full-screen on mobile (<768px)
- Use `role="switch"` for checklist checkboxes
- Test with device toolbar in browser

### Data Persistence
- All data stored in IndexedDB (browser)
- Clears if user clears browser data
- No cloud sync (future enhancement)
- Export/import not implemented (future)

## Future Enhancements

See PRD.md "Future Enhancements" section for planned features:
- Photo support for equipment
- Sharing/collaboration
- Equipment categories
- Notes per gig
- Multi-device sync

## Summary Recommendations for Your PWA

- **Primary action (Create / Submit):** Use a sticky bottom button for main actions. This improves reachability on iOS & Android.
- **Cancel / Back:** Place a button at the top-left. This matches user expectations on mobile platforms.
- For very short forms, a top submit button is optional but not standard.
- **Tech stack:** Pico.css and Alpine.js make sticky footers, buttons, and Alpine click handlers easy to implement.
- **Usability:** Avoid top-only submit on long forms—users may miss it.

### How to Implement Sticky Bottom Actions in a PWA (Alpine.js + Pico.css)

**Option 1: Sticky Bottom Action (Recommended)**

- Works on both iOS and Android guidelines.
- Ensures users don’t have to scroll excessively to submit.

```html
<div class="form-container">
  <form x-data="{ name: '' }" @submit.prevent="submitForm">
    <label>Name</label>
    <input type="text" x-model="name">

    <label>Email</label>
    <input type="email">
    <!-- other form fields -->
  </form>

  <!-- Sticky footer -->
  <div class="sticky-footer" style="position: sticky; bottom: 0; padding: 1rem; background: white; border-top: 1px solid #ddd;">
    <button class="primary" @click="submitForm">Create</button>
    <button class="secondary" @click="cancelForm">Cancel</button>
  </div>
</div>
```

**Notes:**
- Pico.css buttons (`.primary`, `.secondary`) give good visual hierarchy.
- `position: sticky; bottom: 0` keeps buttons visible at the bottom while scrolling.
- Works well for long forms; meets both iOS & Android reachability guidelines.

## Questions?

Refer to:
1. [`PRD.md`](../PRD.md) - Feature requirements
2. [`database-design.md`](./database-design.md) - Data structure
3. [`terminology.md`](./terminology.md) - Terms and definitions
4. [`README.md`](../README.md) - User guide
5. Source code comments in `app.js` and `db.js`
