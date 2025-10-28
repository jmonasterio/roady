# Missing Items Focus UI

## User Insight
> "I want to make clear the things I still need to find to load. Rather than the things I've already found. Because usually I am losing stuff or forgetting to bring stuff."

**Key Problem:** The current UI treats loaded and unloaded items equally. The focus should be on **items still missing** since that's what causes problems.

---

## Design Principle
**Visual Hierarchy:**
1. **MOST PROMINENT:** Items NOT yet loaded (need attention)
2. **DE-EMPHASIZED:** Items already loaded (done, move on)

---

## Option A: Separate Sections (Recommended)

```
┌─────────────────────────────────────────┐
│ Leaving for Gig                         │
│ Blue Note Jazz Club • Jan 15            │
├─────────────────────────────────────────┤
│                                         │
│ ⚠️ STILL NEED TO LOAD (2 items)         │
│    ══════════════════════════════       │
│                                         │
│  ⬜ XLR Cable (20ft)                    │
│     [ Mark as Loaded ]                  │
│     ─────────────────────              │
│                                         │
│  ⬜ Guitar Amp                          │
│     [ Mark as Loaded ]                  │
│     ─────────────────────              │
│                                         │
├─────────────────────────────────────────┤
│ ✓ LOADED (5 items)                      │
│    [Show ▼]                             │
│                                         │
│  ✓ Shure SM58 Mic                       │
│  ✓ Microphone Stand                     │
│  ✓ Power Strip                          │
│  ✓ Gaffer Tape                          │
│  ✓ Setlist Binder                       │
│                                         │
└─────────────────────────────────────────┘
```

**Features:**
- Missing items at the top (prominent)
- Loaded items collapsed by default (can expand to verify)
- Clear count of what's left to do
- Warning icon for missing section

---

## Option B: Visual Weight Inversion

```
┌─────────────────────────────────────────┐
│ Leaving for Gig                         │
├─────────────────────────────────────────┤
│                                         │
│ ⚠️ XLR Cable (20ft)                     │
│    NEED TO LOAD                         │
│    ━━━━━━━━━━━━━━━━                    │
│    ^large, bold, red/orange             │
│                                         │
│ ⚠️ Guitar Amp                           │
│    NEED TO LOAD                         │
│    ━━━━━━━━━━━━━━━━                    │
│                                         │
│ ✓ Shure SM58 Mic                        │
│   loaded                                │
│   ────────────────                      │
│   ^small, gray, subtle                  │
│                                         │
│ ✓ Microphone Stand                      │
│   loaded                                │
│   ────────────────                      │
│                                         │
└─────────────────────────────────────────┘
```

**Features:**
- Missing items: Large, bold, colored
- Loaded items: Small, gray, de-emphasized
- All items in one list
- Tap to toggle state

---

## Option C: Strikethrough Completed

```
┌─────────────────────────────────────────┐
│ Leaving for Gig                         │
├─────────────────────────────────────────┤
│                                         │
│ ⚠️ XLR Cable (20ft)                     │
│    TAP TO MARK LOADED                   │
│                                         │
│ ⚠️ Guitar Amp                           │
│    TAP TO MARK LOADED                   │
│                                         │
│ ✓ S̶h̶u̶r̶e̶ ̶S̶M̶5̶8̶ ̶M̶i̶c̶                       │
│   (strikethrough, faded)                │
│                                         │
│ ✓ M̶i̶c̶r̶o̶p̶h̶o̶n̶e̶ ̶S̶t̶a̶n̶d̶                     │
│   (strikethrough, faded)                │
│                                         │
└─────────────────────────────────────────┘
```

**Features:**
- Missing items: Normal display
- Loaded items: Struck through and faded
- Single list
- Visual completion indicator

---

## Option D: Counter Focus (Minimalist)

```
┌─────────────────────────────────────────┐
│ Leaving for Gig                         │
│ Blue Note Jazz Club                     │
├─────────────────────────────────────────┤
│                                         │
│        ⚠️ 2 ITEMS LEFT TO LOAD          │
│           ══════════════                │
│                                         │
│  XLR Cable (20ft)                       │
│  Guitar Amp                             │
│                                         │
│  ─────────────────────────────          │
│                                         │
│  5 items already loaded                 │
│  [Show details ▼]                       │
│                                         │
└─────────────────────────────────────────┘
```

