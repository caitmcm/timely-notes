# Day window navigation

## Goal

**Separate the window from the selection, and give the window its own controls.**

Today a single piece of state, `pinned`, means two things at once: which row is chosen, and which
three days are drawn. Pressing a row on tomorrow therefore re-centres the view on tomorrow — the
column is rebuilt, the day the user was reading scrolls away under them, and a fetch fires for a
range they never asked for. That is a bug. Choosing a row is a statement about *this row*; it says
nothing about which days should be on screen.

After this feature:

- **Selecting a period never redraws the schedule.** The three days on screen stay exactly as they
  were, in the same scroll position. Only the highlight moves.
- **The window moves only when the user asks it to** — the calendar, `Note now`, `Go to today`, the
  clock rolling over while the view is following it, and two new arrows.
- **An arrow at the top and an arrow at the bottom of the scroller step the window by three days**,
  the width of the window itself, so the days run on without repeating or skipping. From today,
  scrolling to the end of tomorrow and pressing the down arrow gives the day after tomorrow at the
  top and two further days below it.
- **The notice beside `Go to today` says what is being viewed**, not what day it is:
  `Viewing 23/09/2026 – 25/09/2026.` It appears only while the current day is off-screen.

No backend work. This is a frontend feature end to end, and it is mostly a state split: the window
and the selection become two pieces of state that move for different reasons.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

### The two pieces of state

- **`anchorDay: DayKey | null` is the window.** `null` means the window follows the clock, exactly
  as `pinned === null` does now, and a rollover moves it with no effect to fire. Non-null, the
  window is frozen at `[anchor - 1, anchor + 1]` until something moves it again. The invariant that
  replaces the old one: **the selection never writes `anchorDay`.**
- **`selected: { day, ordinal } | null` is the selection.** `null` means the selection follows the
  clock — the current period of the current day, derived, as it is today. Once the user presses a
  row it holds that address and stops following the clock. This half is unchanged in substance; only
  its scope shrinks, because it no longer drags the window behind it.
- **The selection may address a day outside the window.** Nothing forces them into step, and nothing
  needs to: `ScheduleView` already draws the highlight only on the day that matches, so a selection
  on a day that has scrolled out of the window simply is not drawn. It is not cleared — stepping the
  window back brings the highlight back with it, which is what a user who steps away and returns
  expects.
- **`focusDay` is retired as a concept.** What is left is `anchorDay ?? currentDay` for the window's
  centre and `selected?.day ?? currentDay` for the highlight's day. Two names, because they are two
  things; `ScheduleView` takes the second as `selectedDay` and no longer takes `focusDay`.

### What moves the window, and what does not

| Action | Window | Selection |
| --- | --- | --- |
| Press a period row | unchanged | that row |
| Open a note from a row | unchanged | that row |
| Pick a day in the calendar | centres on that day | that day, period 1 |
| `Today` in the calendar / `Go to today` | back to following the clock | back to following the clock |
| `Note now` | back to following the clock | back to following the clock |
| Up / down arrow | steps three days | unchanged |
| Change the Schedule | unchanged | same day, the ordinal `now` falls in |
| Clock rollover | moves only while `anchorDay` is `null` | moves only while `selected` is `null` |

- **The arrows do not touch the selection.** They are a way to read other days, not to choose one. A
  user who steps forward and then presses a row gets a selection on that day and a window that still
  sits where they put it.
- **Changing the Schedule keeps the window.** Re-chunking the day invalidates a stored ordinal, not
  a stored day, so the existing reset of the ordinal from `now` stays and the window is left alone.

### The arrows

- **Two buttons inside `.schedule-view`**, the first and last children of the scroll container, above
  the first `DaySection` and below the last. They scroll with the content: the bottom arrow is
  reached by scrolling to the end of the last day, which is the gesture the feature is for. They are
  not fixed chrome, and they are not in the header.
