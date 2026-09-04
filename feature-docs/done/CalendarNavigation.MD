# Calendar navigation

## Goal

**Bound the schedule to three days, and add a month calendar to move between them.**

`ScrollingSchedule.MD` gave the view an unbounded scroll that grows a day at a time. In use it is
clunky: the growth jitters, the container keeps getting taller, and every day the user passes stays
in the DOM and in the cache. The scroll was also carrying the whole navigation burden — getting to
last Tuesday means scrolling through everything in between.

This feature splits that into two layers:

1. **The Schedule view shows exactly three days** — the focus day and its two neighbours, i.e.
   *yesterday, today, tomorrow* while the view is following the clock. All three render on first
   paint and the view is scrolled to the focus day. It never grows: the scroll is a short,
   fixed-length column, so there is nothing to jitter and one request covers the lot.
2. **A `Calendar` button, in a fixed navigation toolbar above that scroll**, opens a **month view**
   — a Google-Calendar-style square grid of the month's days, with a marker on every day that
   already has notes in the current Schedule. Pressing a day closes the calendar and re-points the
   Schedule view at that day and its two neighbours.

The scroll is for reading around *now*; the calendar is for going anywhere else. `Go to today`
stays, and returns the view to the clock from wherever the calendar has sent it.

The month markers need a whole month of "does this day have notes" — six times the existing
endpoint's 7-day cap, and absurd to answer by shipping every note's markdown. This feature therefore
adds one backend slice: a **per-day note count** route.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

- **Three days, always: `focusDay ± 1`.** The rendered range stops being state and becomes a
  derivation of the focus day, so there is no range to grow, correct or reset. Unpinned, the focus
  day is the current day, so at midnight the window rolls from *yesterday, today, tomorrow* to the
  next one on its own — the derivation `LiveClock.MD` already established, one day wider.
- **All three days render at once.** The `IntersectionObserver`, both sentinels, the growth handlers
  (`onReachStart`/`onReachEnd`), the travel `direction`, the scroll-preservation layout effect and
  the `range` state are **deleted**, not disabled. They exist only to serve unbounded growth, and
  they are where the jitter comes from. The stub observer in `src/test/` goes with them.
- **`anchorDay` is deleted too, and the rollover notice keys off the focus day.** With three days in
  the container, "the day at the top of the viewport" is no longer a meaningful signal — scrolling
  inside the window is just reading. The notice now appears exactly when
  `focusDay !== currentDay`: a calendar jump, or a rollover under a pinned view. *(Amended during
  the UI pass: `Go to today` itself is always in the toolbar; only the notice is conditional.)*
  This is a deliberate behaviour change from `ScrollingSchedule.MD`, whose scroll-driven tests are
  amended rather than dropped.
- **One request per window, and the day cache stays.** Three contiguous days is one call, inside
  both the server's 7-day cap and `useScheduleNotes`'s 5-day chunk. The cache still earns its place:
  the calendar makes it easy to bounce between days, and a day already held costs nothing.
  `contiguousRuns` is still needed — a jump from this week to last leaves a hole between the cached
  days and the wanted ones — and `chunkRun` stays as the cap guard even though a three-day window
  never splits.
- **No prefetch beyond the window.** The wanted window *is* the rendered window. A fourth day would
  only pay off for a scroll that can no longer happen.
- **Navigation sits in one fixed toolbar above the scroll.** Amended during the UI pass: the
  specification put a `Calendar` button at each end of the scroll content, where the sentinels
  were. It is now a single toolbar of `Calendar` and `Go to today`, a sibling of the scroll
  container rather than part of its content, so navigation is always in the same place and never
  has to be scrolled to.
- **The calendar is a modal `<dialog>`**, like `NoteDialog` — the schedule stays behind it, Escape
  and the backdrop close it, and the `showModal`/`close` stubs already in `src/test/setup.ts` cover
  it. It is not a second top-level mode of the app.
- **The grid is a real month, weeks starting Monday.** It shows the whole weeks the month falls
  across (five or six rows), with the leading and trailing days of the adjacent months dimmed and
  **still selectable** — a day is a day. Month heading plus previous/next buttons; it opens on the
  month containing the focus day.
- **Note markers come from a new endpoint, not from the list route.** `GET
  /api/schedules/{shortName}/note-days` answers `[{ day, count }]` for a range of up to **42 days**
  (the widest grid), so one request paints a month. Through the existing list route it would be
  roughly seven chunked calls with every note's content downloaded to render a dot.
