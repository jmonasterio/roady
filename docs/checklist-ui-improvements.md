# Checklist UI Improvements

## Problem Statement
Current checklist uses simple checkboxes/toggles which don't clearly communicate the state or action. Users need clearer visual feedback about:
- What "checked" means (Loaded? Ready? Packed?)
- Current state of each item
- What happens when they tap/click

## Current UI

```
Leaving for Gig:
☐ Shure SM58 Mic
☐ XLR Cable (20ft)
☐ Microphone Stand

Leaving from Gig:
☐ Shure SM58 Mic (was brought)
☐ XLR Cable (20ft) (was brought)
```

**Issues:**
- ☐/☑ doesn't clearly mean "loaded" or "packed"
- No indication of what state you're setting
- Generic toggle doesn't convey context

---

## Proposed Solutions

### Option 1: Labeled Toggle Switches

**Visual Design:**
```
Leaving for Gig:

┌────────────────────────────────┐
│ Shure SM58 Mic                 │
│ ┌─────────┬─────────┐          │
│ │ LOADED  │ Not Yet │ ←        │
│ └─────────┴─────────┘          │
└────────────────────────────────┘

┌────────────────────────────────┐
│ XLR Cable (20ft)               │
│ ┌─────────┬─────────┐          │
│ │ Not Yet │ LOADED  │   →      │
│ └─────────┴─────────┘          │
└────────────────────────────────┘
```

**Pros:**
- Clear state labels
- Common mobile UI pattern
- Matches iOS toggle style

**Cons:**
- Takes more horizontal space
- Two-word labels might be too long

**Implementation:**
- Use Pico CSS with custom toggle labels
- States: "Not Yet" | "LOADED"

---

### Option 2: Button Selection (Pill Buttons)

**Visual Design:**
```
Leaving for Gig:

┌────────────────────────────────────┐
│ Shure SM58 Mic                     │
│ [ Not Loaded ]  [✓ LOADED]         │
│                    ^active          │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ XLR Cable (20ft)                   │
│ [✓ Not Loaded]  [ LOADED ]         │
│     ^active                         │
└────────────────────────────────────┘
```

**Pros:**
- Very explicit state selection
- Can add 3rd option easily ("Don't Need")
- Clear active state

**Cons:**
- Takes more vertical space
- More taps to change state

**Implementation:**
- Radio button style with pill buttons
- Active state has checkmark + highlight

---

### Option 3: Status Badge with Tap to Toggle

**Visual Design:**
```
Leaving for Gig:

┌────────────────────────────────────┐
│ Shure SM58 Mic         [✓ LOADED]  │
│                         ^green      │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ XLR Cable (20ft)    [○ Not Loaded] │
│                        ^gray        │
└────────────────────────────────────┐

Tap badge to toggle state
```

**Pros:**
- Compact vertical space
- Color-coded for quick scanning
- Tap anywhere on row to toggle

**Cons:**
- Less obvious it's interactive
- Harder to add 3rd state

**Implementation:**
- Badge-style labels that flip on click
- Green for loaded, gray for not loaded

---

### Option 4: Icon + Text Toggle (Recommended)

**Visual Design:**
```
Leaving for Gig:

┌────────────────────────────────────┐
│ ✅ Shure SM58 Mic                  │
│    LOADED ✓                        │
│    ^green text                     │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ ⬜ XLR Cable (20ft)                │
│    Not Loaded                      │
│    ^gray text                      │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ ⊘ Mic Stand                        │
│   Don't Need                       │
│   ^dimmed                          │
└────────────────────────────────────┘

Tap anywhere on row to cycle states
```

**Pros:**
- Clear visual state with icon
- Text label reinforces meaning
- Easy to scan quickly
- Supports 3 states naturally
- Tap entire row = better mobile UX

**Cons:**
- Cycling through states requires multiple taps

**States:**
- ⬜ "Not Loaded" (gray)
- ✅ "LOADED" (green, bold)
- ⊘ "Don't Need" (gray, dimmed) - optional

**Implementation:**
- Large tappable area (entire row)
- Cycles: Not Loaded → Loaded → Don't Need → Not Loaded
- Visual feedback on tap

---

### Option 5: Swipe Actions (iOS Style)

