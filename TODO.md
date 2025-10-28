# TODO

## Future Features

### CouchDB Sync
- [x] Implement CouchDB synchronization
  - [x] Use configured CouchDB URL from Options
  - [x] Bidirectional sync for all databases
  - [x] Conflict resolution strategy (last-write-wins via PouchDB)
  - [x] Sync status indicator in UI
  - [ ] Authentication (username/password) - currently uses URL auth
  - [x] Auto-sync continuous when URL configured
  - [x] Offline queue for pending changes (built into PouchDB)

### CouchDB Sync Enhancements
- [ ] Manual sync button (in addition to auto-sync)
- [ ] Sync conflict resolution UI for manual conflicts
- [ ] Separate username/password fields (instead of URL auth)
- [ ] Per-database sync control (enable/disable individual databases)
- [ ] Sync statistics (items synced, last sync time, etc.)

### Stage Plots
- [ ] Add stage plot functionality for each gig type
  - Visual diagram showing equipment placement
  - Drag-and-drop interface for positioning items
  - Save as part of gig type template
  - Display in gig instance view

### Set Lists
- [ ] Add set list management for each gig
  - List of songs/tracks to perform
  - Order/sequence management
  - Duration per song (optional)
  - Notes per song (key, tempo, etc.)
  - Link to specific gig instance (not gig type)

### Print Functionality
- [ ] Print load-out checklist (leaving for gig)
- [ ] Print load-in checklist (leaving from gig)
- [ ] Print stage plot
- [ ] Print set list
- [ ] Print-friendly CSS styles
- [ ] Option to print all documents for a gig at once

## Implementation Notes

### Stage Plot Considerations
- Could use HTML5 Canvas or SVG for visual representation
- Store as coordinates in database
- Mobile-friendly touch interface for editing
- Export as image for sharing

### Set List Considerations
- Simple text list initially
- Could add timing/duration tracking
- Reorder functionality (drag-and-drop)
- Mark songs as completed during performance
- Copy set list from previous gig

### Print Considerations
- Use CSS `@media print` for print-specific styling
- Hide navigation and non-essential UI
- Page breaks between sections
- QR code for digital version link?
- Header with gig name, date, venue

### Communication Features
- [ ] Text/SMS messaging to all band crew
  - Broadcast messages to entire crew
  - Group messaging interface
  - Integration with SMS service (Twilio, etc.)
  - Quick templates for common messages

- [ ] Send arrival and soundcheck times
  - Set arrival time for gig
  - Set soundcheck time for gig
  - Notify crew/band members
  - Calendar integration
  - Reminder notifications

### Equipment Ownership/Responsibility
- [ ] Track who brings which equipment
  - Add "Brought By" field to equipment items in gig type
  - Options: Roadie, Guitarist, Drummer, Bassist, etc.
  - Filter checklists by person
  - Individual responsibility assignments
  - Band member-specific checklists

### Band/Organization Management
- [ ] Band selector on initial launch/login
  - Select which band/organization you're working with
  - Multiple bands per user (roadie works with multiple bands)
  - Switch between bands in app
  - Band name, logo, basic info

- [ ] Band members
  - List of members in each band
  - Roles: Roadie, Guitarist, Drummer, Bassist, Vocalist, Tech, etc.
  - Contact info (phone, email)
  - Assign equipment ownership to members
  - Member-specific checklists

- [ ] Band-scoped data (not user-scoped)
  - Equipment catalog belongs to the band
  - Gig types belong to the band
  - Gigs belong to the band
  - Multiple band members can access same band's data
  - Permissions: Admin, Member, View-Only

- [ ] Band invitations
  - Invite other users to join band
  - Accept/decline invitations
  - Share band data across users
  - Remove members from band

### Multi-Band Gigs (Festival/Multi-Act Shows)
- [ ] Track band order for shows with multiple acts
  - List of bands performing
  - Performance order/sequence
  - Set times for each band
  - Opening act, headliner designation
  - Changeover time between sets
  - Shared backline/equipment notes

### Lost/Missing Equipment Tracking
- [ ] Track lost or missing items that need replacement
  - Mark equipment as "Lost" with date/gig reference
  - Lost items list in Settings
  - Flag items that need to be reordered
  - Notes about where/when lost
  - Replacement status tracking
  - Remove from active checklists when marked lost

### Enhanced Checklist States
- [ ] Expand checklist item states beyond simple checked/unchecked
  - **Leaving for Gig states:**
    - ☐ Not Loaded (default)
    - ✓ Loaded
    - ⊘ Don't Need (decided not to bring)
  - **Leaving from Gig states:**
    - ☐ Not Loaded
    - ✓ Loaded (got it back)
    - ⊘ Don't Need (wasn't brought)
    - ⚠ Lost/Missing (can't find it)
  - Visual indicators for each state
  - Filter views by state
  - Statistics: X loaded, Y not needed, Z missing

## Implementation Notes (cont.)

### Communication Considerations
- Requires backend service for SMS (Twilio API)
- Store phone numbers for crew members
- Message history/log
- Opt-in/opt-out management
- Cost considerations for SMS

### Equipment Ownership Considerations
- Add "owner" or "broughtBy" field to gig type equipment
- Create crew/band member list
- Generate per-person checklists
- "My Items" view for band members
- Accountability tracking

### Band Management Considerations
- Add `bandId` field to all documents (equipment, gig_types, gigs)
- User can belong to multiple bands
- Band selector on app launch: "Which band are you working with today?"
- Switching bands filters all data to that band's context
- Database structure:
  ```javascript
  {
    _id: 'band_1234567890',
    type: 'band',
    name: 'The Blue Notes',
    logo: 'base64_or_url',
    members: [
      {userId: 'npub1...', role: 'Roadie', name: 'John'},
      {userId: 'npub2...', role: 'Guitarist', name: 'Jane'}
    ],
    createdAt: '...'
  }

  {
    _id: 'equipment_1234567890',
    type: 'equipment',
    bandId: 'band_1234567890', // Band owner
    ownedBy: 'npub1...', // Optional: which band member owns it
    name: 'Shure SM58',
    ...
  }
  ```
- Permissions model: Admin (manage band), Member (full access), View-Only
- Invitation flow: Admin generates invite link/code, new user accepts

### Multi-Band Gig Considerations (Festival Shows)
- Add bands list to gig instance
- Performance order with drag-and-drop reordering
- Set start/end times per band
- Show duration calculations
- Notes about shared equipment/backline
- Useful for festivals or multi-act shows

### Lost Equipment Considerations
- Add "status" field to equipment: active, lost, replaced
- Link to gig where item was lost
- Reorder/replacement workflow
- Archive lost items vs. delete
- Impact on future gig checklists
- Insurance/value tracking

### Enhanced Checklist States Considerations
- Change from boolean `checked` to string/enum `state`
- States: 'not_loaded', 'loaded', 'dont_need', 'lost'
- Migration strategy for existing gigs
- UI: Radio buttons, multi-select, or action menu
- Color coding for visual distinction
- Summary statistics at top of checklist
- "Don't Need" items hidden by default but expandable
- Mark as lost → trigger "add to lost items" flow

## Related PRD Updates Needed
- Update PRD.md with these new features
- Add to "Future Enhancements" section
- Consider MVP vs. v2.0 features
- Communication features require backend (breaks "no backend" constraint)
