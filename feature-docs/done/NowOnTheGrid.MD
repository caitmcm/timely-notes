# Now on the grid

## Goal

**Mark the present moment on the schedule: highlight the current period, and draw a line at the
current minute.**

Two connected corrections to the day view. Both are about the same thing: the app should show
_now_ without being asked, and should look alive while it sits open.

1. **The current period is highlighted.** `PeriodRow` has set `aria-current="time"` since
   `ScrollingSchedule.MD`, and `App.css` has never had a rule for it — so the current period is
   marked for a screen reader and looks like every other row. Its only cue on screen is the default
   selection, which starts there; select another row and every trace of where _now_ is goes. The two states are independent and each must be
   recognisable at once, including on the same row.
2. **A red line across the current day at the exact minute**, ticking as the minute changes. The
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
  _now_ on their own there. The tint rule is scoped with `:not(.period-row--selected)`: declaration
  order cannot do it, because `.period-row[aria-current='time']` outranks `.period-row--selected`.
- **Neither cue is colour alone.** The line and its dot are shapes, and the current time is a weight
  change as well as a colour. This is the rule `layout.spec.ts` already enforces for selection, and
  it gets the same test.
- **No new navigation.** There is no `Go to now` button: the calendar's `Today` and `Note now`
  already return to the current period, and a third control is clutter. The notice's `Go to today`
  is untouched.
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
- **No scroll-to-now, and no auto-scroll on the tick.** The line moves; the scroll position does
  not. Scrolling is reading (`LiveClock.MD`), and a container that jumps under the reader once a
  minute would be worse than the problem this fixes.

## Architecture

Frontend only, `timely-notes-ui`. One new pure function, one new presentational element, and CSS.

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
- **`src/App.css`** — a `--now` colour token (a real red, not `--danger`: an error and the present
  moment are different meanings that happen to share a hue) and a `--now-tint`; the
  `.period-row[aria-current='time']` rules; `.now-line` absolutely positioned at
  `top: calc(var(--now-fraction) * 100%)`, with `.day-section__periods` made the positioning
  context. The line sits above the rows and below the sticky day heading, which holds `z-index: 1`.
- **`e2e/fixtures/ScheduleView.ts`** — `DayScope` gains `currentRow` (the row marked
  `aria-current="time"`) and `nowLine`.

## Checklist

### 1. The day fraction and the current day (`src/domain/periods.ts`)

- [x] Test first in `src/domain/periods.test.ts`: `dayFractionOf` is `0` at local midnight, `0.5` at
      12:00, and just under `1` at 23:59.
- [x] It counts minutes, not periods: 20:20 and 20:40 give different fractions, and neither depends
      on a `spanHours` argument — it takes none.
- [x] It reads local clock fields — a test that passes east and west of Greenwich, as `days.ts`'s
      conversions have.
- [x] `dayFractionOf`.
- [x] Test first: `isCurrentDay` is true for `dayKeyOf(now)` and false for its neighbours.
- [x] `isCurrentDay`, and `isCurrentPeriod` refactored onto it — its existing tests stay green
      unchanged.

### 2. The line (`src/components/NowLine.tsx`, `DaySection`)

- [x] Test first in `src/components/NowLine.test.tsx`: it renders the fraction it is given as the
      `--now-fraction` custom property, and is `aria-hidden` with no accessible role or name.
- [x] `NowLine`.
- [x] Test first in `src/components/DaySection.test.tsx`: the current day renders one line, at the
      fraction `dayFractionOf(now)` gives for the injected clock.
- [x] A day that is not the current day renders none — assert on both neighbours.
- [x] Re-rendering with a `now` one minute later moves the line: the fraction increases, and the
      row marked `aria-current="time"` is unchanged within the same period.
- [x] The line's position does not depend on the Schedule: the same `now` gives the same fraction at
      `s1`, `s3` and `s6`.
- [x] `DaySection` renders it.
- [x] Test in `src/App.test.tsx`: exactly one line exists across the three rendered days, and none
      at all once the calendar has pinned the view to a day away from today.
- [x] Test in `src/App.test.tsx`, `App — live clock`: crossing midnight moves the line to the newly
      current day and leaves none on the day that has just ended.

### 3. The current period highlight (`src/App.css`)

Selecting another row already leaves `aria-current="time"` on the current period — `App.test.tsx`,
_moves selection and the Note button when another row is clicked_. The styling is asserted by E2E.

- [x] The `[aria-current='time']` rules: red gutter time, semibold, and the faint tint scoped to
      `:not(.period-row--selected)`, so a selected current row keeps the selection background.