- **Each step is three days — `WINDOW_DAYS`, the width of the window.** Down sets
  `anchor = anchor + 3`, up `anchor - 3`. Consecutive windows abut: `[d-1, d, d+1]` then
  `[d+2, d+3, d+4]`. No overlap, no gap.
- **The first press from a clock-following window pins it.** `anchorDay` is `null` until then, so
  the step is taken from `currentDay` and the result is a frozen window, like any other jump.
- **Names: `Earlier days` and `Later days`**, each an icon button carrying both an `aria-label` and
  a `title`, as the header's three do. Chevron glyphs in `icons.tsx` beside the others. They are
  named for direction in time, not for the gesture — `Up`/`Down` would be about the scrollbar.
- **After a step, the view lands at the near edge of the new window.** Down: the first of the three
  new days scrolled to the top, so reading continues downwards. Up: the *last* of the three scrolled
  into view at the bottom, so reading continues upwards into the day just before the one left. The
  asymmetry is the point — in both directions the next thing read is the day adjacent to the one
  just left.

### The notice

- **It appears only while the current day is not one of the three on screen.** Previously it was
  raised by `focusDay !== currentDay`, which a row press could trigger; now the window is the only
  thing that can hide today, so the window is what the condition asks about.
- **Its text is the range: `Viewing 23/09/2026 – 25/09/2026.`** followed by the existing
  `Go to today` button. The `role="status"` region and the separate button are unchanged — a button
  alone is never announced, which is why the two jobs stayed separate in the first place.
- **The clock is no longer mentioned.** A rollover that leaves today on screen needs no notice: the
  day is right there, and the current-period marker has moved to it. A rollover that carries today
  out of a frozen window raises the notice by the same rule as any other jump, and the range shown
  is the answer to the question the user actually has — *where am I?*
- **En dash, spaced**, to match `formatPeriodLabel`'s `18:00 – 21:00`.

### Deliberately unchanged

- `useScheduleNotes` and its `AbortController`, which is tied to the Schedule and not the range
  (`NoteAutosave.MD`) — a three-day step is a range change like any other, and the hook's existing
  run-and-chunk logic already covers a window with no overlap with the last one.
- `DaySection`'s mount scroll to the selected row, `NoteDialog`, autosave, and every backend route.
- The window's width. It is three days before this feature and three after; only its position is
  newly controllable.

## Architecture

**New — `timely-notes-ui/src/domain/window.ts`**, pure, no React:

| Export | |
| --- | --- |
| `WINDOW_DAYS = 3` | The width, and therefore the step. |
| `windowOf(anchor)` | `{ first, last }` = `[anchor - 1, anchor + 1]`, via `addDays`. |
| `shiftAnchor(anchor, direction)` | `addDays(anchor, direction * WINDOW_DAYS)`, `direction` being `-1` or `1`. |
| `windowContains(anchor, day)` | Lexicographic, `first <= day <= last`. |
| `formatDayRange(first, last)` | `23/09/2026 – 25/09/2026`, built from `formatDayHeading`. |

`formatDayRange` lives here rather than in `periods.ts` because it is about the window; it reuses
`formatDayHeading` so a single day's spelling keeps one definition.

**Changed — `App.tsx`**: `pinned` splits into `anchorDay` and `selected`. `first`/`last` come from
`windowOf(anchorDay ?? currentDay)`. `handleSelect` and `handleOpenNote` write `selected` only.
`handlePickDay` writes both. `goToToday` and `handleNoteNow` clear both. Two new handlers,
`showEarlier` and `showLater`, write `anchorDay` alone. The notice renders when
`!windowContains(anchorDay ?? currentDay, currentDay)`.

**Changed — `ScheduleView.tsx`**: takes `selectedDay` in place of `focusDay`, plus `onShowEarlier`
and `onShowLater`, and renders the two arrow buttons around the day sections. Its scroll effect keys
off the *window*, not the selection: when the first day changes it scrolls the new first day to the
top if the window moved forwards, or the new last day into view at the end if it moved backwards. It
keeps the "on a change only, never on mount" rule it has now.