- **Counts are grouped in the caller's offset.** The bounds already carry the browser's UTC offset;
  the endpoint buckets each note's `OccursAt` into a date *in that offset*, so what comes back is
  the client's local days and no timezone reinterpretation happens in the UI.
- **Picking a day pins it; picking the current day un-pins.** Choosing from the calendar is a
  commitment, so it sets `pinned` exactly as selecting a row does, the selection landing on the
  current period if that day is today and on the day's first period otherwise. Choosing today is
  identical to pressing *Go to today*: `pinned` becomes `null` and the view follows the clock again.
- **The calendar fetches counts and nothing else.** Jumping to a day fetches its three-day window
  through the existing path.
- **Counts are fetched per shown month, cached per Schedule, and not revalidated.** Paging back and
  forth costs one request per month, once. A note created in this session does not move a marker
  until a fresh mount — acceptable while nothing is saved at all; `NoteAutosave.MD` is where that
  becomes a real question.
- **No week or year view, no drag, and no keyboard grid navigation beyond tab order.** A month grid
  and two arrows is the whole of it.

## Architecture

Both projects. The backend gains one read-only slice; the frontend loses more code than it gains.

### Backend — `TimelyNotes.API`

- **`Models/NoteDayCount.cs`** (new) — `record NoteDayCount(DateOnly Day, int Count)`. A projection,
  not an entity; it sits beside `Note` because it is what the repository returns.
- **`Repositories/INoteRepository.cs`** — one method added:
  `Task<IReadOnlyList<NoteDayCount>> GetDayCountsBySchedule(string scheduleShortName,
  DateTimeOffset searchFrom, DateTimeOffset searchTo, CancellationToken ct)` — `ct` with no default,
  as the existing method has.
- **`Repositories/InMemoryNoteRepository.cs`** — implements it by filtering the same half-open
  window, converting each `OccursAt` to `searchFrom`'s offset, grouping on the resulting date and
  counting. Grouping is a query concern and belongs here, not in the endpoint (`CLAUDE.md`); a real
  store pushes it into a `GROUP BY`.
- **`Endpoints/Notes/GetNoteDaysByScheduleEndpoint.cs`** plus `GetNoteDaysByScheduleRequest.cs`,
  `GetNoteDaysByScheduleValidator.cs` and `NoteDayResponse.cs` (new) — REPR, one type per file,
  beside the existing list endpoint. Route `GET api/schedules/{scheduleShortName}/note-days`. The
  request carries the same nullable-but-required `SearchFrom`/`SearchTo` pair; the validator mirrors
  `GetNotesByScheduleValidator` with its own `MaximumRange = TimeSpan.FromDays(42)`. The response is
  `List<NoteDayResponse>` — `{ day, count }`, ascending, days with no notes omitted.
- **`TimelyNotes.API.http`** — a ready-made `note-days` request beside the existing ones.

### Frontend — `timely-notes-ui`

- **`src/domain/months.ts`** (new) — pure month arithmetic on the same epoch-ms local-midnight day
  keys `domain/days.ts` uses: `monthStartOf(dayStart)`, `addMonths(monthStart, n)`,
  `monthGrid(monthStart): number[][]` (weeks of seven day starts, Monday first, whole weeks either
  side), `isInMonth(dayStart, monthStart)`, `formatMonthHeading(monthStart)`.
- **`src/api/notesApi.ts`** — `getNoteDaysBySchedule(shortName, searchFrom, searchTo, signal)`,
  reusing `toOffsetIso` and `URLSearchParams`, returning `NoteDay[]` (`{ dayStart: number; count:
  number }`) with each wire `day` parsed to a **local** midnight, never through `new Date('…')`'s
  UTC reading of a bare date.
- **`src/hooks/useNoteDays.ts`** (new) — `useNoteDays(schedule, gridFrom, gridTo, enabled)` →
  `{ countFor(dayStart), isLoading, error }`. Same shape and rules as `useScheduleNotes`: cached per
  Schedule, each grid asked for once, aborted on a Schedule change and on unmount, and `enabled`
  false while the calendar is closed so nothing is fetched until it is opened.
- **`src/components/CalendarDialog.tsx`** (new) — the `<dialog>` shell: month heading,
  previous/next month buttons, close, and `MonthGrid` inside it. Opens and closes on an `isOpen`
  prop exactly as `NoteDialog` does.
