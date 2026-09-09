# Now on the grid

## Goal

**Make the present moment visible on the schedule, and keep it visible.**

Three connected corrections to the day view. All of them are about the same thing: the app should
show _now_ without being asked, and should look alive while it sits open.

1. **The current period is always distinguished.** `PeriodRow` has set `aria-current="time"` since
   `ScrollingSchedule.MD`, and `App.css` has never had a rule for it — so the current period is
   marked for a screen reader and invisible to everyone else. Selecting another row to write in
   currently loses all trace of where _now_ is. The two states are independent and must both be
   legible at once, including on the same row.
2. **`Go to today` becomes `Go to now`.** The button already returns the _selection_ to the current
   period as well as the view to the current day — un-pinning is a return to the clock, not to a
   date. The old name describes half of what it does, and reads oddly at 20:20 on the day you are
   already looking at.
3. **A red line across the current day at the exact minute**, ticking as the minute changes. The
   period grid is a coarse instrument — an `s6` row is six hours wide — and the line is what says
   _here, precisely_. It is also the app's pulse: something moves, so the view is evidently live
   rather than a page rendered once and left.

Together these are the answer to a schedule view that, once you pin a row, gives no sign that time
is passing at all.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

- **Selection and _now_ are separate visual channels, and never compete.** Selection keeps what it
  has — the thick accent left bar and the tint. _Now_ is a red channel: the line, a dot at its start
  in the gutter, and the current row's gutter time in the same red and semibold. A selected current
  row shows both, with no cascade fight to arbitrate, because they touch different properties.
- **The current row also takes a faint red tint — but only while it is not selected.** The selection
  tint wins the background when the two coincide; the line, the dot and the coloured time carry
  _now_ on their own there. This is one declared cascade rule, written in that order in the file.
- **Neither cue is colour alone.** The line and its dot are shapes, and the current time is a weight
  change as well as a colour. This is the rule `layout.spec.ts` already enforces for selection, and
  it gets the same test.
- **The line is positioned as a fraction of the day column, not from measured layout.** The periods
  list is a fixed `--day-height` and its rows share it equally, so the minute maps to a percentage:
  `dayFractionOf(now)`. It needs no `getBoundingClientRect`, works identically at `s1`, `s3` and
  `s6`, needs no recalculation on resize — and, being a number rather than a pixel, it is assertable
  in jsdom, so the placement is a unit test and not only an E2E one.
- **It renders on the current day only.** One of the three rendered days is today, or none is; the
  neighbours get no line, and a day reached from the calendar gets none. `DaySection` already knows
  this through `isCurrentPeriod`; it gains the day-level form of the same question.
- **It is decorative to assistive technology.** `aria-hidden`, no role, no label. `aria-current="time"`
  on the row is the semantic statement, and it is already there — a second, finer announcement of
  the same fact would be noise, and would fire every minute.
- **It ticks off `useNow` and nothing else.** `now` already reaches `DaySection`, and already
  changes once a minute. There is no new timer, no `requestAnimationFrame`, and no second clock
  read — that invariant stands. The line is rendered straight from `now`, never memoised on it.
- **Per-minute, not per-second.** `useNow` is a minute clock and stays one. A sweeping second hand
  would mean a new timer, a re-render every second, and a battery cost, to move the line by a
  fifty-fourth of a row.
- **`Go to now` is a rename, not a behaviour change.** `goToToday` keeps its body — `setPinned(null)`
  — and every existing assertion about what it does holds. Only the label, the handler's name and
  the test handles change. The rollover notice keeps its wording: _It is now 25/08/2026_ names the
  day, which is what the notice is for.
- **The `done/` specifications are not edited.** `CalendarNavigation.MD` and `LiveClock.MD` describe
  a button called `Go to today`; they are the record of what was built then, and stay as written.
  `CLAUDE.md` is the file that describes the app as it now stands, so that is what gets updated.