**Changed — `icons.tsx`**: `ChevronUpIcon`, `ChevronDownIcon`, built from the same `glyph` spread.

Data flow is otherwise untouched: `App` still owns every domain call and nothing below it fetches.

## Checklist

### 1. The window domain

- [x] `domain/window.test.ts` covers `windowOf` centring on the anchor, including across a month end
      and a DST day (via `addDays`), and `window.ts` provides it.
- [x] `shiftAnchor` steps exactly `WINDOW_DAYS` in each direction, and successive windows abut —
      asserted as `windowOf(shiftAnchor(a, 1)).first === addDays(windowOf(a).last, 1)`.
- [x] `windowContains` is true at both ends of the window and false either side of it.
- [x] `formatDayRange` renders `23/09/2026 – 25/09/2026`, and a single-day range is not special-cased.

### 2. Selecting no longer moves the window

- [x] `App.test.tsx`: pressing a row on the last day of the window leaves all three day headings
      exactly as they were — the regression test for this bug.
- [x] Pressing a row on another day highlights that row, and no row on any other day is selected.
- [x] Pressing a row issues no new notes request (assert on the fetch stub's call count).
- [x] Opening a note from a row leaves the window unchanged, and the dialog opens on that row's
      address.
- [x] With the clock following, pressing a row stops the selection following it: a tick past the
      period boundary leaves the pressed row selected.

### 3. The arrows

- [x] `ScheduleView.test.tsx`: `Earlier days` and `Later days` render as the first and last children
      of the scroll container, named by `aria-label` and `title`, and call their handlers.
- [x] `App.test.tsx`: `Later days` from a clock-following window draws `currentDay + 2 … + 4`.
- [x] `Earlier days` from a clock-following window draws `currentDay - 4 … - 2`.
- [x] Stepping forward then back returns to the original three days.
- [x] Stepping does not change the selection: the selected address is unchanged afterwards, and
      stepping back to its day shows it highlighted again.
- [x] `ScheduleView.test.tsx`: a forward step scrolls the new first day to the top; a backward step
      scrolls the new last day into view at the end. Assert on the `scrollIntoView` spy's argument.
- [x] No scroll happens on mount.

### 4. The notice

- [x] `App.test.tsx`: no notice while the window contains the current day, including after a row
      press on a neighbouring day.
- [x] Stepping the window so the current day falls outside it renders `Viewing <first> – <last>.`
      with the `Go to today` button beside it, inside the `role="status"` region.
- [x] The range in the notice follows further steps.
- [x] `Go to today` restores the clock-following window *and* the clock-following selection.
- [x] A rollover that carries the current day out of a frozen window raises the notice; one that
      leaves it inside does not.

### 5. Calendar, `Note now` and the Schedule, re-checked against the split

- [x] Picking a day in the calendar centres the window on it and selects its first period.
- [x] `Today` in the calendar behaves exactly as `Go to today`.
- [x] `Note now` clears both pieces of state and opens the current period — the existing pending-open
      effect is unchanged, and its tests still pass against `selected`.
- [x] Changing the Schedule leaves the window where it is and re-derives the selected ordinal from
      `now`.

### 6. E2E

- [x] `e2e/selection.spec.ts`: selecting a period on a neighbouring day leaves the three day headings
      and the scroll position unchanged.
- [x] `e2e/day-view.spec.ts` (or a new `window.spec.ts` if it reads better): scroll to the end of the
      last day, press `Later days`, and the first heading is the old last day + 1 with two days below
      it; press `Earlier days` twice and the original three are back.
- [x] `e2e/calendar.spec.ts`: the rollover notice's text becomes the range; update the fixture's
      `rolloverNotice` locator from `/^It is now /` to `/^Viewing /`.

### 7. Documentation

- [x] `CLAUDE.md`: **Current state** describes the window and the selection as separate, and the two
      arrows. A new invariant is added — **selecting a period never moves the window** — pointing at
      this document.
- [x] Implementation notes written, boxes all ticked, document moved to `feature-docs/done/`.

## Verify

From `timely-notes-ui/`:

- `npm test` — all green, including the new `domain/window.test.ts`.
- `npm run lint`
- `npm run build`
- `npm run test:e2e` — the stubbed lane.

Manual, via `run-dev.ps1`:

1. Open on today. Scroll into tomorrow and press a row: the three headings and the scroll position
   do not move, the highlight does.
2. Scroll to the end of the last day, press `Later days`: the day after tomorrow is at the top and
   two days follow. The notice reads `Viewing …` with the correct range.
3. Press `Earlier days` twice: back to the original three, no notice, selection still where it was.
4. `Note now` from a stepped-away window: the window returns to today and the dialog opens on the
   current period.

## Deferred

- **Any window width but three.** A user-chosen span belongs with the other settings in the drawer,
  and nothing asks for it yet.
- **Keyboard shortcuts for the arrows** (`PageUp`/`PageDown`, `j`/`k`). The buttons are the feature;
  a key map is a separate decision about the whole app.
- **Swipe or wheel-driven paging.** The arrows are explicit by design; an infinite scroller is a
  different feature with a different fetch strategy.
- **Clearing a selection that has scrolled out of the window.** Stated above as deliberate.
- **Prefetching the neighbouring windows** so a step lands with its notes already in hand.
- **`EmptyNotePruning.MD`**, still not scheduled.

## Implementation notes

**The scroll effect distinguishes a step from a jump, which the Architecture section did not.**
Taken literally, "the new first day to the top if the window moved forwards, or the new last day
into view at the end if it moved backwards" also governs a calendar pick — and a pick of a day in
the past would then land the reader on the day *after* the one they chose, because `ScheduleView`'s
effect runs after `DaySection`'s mount scroll and overrides it. `landingFor` therefore asks whether
the new window *abuts* the one left: it does only for an arrow step, and only there is the near-edge
landing right. Any other move — a calendar pick, `Go to today`, `Note now`, a rollover — is a jump,
and lands on the anchor in the middle, which is what `focusDay` did before this feature.

**`ScheduleView` keys the effect off `days`, not off a day key.** `previousDays` is compared with
the incoming array, so the effect sees both ends of the window at once and can tell an abutting step
from a jump. The "on a change only, never on mount" rule is unchanged: the first render seeds the
ref and nothing scrolls.

**The calendar keeps its `focusDay` prop, now fed the selection.** `MonthGrid`'s `aria-pressed` cell
marks the day that is *chosen*, which is the selection, so `App` passes `selectedDay`. The month the
calendar opens on is the window's anchor: that is where the user is looking. The two coincide except
after an arrow step, where opening on the month you are reading is the useful behaviour.

**Three existing live-clock tests changed meaning rather than breaking.** "Stays put over midnight
once the user has selected a row" was asserting the bug this feature closes — a row press froze the
window — so it became "carries the window over midnight while the selected row stays behind", and a
new test covers a window frozen by the arrows holding still instead. The two rollover-notice tests
had to reach for a real window move: a rollover shifts today by one day, so a clock-following window
never loses it, and the notice now needs either an arrow step or a calendar pick one day off today.

**`e2e/window.spec.ts` is a new file rather than an addition to `day-view.spec.ts`.** The window and
its arrows are their own area, and `day-view.spec.ts` is about what one day renders.

**The E2E scroll-position assertion measures the app, not the browser.** Clicking a row focuses it,
and the browser scrolls a newly focused element into view on its own; the spec scrolls the target
row into view first so what is left to measure is the app moving the column.

**Verified.** 382 Vitest across 20 files (14 of them the new `domain/window.test.ts`), `npm run
lint` and `npm run build` clean, 89 Playwright in the stubbed lane. The manual run-through against
`run-dev.ps1` is the user's to make.
