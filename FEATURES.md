# Roady - Features Guide

This document outlines all the features implemented in the latest session.

## 1. Soft Deletes & Trash System

### Overview
Instead of permanently deleting items, Roady marks them as deleted with a timestamp. This allows recovery of accidentally deleted items.

### How It Works
- When you delete an item (gig, equipment, or template), it's marked with a `deletedAt` timestamp
- Deleted items are hidden from all normal views (My Gigs, Equipment Catalog, Templates)
- Deleted items can be viewed and restored from the Trash tab

### Trash Tab
Located in Settings, the Trash tab shows all deleted items organized by type:
- **Deleted Gigs** - sorted by deletion date (oldest first)
- **Deleted Templates** - sorted by deletion date (oldest first)
- **Deleted Equipment** - sorted by deletion date (oldest first)

Each section has:
- Pagination (10 items per page)
- Previous/Next navigation
- Delete date displayed with each item
- Restore button to recover the item

### API
- `DB.deleteGig(id)` - Mark gig as deleted
- `DB.restoreGig(id)` - Restore gig from trash
- `DB.getDeletedGigs()` - Fetch all deleted gigs
- (Same methods available for equipment and templates)

---

## 2. Snackbar Undo Notifications

### Overview
After deleting any item, a snackbar notification appears with an "Undo" button for quick recovery.

### Features
- Appears at bottom left of screen after deletion
- Shows the item name (e.g., "Deleted gig 'Blue Note'")
- Auto-dismisses after 4 seconds if not interacted with
- Undo button restores the item immediately
- Dismiss button (✕) closes the snackbar manually

### Implementation
- Snackbar automatically loads restored items back into the app
- No page reload needed
- Works for gigs, equipment, and templates

---

## 3. Inline Confirmation Modals

### Overview
All deletion operations now use polished inline modals instead of browser `confirm()` dialogs.

### Features
- Clean modal dialog with clear title and message
- Dangerous actions (deletes) show red Delete button
- Cancel button to abort the action
- Informative messages that explain what will happen
- Mentions that items can be restored from Trash

### Deletion Scenarios
- **Delete Equipment** - "Delete this equipment item?"
- **Delete Template** - "Delete this template? Existing gigs will keep their current equipment list."
- **Delete Gig** - "Delete '[gig name]'? You can restore it from Trash."

---

## 4. Template Equipment Synchronization

### Overview
When you open a gig that hasn't been started yet, its equipment automatically syncs with the current template.

### How It Works
1. Open a clean gig (no items loaded/packed)
2. If the template has changed since the gig was created, the gig updates to match
3. Equipment is rebuilt from the current template
4. Only syncs if equipment changed - no unnecessary updates
5. Once you start loading items, the gig becomes "locked" and won't update from template changes