- **No scroll-to-now, and no auto-scroll on the tick.** The line moves; the scroll position does
  not. Scrolling is reading (`LiveClock.MD`), and a container that jumps under the reader once a
  minute would be worse than the problem this fixes. `Go to now` is how you get back deliberately.

## Architecture

Frontend only, `timely-notes-ui`. One new pure function, one new presentational element, a rename,
and CSS.

- **`src/domain/periods.ts`** — `dayFractionOf(at: Date): number`, beside `ordinalOf`: how far
  through its own day the instant is, `0` at `00:00` and just under `1` at `23:59`. Local clock
  fields only, like `ordinalOf` — no UTC, no `Date` arithmetic.
- **`src/domain/periods.ts`** — `isCurrentDay(day: DayKey, now: Date): boolean`, the day-level
  sibling of `isCurrentPeriod`, which is rewritten to use it rather than repeat `dayKeyOf(now)`.
- **`src/components/NowLine.tsx`** (new) — a presentational `<div className="now-line"
aria-hidden="true" style={{ '--now-fraction': fraction }} />` with a dot child. Props: `fraction`.
  It reads no clock and knows no day.
- **`src/components/DaySection.tsx`** — renders `NowLine` inside `.day-section__periods` when
  `isCurrentDay(day, now)`, passing `dayFractionOf(now)`.
- **`src/components/ScheduleView.tsx`** — the toolbar button's label becomes `Go to now`; the prop
  `onGoToToday` becomes `onGoToNow`.
- **`src/App.tsx`** — `goToToday` becomes `goToNow`. `handlePickDay`'s "picking the current day is
  _Go to now_" branch calls it under the new name; nothing else changes.
- **`src/App.css`** — a `--now` colour token (a real red, not `--danger`: an error and the present
  moment are different meanings that happen to share a hue) and a `--now-tint`; the
  `.period-row[aria-current='time']` rules; `.now-line` absolutely positioned at
  `top: calc(var(--now-fraction) * 100%)`, with `.day-section__periods` made the positioning
  context. The line sits above the rows and below the sticky day heading, which holds `z-index: 1`.
- **`e2e/fixtures/ScheduleView.ts`** — `goToTodayButton` becomes `goToNowButton`; `DayScope` gains
  `nowLine`. `DayScope.currentRow` already exists and is unchanged.

## Checklist

### 1. The day fraction and the current day (`src/domain/periods.ts`)

- [ ] Test first in `src/domain/periods.test.ts`: `dayFractionOf` is `0` at local midnight, `0.5` at
      12:00, and just under `1` at 23:59.
- [ ] It counts minutes, not periods: 20:20 and 20:40 give different fractions, and neither depends
      on a `spanHours` argument — it takes none.
- [ ] It reads local clock fields — a test that passes east and west of Greenwich, as `days.ts`'s
      conversions have.
- [ ] `dayFractionOf`.
- [ ] Test first: `isCurrentDay` is true for `dayKeyOf(now)` and false for its neighbours.
- [ ] `isCurrentDay`, and `isCurrentPeriod` refactored onto it — its existing tests stay green
      unchanged.

### 2. The line (`src/components/NowLine.tsx`, `DaySection`)

- [ ] Test first in `src/components/NowLine.test.tsx`: it renders the fraction it is given as the
      `--now-fraction` custom property, and is `aria-hidden` with no accessible role or name.
- [ ] `NowLine`.
- [ ] Test first in `src/components/DaySection.test.tsx`: the current day renders one line, at the
      fraction `dayFractionOf(now)` gives for the injected clock.
- [ ] A day that is not the current day renders none — assert on both neighbours.
- [ ] Re-rendering with a `now` one minute later moves the line: the fraction increases, and the
      row marked `aria-current="time"` is unchanged within the same period.
- [ ] The line's position does not depend on the Schedule: the same `now` gives the same fraction at
      `s1`, `s3` and `s6`.