- **`src/components/MonthGrid.tsx`** (new) — presentational: a weekday header row, then a button per
  day carrying its date, `data-day`, a marker when its count is above zero, `aria-current="date"` on
  the current day, a selected state on the focus day, and a dimmed style outside the shown month.
- **`src/components/ScheduleView.tsx`** (rewritten, smaller) — the three `DaySection`s, a `Calendar`
  button above the first and below the last, and the scroll-to-focus-day effect. The observer, the
  sentinels, the growth callbacks, the anchor plumbing and the scroll-preservation effect all go.
- **`src/App.tsx`** — drops `range`, `direction` and `anchor`; derives the window as
  `[focusDayStart - 1, focusDayStart + 1]`; adds `isCalendarOpen` and `calendarMonth` state; owns
  `useNoteDays` and hands `CalendarDialog` finished counts. `awayFromToday` becomes
  `focusDayStart !== currentDayStart`.
- **`src/test/intersection.ts`** — deleted, with its registration in `src/test/setup.ts`.
- **`src/App.css`** — the calendar buttons at the ends of the scroll, the dialog, and the grid
  (seven equal columns, square-ish cells, a marker dot).

Data flow is unchanged in shape: `useNow` → `App` (focus day, window, both hooks, periods per day)
→ `ScheduleView`/`CalendarDialog` → `DaySection`/`MonthGrid` → `PeriodRow`. Nothing below `App`
fetches, and nothing below `App` reads the clock.

## Checklist

### 1. Backend — per-day note counts

- [x] Test first in `TimelyNotes.API.Tests/Repositories/InMemoryNoteRepositoryTests.cs`:
      `GetDayCountsBySchedule` returns one entry per day that has notes, counted correctly, ascending
      by day, omitting days with none.
- [x] It honours the half-open window: a note exactly at `searchFrom` counts, one exactly at
      `searchTo` does not.
- [x] It is scoped to the Schedule: `s3` notes never appear in an `s1` count.
- [x] Grouping uses `searchFrom`'s offset — a note near local midnight lands on the day the caller
      means. Assert with two requests over the same instant under different offsets.
- [x] `NoteDayCount` model and the `INoteRepository` method, `ct` declared without a default.
- [x] Test first in `TimelyNotes.API.Tests/Endpoints/Notes/`: `GET
      /api/schedules/s1/note-days?searchFrom=…&searchTo=…` returns `200` with the counts.
- [x] The endpoint (`GetNoteDaysByScheduleEndpoint`), request and response types, one per file.
- [x] Validator tests: a missing `searchFrom` is a `400` naming the parameter; a missing `searchTo`
      likewise; `searchTo` not after `searchFrom` is a `400`; a window wider than **42 days** is a
      `400`, and exactly 42 days is accepted.
- [x] `GetNoteDaysByScheduleValidator`, mirroring the existing one with its own `MaximumRange`.
- [x] One-line `Summary`, and a `Description` covering the two things a caller cannot guess: the
      half-open window with its 42-day cap, and that days are grouped in `searchFrom`'s offset.
- [x] Add the request to `TimelyNotes.API/TimelyNotes.API.http`. *(Setup step, no test.)*

### 2. Month arithmetic (`src/domain/months.ts`) — prerequisite

- [x] Test first in `src/domain/months.test.ts`; every function is pure and covered directly.
- [x] `monthStartOf(dayStart)` — local midnight of the 1st of that month.
- [x] `addMonths(monthStart, n)` — through local clock fields; going back from a 31-day month and
      across a year boundary both land on the 1st.
- [x] `monthGrid(monthStart)` — weeks of seven local day starts, **Monday first**, covering whole
      weeks. Assert the first and last cells for a fixed month, that every row is seven long, and
      that a month starting on a Sunday yields six rows.
- [x] `isInMonth(dayStart, monthStart)` — false for the leading and trailing days of the grid.
- [x] `formatMonthHeading(monthStart)` — e.g. `September 2026`, in the locale style
      `formatDayHeading` already uses.

### 3. The counts API and its hook

- [x] Test first in `src/api/notesApi.test.ts`: `getNoteDaysBySchedule` calls
      `/api/schedules/{shortName}/note-days` with both bounds as offset-carrying instants, asserted
      **structurally** (parse the URL, compare instants, regex the format) — never as a literal
      string, which only passes in one timezone.