**Visual Design:**
```
Leaving for Gig:

← Swipe left on item ←
┌────────────────────────────────────┐
│ Shure SM58 Mic          │ ✓ LOADED │
│                         └──────────┘
└────────────────────────────────────┘

Swipe right to "Don't Need" →
```

**Pros:**
- Modern mobile UX
- Quick action
- Doesn't take extra space

**Cons:**
- Not discoverable
- Requires tutorial
- Doesn't work well on desktop

---

## Enhanced States (Future)

Based on TODO.md, eventual states could include:

### Leaving for Gig (Load-out):
- ⬜ Not Loaded
- ✅ Loaded
- ⊘ Don't Need

### Leaving from Gig (Load-in):
- ⬜ Not Loaded
- ✅ Loaded (got it back)
- ⊘ Wasn't Brought
- ⚠️ Lost/Missing

---

## Recommendation

**Use Option 4: Icon + Text Toggle**

**Rationale:**
1. **Clear visual feedback** - Icon + text is unambiguous
2. **Mobile-optimized** - Large tap target (entire row)
3. **Scalable** - Easy to add 3rd/4th state
4. **Quick scanning** - Color + icon makes status obvious
5. **Familiar pattern** - Similar to task lists, todo apps

**Implementation Priority:**
1. **Phase 1:** Two states (Not Loaded / Loaded)
2. **Phase 2:** Add "Don't Need" state
3. **Phase 3:** Add "Lost/Missing" for load-in

---

## Alternative Hybrid Approach

Combine Option 4 (Icon + Text) with Option 2 (Buttons) for clarity:

```
Leaving for Gig:

┌────────────────────────────────────────┐
│ Shure SM58 Mic                         │
│ ┌──────────────┐  ┌──────────────┐    │
│ │              │  │ ✅ LOADED    │    │
│ │  Not Loaded  │  │              │    │
│ └──────────────┘  └──────────────┘    │
│                        ^selected       │
└────────────────────────────────────────┘
```

**Best of both worlds:**
- Explicit selection (buttons)
- Clear labels (text)
- Visual state (icon + color)

---

## Visual Design Mockup

### For "Leaving for Gig" Screen

```
┌─────────────────────────────────────────┐
│ ← Back    Leaving for Gig               │
├─────────────────────────────────────────┤
│ Blue Note Jazz Club                     │
│ Fri, Jan 15, 2025 • Small Club          │
├─────────────────────────────────────────┤
│ Check off items as you load them        │
│ into vehicle                            │
├─────────────────────────────────────────┤
│                                         │
│ ✅ Shure SM58 Mic                       │
│    LOADED ✓                             │
│    ────────────────────────────         │
│                                         │
│ ⬜ XLR Cable (20ft)                     │
│    Not Loaded                           │
│    ────────────────────────────         │
│                                         │
│ ✅ Microphone Stand                     │
│    LOADED ✓                             │
│    ────────────────────────────         │
│                                         │
│ ⊘ Guitar Amp                            │
│   Don't Need (dimmed)                   │
│    ────────────────────────────         │
│                                         │
│ [ + Add Item to This Gig ]              │
│                                         │
├─────────────────────────────────────────┤
│ Progress: 2 of 3 loaded                 │
│ ████████░░  67%                         │
└─────────────────────────────────────────┘
```

---

## Color Scheme

- **Loaded:** Green (#10b981) with ✅ icon
- **Not Loaded:** Gray (#6b7280) with ⬜ icon
- **Don't Need:** Light gray (#d1d5db) with ⊘ icon, dimmed opacity
- **Lost/Missing:** Red/Orange (#ef4444) with ⚠️ icon

---

## Accessibility

1. **Labels:** Use `aria-label` with full state text
2. **Roles:** `role="checkbox"` or `role="switch"`
3. **States:** `aria-checked="true/false"`
4. **Focus:** Clear focus indicators for keyboard navigation
5. **Screen readers:** Announce state changes

---

## Mobile Gestures (Optional Enhancement)

- **Tap:** Toggle state (Not Loaded ↔ Loaded)
- **Long press:** Open state menu (3+ options)
- **Swipe right:** Mark as "Loaded"
- **Swipe left:** Mark as "Don't Need"

---

## What's your preference?

Please review and let me know which option resonates most with your use case, or if you'd like to combine elements from multiple options!