### Benefits
- Template edits automatically apply to unused future gigs
- No manual update dialogs needed
- Clean gigs always have current equipment
- Working gigs stay stable (won't lose progress tracking)

### Technical Details
- Uses `gigHasChecklistProgress()` to detect if gig is "dirty"
- Compares equipment sets before updating
- Filters out deleted equipment when building checklists
- Updates both loadout and loadin checklists

---

## 5. Accurate Equipment Counts

### Overview
Template equipment count now accurately reflects active (non-deleted) equipment.

### Features
- Counts only equipment that still exists
- Automatically updates when equipment is deleted
- Handles both old and new template formats
- Respects equipment quantities (counts total items, not unique equipment)

### Example
- Template has 5 equipment items
- You delete one piece of equipment
- Template count updates to 4 immediately

---

## 6. Template Delete in Edit Dialog

### Overview
Moved template delete button to the edit dialog for consistency.

### Changes
- Template list only shows Edit button (plus name and count)
- Delete button appears when you open the edit dialog
- Red styling on delete button to indicate destructive action
- Same pattern as equipment and gig deletion

### Benefit
- Consistent UI across all item types
- Prevents accidental deletions from the list view
- Clear intent when entering edit mode

---

## 7. Band Name in Headers

### Overview
The main heading now displays the band name instead of generic "My Gigs".

### Examples
- Band: "demo" → "demo Gigs"
- Band: "The Beatles" → "The Beatles Gigs"
- No band set → "My Gigs" (fallback)

### Implementation
- Updates in both navigation link and page header
- Shows "Loading..." during data fetch to prevent flicker
- Uses `options.tenantId` for band name

---

## 8. Loading State

### Overview
App shows "Loading..." state while fetching data to prevent UI flicker.

### When It Shows
- Initial app load
- When switching bands

### Benefits
- No jarring "My Gigs" → "Demo Gigs" flicker
- Users know data is being fetched
- Smooth, professional appearance

---

## 9. Fixed Alpine.js Null Errors

### Overview
Fixed all null reference errors in Alpine.js templates using optional chaining.

### What Was Fixed
- `selectedGig.arrivalTime` → `selectedGig?.arrivalTime`
- `selectedGig.doorsOpenTime` → `selectedGig?.doorsOpenTime`
- `selectedGig.mapLink` → `selectedGig?.mapLink`

### Impact
- No more console errors when accessing gig properties
- Graceful handling of null/undefined values
- Cleaner, safer template code

---

## 10. Multi-line Delete Buttons

### Overview
Delete buttons in edit dialogs now wrap to multiple lines if needed.

### Changes
- Added `flex-wrap: wrap` to dialog footers
- Buttons can wrap to second line instead of text wrapping
- Maintains proper spacing and alignment

### Affected Dialogs
- Gig edit
- Equipment edit
- Template edit

---

## Database Schema Changes

### All Document Types Now Include

```javascript
{
  _id: "unique_id",
  type: "gig|equipment|gig_type",
  tenant: "band_name",
  createdAt: "2024-11-01T12:00:00Z",
  deletedAt: "2024-11-01T14:30:00Z"  // Only if deleted
  // ... other fields
}
```

### Benefits
- Soft delete support
- Tenant isolation
- Audit trail with timestamps

---

## User Experience Improvements

### Summary of UX Improvements
1. **Safety** - Nothing is permanently deleted, undo is always available
2. **Clarity** - Loading states and clear modal dialogs
3. **Consistency** - Unified patterns for all deletions
4. **Flexibility** - Templates adapt to gigs that haven't been used yet
5. **Accuracy** - Equipment counts always match reality
6. **Polish** - No flickering, proper error handling, clean UI

---

## Testing Recommendations

1. **Soft Deletes**
   - Delete a gig, equipment, and template
   - Verify snackbar appears with undo option
   - Check Trash tab shows all deleted items
   - Test restore functionality

2. **Template Sync**
   - Create template with 3 items
   - Create gig from template (clean)
   - Edit template to have 2 different items
   - Open gig - should see new 2 items
   - Mark an item loaded, edit template again
   - Open gig - should keep original items (locked)

3. **Equipment Deletion**
   - Add equipment to template
   - Verify count is correct
   - Delete the equipment
   - Verify template count updates
   - Verify gigs don't show deleted equipment

4. **Band Names**
   - Create multiple bands
   - Verify header updates on switch
   - Check no flicker during load

---

## Implementation Details

### Key Files Modified
- `js/app.js` - Alpine component logic
- `js/db.js` - Database operations
- `index.html` - UI templates

### New State Variables
- `snackbar` - Undo notification state
- `confirmationDialog` - Modal confirmation
- `deletedItems` - Trash data
- `isLoading` - Loading state
- `trashCurrentPage` - Pagination state

### Key Methods
- `showSnackbar()` - Display undo notification
- `showConfirmation()` - Display confirmation modal
- `loadDeletedItems()` - Fetch deleted items
- `restoreDeletedItem()` - Restore from trash
- `viewGigDetail()` - Enhanced with template sync

---