- [x] Each wire `day` (`2026-09-03`) parses to a **local** midnight: assert the returned `dayStart`
      equals `dayStartOf` of a locally-constructed date, not a UTC one.
- [x] A non-`2xx` response throws, as `getNotesBySchedule` does, and the `signal` is passed through.
- [x] Test first in `src/hooks/useNoteDays.test.tsx`, driven through a probe component with `fetch`
      stubbed: with `enabled` false, nothing is requested at all.
- [x] Enabling it requests the grid once and exposes `countFor(dayStart)`; a day with no notes
      answers 0.
- [x] Moving to another month requests only the new grid; moving back re-renders from cache with no
      second request.
- [x] Changing Schedule drops the cache, aborts what is in flight and refetches under the new short
      name; late counts from the old Schedule are never rendered.
- [x] Unmount aborts and updates no state afterwards (StrictMode double-mounts).
- [x] A failed request surfaces `error` without wiping the counts already held.

### 4. The month grid (`src/components/MonthGrid.tsx`)

- [x] Test first in `MonthGrid.test.tsx`, given a fixed month, a fixed `now` and a stub `countFor`.
- [x] Renders a weekday header (Mon–Sun) and one button per grid day, in order, with the day number
      as its accessible name.
- [x] A day with a count carries a marker and says so accessibly (its label reads e.g. `3 notes`);
      a day with none carries no marker.
- [x] The current day is `aria-current="date"`, the focus day is marked selected, and days outside
      the shown month are dimmed but still enabled.
- [x] Pressing a day calls `onPickDay` with its local day start.

### 5. The calendar dialog (`src/components/CalendarDialog.tsx`)

- [x] Test first in `CalendarDialog.test.tsx`.
- [x] Closed, it renders nothing visible and calls neither `showModal` nor `onPickDay`; open, it
      shows the month heading and the grid.
- [x] The previous/next buttons call `onChangeMonth` with the neighbouring month start; the
      component holds no month state of its own.
- [x] `onClose` fires on the close button and on the dialog's `cancel` (Escape), matching
      `NoteDialog`'s existing behaviour.
- [x] Picking a day passes straight through to `onPickDay`; the dialog does not decide what a pick
      means.
- [x] A loading or failed count fetch does not block the grid: the days render regardless, with a
      quiet line — the same rule as a day whose notes have not landed still rendering its rows.

### 6. The bounded Schedule view (`src/components/ScheduleView.tsx`)

- [x] Amend `ScheduleView.test.tsx`: delete the sentinel, growth, anchor and scroll-preservation
      tests along with the code they cover, and record that here rather than dropping them silently.
- [x] Renders one `DaySection` per `DayView` it is given, in order, in the one scroll container.
- [x] One `role="toolbar"` renders above the scroll container and outside it, holding `Calendar`
      and `Go to today` in that order and calling `onOpenCalendar`/`onGoToToday`. *(Amended: the
      original asked for a Calendar button at each end.)*
- [x] The focus day is scrolled into view when it *changes* and not on mount — the mount scroll
      still belongs to the selected row, and `LiveClock.MD`'s one-call-at-mount test still passes.
- [x] Selection is passed down per day: only the day holding the selected period gets it.
- [x] Delete `src/test/intersection.ts` and its registration in `src/test/setup.ts`. *(Setup step.)*

### 7. `App` — the three-day window and the calendar

- [x] Test first in each case, in `App.test.tsx`.
- [x] Exactly three day sections render on mount — yesterday, today and tomorrow — and the mount
      request is **one** call covering `[focus − 1, focus + 2)`.
- [x] Remove `range`, `direction` and `anchor` state and the `onReachStart`/`onReachEnd` handlers.
      Amend `ScrollingSchedule.MD`'s growth tests in place: growth no longer exists.
- [x] Ticking the clock still issues no request (the existing *does not refetch as the clock ticks*
      test, now with three days rendered).
- [x] A midnight rollover on an unpinned view moves the window one day forward and issues exactly
      one request, for the single new day.
- [x] `isCalendarOpen` and `calendarMonth` state: the `Calendar` button opens the dialog on the
      month containing the focus day, and no counts are requested before it is opened.
- [x] Picking a day in another month re-points the view: three sections centred on that day, its
      notes requested once, and the selection on that day's first period.
- [x] Picking a day fetches only that window — assert there are no requests for the days between
      here and there.