**Features:**
- Big counter of what's left
- Only show missing items
- Loaded items completely hidden (expandable)
- Minimal distraction

---

## Recommended: Option A (Separate Sections)

**Why this works best:**

1. **Clear mental model** - Two distinct zones: "To Do" and "Done"
2. **Reduces cognitive load** - Only see what needs attention
3. **Progress feedback** - Count shows progress without clutter
4. **Verification available** - Can expand to double-check what's loaded
5. **Mobile-friendly** - Less scrolling through completed items

---

## Implementation Details

### States and Behavior

**When item NOT loaded:**
- Appears in "STILL NEED TO LOAD" section
- ⬜ icon + normal weight text
- Button: "Mark as Loaded" (green)
- Tap anywhere on row to load

**When item loaded:**
- Moves to "LOADED" section (collapsed by default)
- ✓ icon + gray text
- Tap to unload (move back to top)

### Visual Design

```css
/* Missing items - prominent */
.item-missing {
    background: #fef3c7; /* light yellow/amber */
    border-left: 4px solid #f59e0b; /* orange accent */
    padding: 1rem;
    margin-bottom: 0.5rem;
}

.item-missing-icon {
    color: #f59e0b; /* orange */
    font-size: 1.5rem;
}

/* Loaded items - de-emphasized */
.item-loaded {
    opacity: 0.6;
    padding: 0.5rem;
    font-size: 0.9rem;
}

.item-loaded-icon {
    color: #10b981; /* green */
}

/* Collapsible section */
.loaded-section.collapsed {
    max-height: 0;
    overflow: hidden;
}
```

---

## Progress Indicator

Show completion at the top:

```
┌─────────────────────────────────────────┐
│ 5 of 7 loaded                           │
│ ████████████░░░░░░  71%                 │
│                                         │
│ ⚠️ 2 ITEMS LEFT                         │
└─────────────────────────────────────────┘
```

---

## Quick Actions

Add quick mark-all buttons for efficiency:

```
┌─────────────────────────────────────────┐
│ ⚠️ STILL NEED TO LOAD (2)               │
│    [ Mark All Loaded ]                  │
├─────────────────────────────────────────┤
│  ⬜ XLR Cable                           │
│  ⬜ Guitar Amp                          │
└─────────────────────────────────────────┘
```

---

## "Leaving from Gig" Variation

Same principle applies - focus on what's MISSING:

```
┌─────────────────────────────────────────┐
│ Leaving from Gig                        │
│ Blue Note Jazz Club                     │
├─────────────────────────────────────────┤
│                                         │
│ ⚠️ STILL NEED TO PACK (3 items)         │
│    ══════════════════════════           │
│                                         │
│  ⬜ XLR Cable (20ft)                    │
│     WHERE IS IT?                        │
│     [ Mark as Loaded ]                  │
│     [ Mark as Lost ]                    │
│                                         │
│  ⬜ Guitar Amp                          │
│     WHERE IS IT?                        │
│                                         │
└─────────────────────────────────────────┘
```

**For load-in, add "Lost" option:**
- Prominent warning if items still missing
- Quick action to mark as lost/missing

---

## Smart Sorting

**"Still Need to Load" section sorted by:**
1. Items you frequently forget (learn over time)
2. Heavy/bulky items first
3. Alphabetical

**Future enhancement:**
Track which items user typically loads last, show those first in missing list.

---

## Color Psychology

- **Orange/Amber** (⚠️): Attention needed, action required
- **Green** (✓): Success, completed
- **Gray**: De-emphasized, done
- **Red** (missing at venue): Urgent problem

---

## Summary

**Key Changes from Current Design:**
1. ✅ Invert visual hierarchy - emphasize missing items
2. ✅ Separate sections - "To Do" vs "Done"
3. ✅ Collapse completed items - reduce clutter
4. ✅ Count missing items - clear progress indicator
5. ✅ Expand to verify - optional detailed view

**Result:**
User can **instantly see** what's still missing and focus their attention there, rather than scrolling through completed items.