- [ ] `DaySection` renders it.
- [ ] Test in `src/App.test.tsx`: exactly one line exists across the three rendered days, and none
      at all once the calendar has pinned the view to a day away from today.

### 3. The current period, always visible (`src/App.css`)

- [ ] Test first in `src/App.test.tsx`: selecting a different row leaves `aria-current="time"` on
      the current period — the marked row and the selected row are different elements, and both are
      present. _(Guards the regression the CSS is fixing; the styling itself is asserted by E2E.)_
- [ ] The `[aria-current='time']` rules: red gutter time, semibold, and the faint tint, with the
      selected rules declared after so a selected current row keeps the selection background.
- [ ] `--now` and `--now-tint` tokens, defined for both schemes with `light-dark()`, as the existing
      tokens are.
- [ ] `.now-line` and its dot, positioned from `--now-fraction`, under the sticky day heading.

### 4. `Go to now`

- [ ] Test first: rename the assertions in `src/App.test.tsx` and
      `src/components/ScheduleView.test.tsx` from `Go to today` to `Go to now` — they fail, then the
      rename makes them pass. Behaviour assertions are otherwise untouched.
- [ ] `ScheduleView`'s label and `onGoToNow` prop; `App`'s `goToNow`, including the calendar's
      pick-the-current-day branch.

### 5. E2E

- [ ] `e2e/fixtures/ScheduleView.ts`: `goToTodayButton` → `goToNowButton`; add `DayScope.nowLine`.
      Update every spec that presses it. _(Setup step, no test of its own.)_
- [ ] `day-view.spec.ts`: the line renders on the current day only — one on 25/08/2026, none on its
      neighbours.
- [ ] `day-view.spec.ts`: it sits inside the box of the row marked `aria-current="time"`, at every
      Schedule — assert against the row's bounding box, not a literal offset.
- [ ] `day-view.spec.ts`: fast-forwarding the clock half an hour moves the line down, and by
      roughly the fraction of the day column that half an hour is.
- [ ] `day-view.spec.ts`: crossing midnight moves the line to the newly current day and leaves none
      on the day that has just ended — the rollover journey, seen through the line.
- [ ] `layout.spec.ts`: the current period is distinguished by more than colour, and stays
      distinguished when another row is selected — the parallel of the existing selection spec.
- [ ] `selection.spec.ts`: selecting another row keeps the current row's marker and its line.

### 6. Documentation

- [ ] `CLAUDE.md` **Current state**: `Go to now`, the always-visible current period, and the minute
      line.
- [ ] `CLAUDE.md` **Navigation**: `NowLine` in the components row; `dayFractionOf` and
      `isCurrentDay` alongside the `domain/` entry if the row names members.
- [ ] `CLAUDE.md` **Invariants**: _the now line is placed as a fraction of the day column, never
      from measured layout, and ticks off `useNow` alone — no second clock and no second timer._

## Verify

From `timely-notes-ui/`:

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run test:e2e:integrated` — untouched by this feature and still passing.

Manually, with `run-dev.ps1`:

- The red line sits across today at the right height for the wall clock, and only on today.
- Wait for the minute to change: it moves, with nothing else on the page moving.
- Switch to `1h` and `6h`: it stays at the same height on the day.
- Select a row three hours earlier: the line and the current row's red time both stay put.
- `Go to now` from a calendar jump returns the view and the selection to the current period.

## Deferred

- **A second-by-second line.** `useNow` stays a mi
  nute clock.
- **Scrolling the line into view**, on load or on the tick.
- **A time label on the line** (`20:20` in the gutter beside the dot). The row's start time is
  already there and a second number in the same column is a crowding question, not a missing one.
- **The neighbouring days' lines** — yesterday and tomorrow have no _now_ to mark.
- **Any change to the rollover notice**, which still names the day.
- **Renaming `dayKeyOf`/`ordinalOf` or otherwise touching the clock-to-calendar path.** This feature
  adds a reader of `now`; it moves nothing.

## Implementation notes

_(Filled in by the implementing agent.)_