- [x] Picking the current day is *Go to today*: `pinned` is `null`, the selection is the current
      period, and the notice disappears.
- [x] `awayFromToday` is now `focusDayStart !== currentDayStart`. Amend `ScrollingSchedule.MD`'s
      anchor-based tests in place: scrolling within the three days no longer raises the notice, and a
      calendar jump does. `LiveClock.MD`'s rollover copy and markup are unchanged.
- [x] Changing Schedule while the calendar is open keeps it open and re-requests the counts under the
      new short name.

### 8. Styles (`src/App.css`)

- [x] **Setup step, no test:** the navigation toolbar above the scroll content; the dialog
      sized for a month; the grid as seven equal columns of square cells, with a marker dot, a
      current-day ring and a dimmed out-of-month state. `--day-height` keeps its meaning, so the
      three days are the same height under every Schedule.

### 9. Docs

- [x] Update `CLAUDE.md` **Frontend** section: the three-day window, the deleted observer and anchor
      machinery, `domain/months.ts`, `useNoteDays`, and the `CalendarDialog`/`MonthGrid` pair.
- [x] Update `CLAUDE.md` **Backend** section and **Current state** once the feature is green.
- [x] Amend `feature-docs/todo/PlaywrightE2E.MD`: its scroll journey assumes unbounded growth.
      Replace it with a calendar journey — open the calendar from the end of the scroll, page a month
      back, pick a seeded day, assert its notes render, and assert the request count is one window.

## Verify

- [x] `dotnet build` and `dotnet test` from `TimelyNotes.Backend/` — green, including the new
      repository, endpoint and validator tests.
- [x] `npm test` from `timely-notes-ui/` — green, with the deleted scroll-growth tests accounted for
      in the implementation notes and the amended ones passing.
- [x] `npm run build` and `npm run lint` — clean.
- [x] Both dev servers running (`./run-dev.ps1`), driven in a real browser:
  - the schedule shows three days, the page still does not scroll and `.schedule-view` does;
  - the toolbar stays put while the days scroll, and scrolling to either end adds no day and issues
    no request;
  - the calendar opens on the current month with markers on the seeded days (today ± 3), pages to the
    previous and next month with one request each, and none when paging back;
  - picking a seeded day shows that day and its neighbours with their notes, and raises *Go to
    today*; pressing that returns to the current three days;
  - Escape closes the calendar and leaves the view where it was.
- [x] The jitter this feature exists to remove is gone: scrolling the three days end to end is
      smooth, and the container's height never changes mid-scroll.

## Deferred

- **Week and year views, and keyboard grid navigation.** A month grid and two arrows is the scope.
- **Invalidating a month's counts when a note is created.** Nothing is saved yet; `NoteAutosave.MD`
  is where a marker first needs to appear without a reload.
- **A Schedule window wider than three days**, and any user setting for it.
- **Deep-linking a day, or persisting the picked day across reloads.** There is still no router.
- **Counts per *period* rather than per day**, and any preview of a day's content in the grid.
- **Widening the dev seed past today ± 3.** Empty months in the calendar are correct — the store
  really is empty there.

## Implementation order

Ahead of the two specifications already in `todo/`:

1. **`CalendarNavigation.MD`** (this one) — it settles the read-side view and the navigation model
   the other two are written against.
2. **`NoteAutosave.MD`** — create-on-open and autosave, with the `POST`/`PUT` endpoints. It picks up
   the count-invalidation question deferred above.
3. **`PlaywrightE2E.MD`**, with the §9 amendment applied.

## Implementation notes


Built in checklist order: the backend slice first, then `domain/months.ts`, the counts API and its
hook, the two calendar components, the bounded view, and `App` last. Every box above was ticked
against a passing test; the two unticked items in **Verify** are the manual browser pass, which has
not been run — everything else is green (`dotnet test` 55 passed, `npm test` 218 passed,
`npm run build` and `npm run lint` clean).

### Decisions taken while implementing

- **`NoteDayCount.Day` is a `DateTimeOffset`, not a `DateOnly`.** The specification suggested
  `DateOnly`; every other timestamp that crosses this API is a `DateTimeOffset`, so the projection
  follows suit and carries midnight in `searchFrom`'s offset. The frontend parses it through
  `dayStartOf(new Date(day))`, so it lands on a local midnight whichever representation the server
  chooses.