- [x] `--now` and `--now-tint` tokens, defined for both schemes with `light-dark()`, as the existing
      tokens are.
- [x] `.now-line` and its dot, positioned from `--now-fraction`, under the sticky day heading.

### 4. E2E

Geometry and computed style only, per `LeanStubbedLane.MD`: which day holds the line, and that
selection leaves the marker alone, are the Vitest tests in §2 and §3.

- [x] `e2e/fixtures/ScheduleView.ts`: add `DayScope.currentRow` and `DayScope.nowLine`. _(Setup
      step, no test of its own.)_
- [x] `layout.spec.ts`: the line sits inside the box of the current row, at every Schedule — assert
      against the row's bounding box, not a literal offset.
- [x] `layout.spec.ts`: fast-forwarding the clock half an hour moves the line down, and by roughly
      the fraction of the day column that half an hour is.
- [x] `layout.spec.ts`: the current period is highlighted by more than colour, and stays
      highlighted when another row is selected — the parallel of the existing selection spec.

### 5. Documentation

- [x] `CLAUDE.md` **Current state**: the current-period highlight, and the minute line.
- [x] `CLAUDE.md` **Navigation**: `NowLine` in the components row; `dayFractionOf` and
      `isCurrentDay` alongside the `domain/` entry if the row names members. _(It names modules, not
      members, so only `NowLine` was added.)_
- [x] `CLAUDE.md` **Invariants**: _the now line is placed as a fraction of the day column, never
      from measured layout, and ticks off `useNow` alone — no second clock and no second timer._

## Verify

From `timely-notes-ui/`:

- `npm test`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
- `npm run test:e2e:integrated` — untouched by this feature and still passing.

Manually, with `run-dev.ps1`:

- The current period's row is highlighted: red, semibold start time and a faint red tint.
- The red line sits across today at the right height for the wall clock, and only on today.
- Wait for the minute to change: it moves, with nothing else on the page moving.
- Switch to `1h` and `6h`: it stays at the same height on the day.
- Select a row three hours earlier: the line and the current row's red time both stay put.

## Deferred

- **A second-by-second line.** `useNow` stays a minute clock.
- **Scrolling the line into view**, on load or on the tick.
- **A time label on the line** (`20:20` in the gutter beside the dot). The row's start time is
  already there and a second number in the same column is a crowding question, not a missing one.
- **The neighbouring days' lines** — yesterday and tomorrow have no _now_ to mark.
- **Renaming `dayKeyOf`/`ordinalOf` or otherwise touching the clock-to-calendar path.** This feature
  adds a reader of `now`; it moves nothing.

## Implementation notes

- **`NowLine` is an `<li>`, not a `<div>`.** It renders inside the `<ul>` of rows, where a `<div>`
  is invalid HTML. `aria-hidden` keeps it out of the listbox's accessibility tree, so the rows are
  still the only options. It comes after the rows so `.period-row:first-child` still applies.
- **No `z-index` on the line.** It is positioned and the rows are not, so it paints above them.
  The sticky heading's `z-index: 1` keeps the heading on top without any other rule.
- **Red time on a selected current row.** `.period-row[aria-current='time'] .period-row__time`
  outranks `.period-row--selected .period-row__time`, so the time stays red when the current row
  is selected. Selection keeps the background.
- **Blue, not red.** The spec's red read as an alarm, so after review `--now` is blue (`#2563eb` /
  `#6ea8fe`) with a matching tint. Blue is still a different hue from the selection's amber, so
  the two stay apart. Where this document says "red" for the now channel, it now means `--now`.
- **The line has `pointer-events: none`**, so a click on it still selects the row underneath.
- **The §2 App tests passed on first run.** `DaySection` already drew the line by then, so these
  tests guard the wiring through `App` and did not fail first.
- **The `integrated` lane failed locally on Postgres.** The checked-in `appsettings.Development.json`
  sets `Database:Provider` to `Postgres`, which has no seed, so `backend.spec.ts`'s three
  seeded-note tests found no notes. This was already broken before this feature. Fixed in
  `playwright.config.ts`: the API web server now sets `Database__Provider=Memory` and
  `reuseExistingServer: false`, because a reused API would run on whatever store it was started with.
- **Verified:** `npm test` 460 passed; `lint` clean; `build` clean; `test:e2e` 20 passed (15 → 20);
  `test:e2e:integrated` 5 passed. Light and dark were checked in screenshots: the
  selected current row, another row selected, and the line with its dot. The manual
  `run-dev.ps1` pass was done by the user, and passed.