- **`formatMonthHeading` is a hand-rolled English month table**, not `toLocaleDateString`. The
  specification called it "the locale style `formatDayHeading` already uses", but `formatDayHeading`
  is hand-rolled `dd/mm/yyyy` with no `Intl` at all — a locale-driven heading would also make its
  test pass only in one locale. UK date formatting stays the default throughout; the grid cells show
  the bare day number.
- **The `Calendar` buttons are pinned to the container's edges**, not placed in the scroll content
  where the sentinels were. They are siblings of `.schedule-view` inside a new `.schedule` flex
  column, so both are visible at all times: the user can scroll the neighbouring days and go back to
  the calendar without hunting for the button.
- **`MonthGrid` takes finished `weeks`** rather than computing them from `monthStart`. `App` needs
  the grid anyway, to give `useNoteDays` its bounds, and this keeps the "nothing below `App` calls
  the domain functions" rule intact for the arithmetic. It still calls `isInMonth`, in the same way
  `DaySection` calls `isCurrentPeriod`.
- **`useNoteDays` reports loading from the grids it holds**, not from an in-flight counter: the set
  of answered grid keys lives in the cache beside the counts, so an abort or an unmount cannot leave
  a counter stuck above zero.

### Tests deleted with the code they covered

From `ScheduleView.test.tsx`: the sentinel-observation, `onReachStart`/`onReachEnd`, anchor-report,
anchor-moves-on, observer-disconnect and the two scroll-preservation tests. From `App.test.tsx`: the
whole `App — scrolling` suite's growth and anchor journeys. The observer, the sentinels, the growth
callbacks, the anchor plumbing and the scroll-preservation layout effect no longer exist, and
`src/test/intersection.ts` is deleted with its registration in `setup.ts`. What survived was
rewritten against the bounded view and lives in `App — calendar navigation`: notes landing on the
day they occur on, a day announcing that it is loading without hiding its rows, and the selection
moving on to another day.

### Behaviour changes worth knowing

- **A rollover under a pinned view now leaves the current-period marker on screen.** The new current
  day is one of the three rendered, so `aria-current="time"` moves on to it while the selection stays
  where the user put it. Under the old unbounded view the marker simply disappeared, and the
  `stays put over midnight` test asserted exactly that; it now asserts the marker is on the new day
  and the selection is on the old one.
- **`Go to today` no longer needs a scroll to appear.** It is `focusDayStart !== currentDayStart`,
  so scrolling within the three days raises nothing and a calendar jump raises it immediately.

### The UI pass

Driven in Chromium against both dev servers on the real seed (4 September 2026, `s3`), at a 480×900
viewport. Everything in **Verify** checked out:

- three days render (`03`, `04`, `05/09/2026`), the page does not scroll and `.schedule-view` does;
- scrolling the container end to end adds no day, issues no request, and leaves `scrollHeight` at
  2140px throughout — the jitter this feature exists to remove is gone;
- the calendar opens on `September 2026` with markers on exactly the seeded days (`2, 1 note`,
  `4, 2 notes`, `5, 1 note`), pages to August with one count request and back to September with
  none;
- picking `2 September` renders `01`–`03/09`, selects `00:00 – 03:00`, shows that day's note and
  raises the notice; *Go to today* returns to `03`–`05/09` and the notice goes;
- Escape closes the calendar and leaves the view where it was.

Two things the run confirmed rather than found:

- **A jump asks only for the days it does not hold.** Jumping from `03`–`05/09` to `01`–`03/09`
  requested `[01/09, 03/09)`, not three days: `03/09` was already cached. That is `contiguousRuns`
  working, and nothing was requested for the days in between.
- **The mount request fires twice in dev.** React StrictMode double-mounts, the Schedule effect's
  cleanup aborts and resets `requested`, and the window is asked for again. Pre-existing, dev-only,
  and not introduced here.

### Amended after the UI pass: one navigation toolbar

The specification put a `Calendar` button at each end of the scroll content. On review that was
replaced by a single `role="toolbar"` above the scroll container holding **Calendar** and **Go to
today**, so navigation is consistent and always in the same place. `Go to today` therefore left the
rollover notice, which is now a plain `role="status"` sentence — the notice is still conditional on
`focusDayStart !== currentDayStart`, but the control it used to hold never disappears. Pressing
*Go to today* while already on today is a deliberate no-op, tested as such. `App.css` lost
`.app__rollover-action` and gained `.schedule__nav`/`.schedule__nav-button`.
