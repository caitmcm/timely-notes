# Scrolling schedule

## Goal

**Make the schedule scroll continuously through past and future days, loading each day's notes
before the user reaches it.**

Today the app renders exactly one day. `App` already fetches three (`viewedDay ± 1`) and throws
two away, and `LiveClock.MD` has already split *the day being viewed* from *the day it currently
is*. This feature turns that one rendered day into an unbounded vertical scroll:

1. **The view is a scroll container of day sections**, each the day heading plus its period rows,
   in one continuous column. It starts on the focus day and **grows a day at a time** in whichever
   direction the user scrolls — backwards through history, forwards into future days, unbounded
   either way, per `DESIGN DOCUMENT.MD` §"browsing in both directions".
2. **Notes load asynchronously, ahead of the scroll.** Days are fetched **two days beyond the
   rendered edge in the direction of travel** and one beyond the trailing edge, so a day that
   scrolls into view almost always already has its notes. Nothing blocks the scroll: a day that has
   outrun its fetch renders its rows immediately and says so.
3. **Days already fetched are never fetched again.** A per-Schedule day cache sits behind the
   range, so scrolling back over ground already covered is free, and only the genuinely missing
   days are requested.
4. **A `Today` control** returns the view to the current day from wherever it has been scrolled to.
   It replaces `LiveClock`'s rollover-only notice and subsumes it — the same
   `role="status"` + *Go to today* pairing, now shown whenever the day at the top of the viewport
   is not the current day, whether because the user scrolled or because midnight passed.

The backend is unchanged: `GetNotesBySchedule.MD` and `NotesDateRange.MD` already deliver the
half-open range query this needs, including the 7-day cap that shapes the request chunking below.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

- **A "page" is one calendar day.** The user's requirement is "two pages ahead or behind"; a day is
  the unit this app already thinks in — the unit the view renders, the unit the cache keys on, the
  unit the API window is expressed in, and the unit that makes `occursAt` bucketing trivial. Two
  days is 16 rows at `3h` and 48 at `1h`, comfortably more than a screenful in both cases.
- **Prefetch is asymmetric: two days ahead in the direction of travel, one behind.** The trailing
  day keeps a reversal cheap; everything further back is already cached from having been scrolled
  through. Before the user has scrolled at all there is no direction, and the window is the
  symmetric `focusDay ± 1` the app already sends — so the mount request is unchanged.
- **Growth is driven by sentinels, not by scroll offsets.** An `IntersectionObserver` on a spacer
  element above the first day and below the last one reports when the user has reached an edge, and
  the rendered range grows by one day. Scroll-offset arithmetic (`scrollTop`/`scrollHeight`
  thresholds) is the same logic done worse: it fires on every scroll event and has to be
  rate-limited, and jsdom reports every layout box as zero so it cannot be tested at all.
- **Rendering starts at one day, not three.** The sentinels are inside the viewport on first paint,
  so a browser grows to a filled scroll container within a frame or two — but nothing is rendered
  speculatively, and a test that never moves the observer sees exactly the one day the app renders
  today. Existing component and `App` tests therefore stay meaningful and almost all stay unchanged.
- **Requests are incremental, and capped at 5 days each.** The missing days in the wanted range are
  grouped into contiguous runs and each run is chunked to at most 5 days — inside the server's
  7-day maximum with room to spare. This changes an observable behaviour recorded in
  `LiveClock.MD`: a rollover used to refetch the whole new three-day window, and now asks only for
  the one day it does not already hold. That test is amended, deliberately.
- **A day is cached once and not revalidated.** Notes written in another tab still do not appear
  without a reload; polling and live sync stay deferred, as in `LiveClock.MD`. The cache is dropped
  wholesale when the Schedule changes — a Schedule is a different set of notes and a different
  chunking of the day.
- **Scrolling does not move the selection, and does not pin the view.** `pinned` keeps exactly the
  meaning `LiveClock.MD` gave it: it is set by selecting a row or opening a dialog, and while it is
  `null` the *selection* follows the clock. Scrolling is navigation of the viewport only, so a tab
  scrolled back through last week still rolls its selection over at midnight — and the `Today`
  control is right there. Two values are needed, not one: `focusDay` (what the app points the view
  at) and `anchorDay` (what the user has actually scrolled to).
- **`anchorDay` is reported by the view and discarded whenever `focusDay` moves.** It is stored
  against the `focusDay` it was observed under, so a rollover, a *Go to today* or a selection on
  another day invalidates it in the same render rather than through an effect. This keeps the
  `Today` control correct with no clock-driven `setState`, which the repo's ESLint config rejects
  (`react-hooks/set-state-in-effect`, see `LiveClock.MD`'s notes).
- **The day-boundary footer is dropped.** It exists to show where the rendered day ends; in a
  continuous scroll the next day's heading is that boundary, and keeping both would print
  `26/08/2026` twice in a row. Day headings become sticky instead, so the day being read is always
  named at the top of the viewport.
- **No virtualisation, no windowing-out of scrolled-past days.** Rendered days accumulate. A day is
  8–24 rows, so a long session is hundreds of DOM nodes, not thousands, and dropping days from the
  top would fight the browser's scroll anchoring for no measurable gain. If this ever bites, it is a
  separate feature with a measurement behind it.
- **No date picker and no jump-to-date.** `Today` is the only non-scroll movement, exactly as the
  design document describes.
- **The seed still spans today ± 3 days, so scrolling further in dev shows empty days.** Widening it
  would churn the repository tests that pin the ±3 window for a fixture that a real store deletes.
  Empty days rendering as empty is correct behaviour, and it is what the store actually holds.

## Architecture

Frontend only. No backend, contract or `notesApi` change: `getNotesBySchedule(shortName, from, to,
signal)` is already exactly the call this needs.

- **`src/domain/days.ts`** (new) — pure day arithmetic on **epoch-ms local midnights**, the key type
  the whole feature uses: `dayStartOf(instant)`, `addDays(dayStart, n)`,
  `eachDay(first, last)`, `contiguousRuns(days)`, `chunkRun(run, max)`. Built from local clock
  fields, never from millisecond arithmetic, so a DST day keeps 24 hours' worth of periods.
- **`src/hooks/useScheduleNotes.ts`** (new) — owns the day cache and the fetching.
  `useScheduleNotes(schedule, wantFrom, wantTo)` → `{ notesFor(dayStart), isLoaded(dayStart), error }`.
  It requests only days it holds neither loaded nor in flight, chunks them as above, buckets each
  response by `occursAt`'s local day, and records days that came back empty so they are not asked
  for twice. In-flight requests are aborted on unmount and on a Schedule change, never on a range
  change — a range change is what *starts* requests, and aborting them would cancel the prefetch it
  just asked for.
- **`src/components/DaySection.tsx`** (new, extracted from today's `ScheduleView`) — one day:
  heading plus period rows. Same props as `ScheduleView` has now, minus the boundary footer, plus
  `isLoading`. Its existing tests move here almost verbatim.
- **`src/components/ScheduleView.tsx`** (rewritten) — the scroll container: the day sections, the
  two sentinels, the `IntersectionObserver`, scroll-position preservation when a day is prepended,
  and the scroll-to-focus-day effect. It reports `onReachStart`/`onReachEnd`/`onAnchorDay` upwards
  and holds no domain state.
- **`src/App.tsx`** — gains the rendered range (`range`), the travel `direction` and the observed
  `anchorDay`, derives the wanted fetch window from them, and hands `ScheduleView` a `DayView[]`
  (`{ dayStart, periods, isLoading }`). It keeps ownership of the domain calls: `buildPeriods` +
  `assignNotes` run per rendered day inside one `useMemo`.
- **`src/test/intersection.ts`** (new) + `src/test/setup.ts` — a stub `IntersectionObserver` (jsdom
  has none), with a helper that fires entries for a chosen element, so growth is driven
  deterministically in tests rather than through a fake layout.
- **`src/App.css`** — the scroll container, sticky day headings and the `Today` bar.

Data flow, unchanged in shape and still one-way: `useNow` → `App` (focus day, range, window,
`useScheduleNotes`, periods per day) → `ScheduleView` → `DaySection` → `PeriodRow`. Nothing below
`App` fetches, and nothing below `App` reads the clock.

### Rendered range vs. wanted window

Two ranges, both in day starts, both derived so there is no second source of truth:

- **`rendered`** — `range` state (`{ first, last }`, inclusive), corrected in render to cover
  `focusDay`: if `focusDay` falls outside `range` (a rollover, or *Go to today* from a week back),
  the rendered range **resets** to `focusDay ± 1` rather than stretching to span the gap.
- **`wanted`** — `[rendered.first - behind, rendered.last + ahead]`, where `ahead`/`behind` are 2 in
  the direction of travel and 1 on the other side, and 1/1 before any scroll has happened.

## Checklist

### 1. Day arithmetic (`src/domain/days.ts`) — prerequisite

- [x] Test first in `src/domain/days.test.ts`; every function is pure and covered directly.
- [x] `dayStartOf(at: Date): number` — epoch ms of the local midnight containing `at`.
- [x] `addDays(dayStart: number, days: number): number` — built from local clock fields, so a day
      across a DST change still lands on midnight. Test with a fixed non-UTC date near a boundary.
- [x] `eachDay(first: number, last: number): number[]` — inclusive both ends; a single-day range
      returns one day; `last < first` returns empty.
- [x] `contiguousRuns(days: number[]): number[][]` — sorts, then splits on any gap. Covers the
      cache-hole case: `[1, 2, 5]` becomes `[[1, 2], [5]]`.
- [x] `chunkRun(run: number[], maxDays: number): number[][]` — splits a run into requestable
      chunks; a run shorter than the maximum comes back whole.
- [~] `daysBetween(a, b)` — **not written**: nothing in the finished feature needs a day distance.
      See the implementation notes.
- [x] `dayKeyOf(instant: Date): number` — the day a note's `occursAt` belongs to; the same value
      `dayStartOf` returns, named for the bucketing use so the call sites read.

### 2. The day cache and its fetching (`src/hooks/useScheduleNotes.ts`)

- [x] Test first in `src/hooks/useScheduleNotes.test.ts`, driving the hook through a probe
      component with `fetch` stubbed, as `App.test.tsx` already does.
- [x] `useScheduleNotes(schedule, wantFrom, wantTo)` requests the wanted days on mount and returns
      each day's notes bucketed by `occursAt`, in one request when they are contiguous.
- [x] Widening the range by a day requests **only the new day** — assert the second request's
      window is one day wide and that days already held are not re-requested.
- [x] Narrowing the range issues no request at all, and the dropped days stay in the cache: widening
      back to them re-renders their notes without a fetch.
- [x] A day that returns no notes is remembered as loaded-and-empty: asking for it again issues no
      second request.
- [x] A wanted range wider than the 5-day chunk is split into several requests, each at most 5 days,
      together covering the range exactly once with no overlap (half-open bounds make an overlap a
      duplicated note).
- [x] Non-contiguous missing days become separate requests — one per run, never one request
      spanning the cached gap.
- [x] Changing Schedule drops the cache, aborts anything in flight, and refetches the wanted range
      under the new short name. Assert the abort, and that late notes from the old Schedule are not
      rendered.
- [x] A range change does **not** abort the requests already in flight for it: widen twice in quick
      succession and assert both responses land.
- [x] Unmount aborts everything in flight and updates no state afterwards (React 19 StrictMode
      double-mounts, so this has to be clean).
- [x] A failed request surfaces `error` — the existing "Could not load notes for the … schedule."
      message — without wiping the days already loaded, and the failed days may be requested again
      when the range next changes.
- [x] `isLoaded(dayStart)` is false for a day still in flight and true once its response lands; it
      is what drives the per-day loading state in the view.

### 3. One day as a component (`src/components/DaySection.tsx`)

- [x] Move `ScheduleView.test.tsx`'s existing day-level tests to `DaySection.test.tsx` and make
      them pass against the extracted component — heading, one row per period, exactly one current
      row, exactly one selected row, the Note button, note buttons, and the callbacks.
- [x] Drop the day-boundary footer and its two tests; the next day's heading is the boundary now.
      Amend rather than delete silently: the checklist item is the record.
- [x] The mount-only `scrollIntoView` of the selected row stays exactly as it is, and stays
      mount-only. `LiveClock.MD` has a test asserting it is not called again on a tick.
- [x] `isLoading` renders a quiet, non-blocking per-day line; the rows render regardless, so a day
      whose notes have not landed is scrollable and readable rather than a spinner.
- [x] The section carries `data-day={dayStart}` — the observer reads it to report the anchor day.

### 4. The scroll container (`src/components/ScheduleView.tsx`)

- [x] Test first in `ScheduleView.test.tsx`, rewritten around the stub observer from §7.
- [x] Renders one `DaySection` per `DayView` it is given, in order, inside one scroll container.
- [x] The top sentinel intersecting fires `onReachStart` exactly once per intersection; the bottom
      sentinel fires `onReachEnd`. Leaving the viewport fires neither.
- [x] The observer is created with the scroll container as its `root`, and is disconnected on
      unmount.
- [x] `onAnchorDay` reports the **earliest day currently intersecting**, and only when it changes —
      scrolling within one day reports nothing further.
- [x] Prepending a day preserves the reading position: assert `scrollTop` is adjusted by the height
      the prepended section added, so the row under the user's eye does not jump. (jsdom reports
      zero heights, so the test stubs `scrollHeight`; the real behaviour is confirmed in **Verify**.)
- [x] The focus day is scrolled into view when it *changes*, and not on mount — the mount scroll
      belongs to the selected row, and `LiveClock.MD`'s "one `scrollIntoView` call at mount" test
      pins that count.
- [x] Selection is passed down per day: the day holding the selected period gets it, every other
      day gets `undefined`.

### 5. `App` — range, direction and the wanted window

- [x] Test first in each case, in `App.test.tsx`.
- [x] `range` state, initialised to the focus day alone, and **reset in render to that day alone**
      when `focusDay` falls outside it. *Amended:* the specification said `focusDay ± 1` for the
      reset; see the implementation notes. Assert a rollover with a stale range renders the new day.
- [x] `onReachEnd` appends a day and sets the direction forward; `onReachStart` prepends one and
      sets it backward. Assert the rendered day count and the headings.
- [x] The wanted window is `rendered` extended by 2 days in the direction of travel and 1 the other
      way; before any scroll it is the symmetric `focusDay ± 1`, so **the mount request is
      byte-for-byte what it is today** — the existing three-day-window test must pass unchanged.
- [x] Scrolling to the end fetches the day after the one just rendered, and the one after that:
      assert the requested window reaches two days past the last rendered day.
- [x] Scrolling back does the same in the other direction.
- [x] Notes land on the right day: a note whose `occursAt` is tomorrow renders in tomorrow's
      section and not today's, once tomorrow is scrolled to.
- [x] Periods are built per rendered day in one `useMemo`, keyed on the range, the Schedule and the
      cache — not on `now`. Assert that ten minutes of ticks still issue no request (the existing
      "does not refetch as the clock ticks" test, now with several days rendered).
- [x] Amend `LiveClock.MD`'s rollover test in place: after midnight the app issues exactly one more
      request, and it now covers **only the newly wanted day**, not the whole window. Note the
      change in this document's implementation notes as well.

### 6. `App` — the `Today` control

- [x] Test first: it is absent on mount, absent while the anchor day is the current day, and
      present as soon as the anchor day is not.
- [x] `anchorDay` state is stored with the `focusDay` it was observed under, and ignored once
      `focusDay` moves — so a rollover, a selection on another day and *Go to today* each reset it
      in the same render, with no effect.
- [x] The control keeps `LiveClock.MD`'s markup and copy exactly: a `role="status"` line naming the
      current date and a *Go to today* button. Its four rollover tests must pass unchanged.
- [x] Pressing it sets `pinned` to `null`, resets the rendered range around the current day and
      scrolls there; assert the selection is the current period again and the control disappears.
- [x] Scrolling far away and pressing it does not fetch days between here and there: assert the
      request count after the jump.

### 7. Test plumbing (`src/test/`)

- [x] **Setup step, no test of its own:** `src/test/intersection.ts` — a stub
      `IntersectionObserver` recording its instances, plus `intersect(element, isIntersecting)`
      firing a callback for that element, and a reset between tests. Registered in
      `src/test/setup.ts` beside the existing `<dialog>` stubs, with a one-line comment saying why.

### 8. Styles (`src/App.css`)

- [x] **Setup step, no test:** the scroll container gets a bounded height and `overflow-y: auto`;
      day headings become `position: sticky`; the sentinels are one pixel tall (see the
      implementation notes) and `aria-hidden`; the `Today` bar reuses the existing
      `.app__rollover-action` button.
- [x] `--day-height` keeps its meaning — each day section is that tall, so every day is the same
      height under every Schedule and the scroll distance per day is constant.

### 9. Docs

- [x] Update `CLAUDE.md` **Frontend** section: the `days` domain module, `useScheduleNotes` and its
      cache, the `ScheduleView`/`DaySection` split, the focus-day vs. anchor-day rule, and the
      prefetch rule.
- [x] Update `CLAUDE.md` **Current state** once the feature is green.
- [x] Amend `feature-docs/todo/PlaywrightE2E.MD`: its journeys assume a single rendered day and a
      fixed three-day request window. Add a scroll journey (scroll back three days, assert the
      earlier day's seeded notes appear and that the requests are incremental) and correct any
      statement that the app renders one day.

## Verify

- [x] `npm test` from `timely-notes-ui/` — green, including every new test above.
- [x] `npm run build` and `npm run lint` — clean.
- [x] `dotnet build` and `dotnet test` from `TimelyNotes.Backend/` — green and untouched by this
      feature.
- [x] Both dev servers running, driven in headless Chromium (Playwright, 900 × 800) against the real
      API through the Vite proxy — the checks below are what that run reported:
  - the page never scrolls (`documentElement` and `body` both unscrollable) and `.schedule-view`
    does, which is what the user asked for;
  - scrolling to the bottom appends 03/09, 04/09, 05/09, 06/09 one at a time, each with a one-day
    request ahead of it; scrolling back to the top prepends 01/09 … 29/08 the same way;
  - the reading position holds when a day is prepended (`scrollTop` moves by exactly the height the
    new section added);
  - days already loaded are re-rendered with no request — every request in the run covered days the
    cache had never held, and none repeated a day;
  - the `Today` bar appears once the current day is off-screen (screenshot taken) and `Go to today`
    is wired to it.
- [x] Idle-with-no-requests is the Vitest test *does not refetch as the clock ticks*, now with
      several days rendered; the multi-minute browser watch is deferred to a later manual pass, as
      the equivalent check was in `LiveClock.MD`.
- [x] Seeded notes on the far days were **not** individually eyeballed: the seed spans today ± 3 and
      the run scrolled to today + 4 / today − 4, so the outer days are legitimately empty. Note
      placement by `occursAt` is covered by the Vitest test *puts a note on the day it occurs on*.

## Deferred

- **Virtualisation and dropping scrolled-past days from the DOM.** Explicitly decided against
  above, pending a measurement.
- **Revalidating cached days, polling and live sync.** Unchanged from `LiveClock.MD`.
- **A date picker or jump-to-date.** `Today` remains the only non-scroll movement.
- **Widening the dev seed past ± 3 days.** Empty days beyond it are correct; a real store makes the
  question disappear.
- **Persisting the scroll position across reloads**, and deep-linking a day. There is no router.
- **Creating notes on a scrolled-to day** works by construction — `occursAtFor` already stamps
  `period.start` for any non-live slot — but nothing is *saved* until `NoteAutosave.MD` lands.

## Implementation order

This document goes **first**, ahead of the two specifications already in `todo/`:

1. **`ScrollingSchedule.MD`** (this one). It is the last feature that reshapes the read-side view,
   and both of the others are written against the shape it settles.
2. **`NoteAutosave.MD`** — create-on-open and autosave, with the `POST`/`PUT` endpoints. Unaffected
   by this feature apart from the day a note is created on, which `occursAtFor` already decides.
3. **`PlaywrightE2E.MD`**, with the §9 amendment applied, so the browser lane is written once
   against final read-side behaviour — and gains the one journey jsdom genuinely cannot prove: a
   real scroll, with real layout, loading real days.

## Implementation notes

- **A zero-height sentinel flush with the end of the scroll content never reports as intersecting.**
  Found in a real browser, and the reason for the two departures in `ScheduleView`: the sentinels are
  `1px` tall, and the observer carries `rootMargin: '200px 0px'`. Before that, growth *backwards*
  worked and growth *forwards* silently did nothing — the bottom sentinel sat exactly on the
  container's bottom edge at maximum scroll, giving an empty intersection rectangle. No jsdom test
  could have caught this: the stub observer is driven by hand, so both directions passed. The margin
  is also the better behaviour on its own terms — a day is now asked for 200px before its edge is
  reached, rather than at the instant the user hits the end.
- **The rendered range resets to the focus day alone, not to `focusDay ± 1`.** §5 said ± 1, which
  would have made a rollover render three days where a mount renders one, for no reason: the
  sentinels refill the container in the same way either way. The mount request is unchanged, because
  the *wanted* window is still `focusDay ± 1`.
- **`daysBetween` was specified and never needed.** Nothing in the feature asks how far apart two
  days are; `eachDay` covers the enumerate case and `contiguousRuns` the grouping case. Dropped
  rather than written unused.
- **The scroll-preservation layout effect runs on every render, not on a change of the day list.**
  The container also grows as a day's notes land, so the height a prepend is measured against has to
  be the current one. Keyed on `days`, the first prepend after a load measured against a stale
  height and jumped the view by the difference.
- **`App`'s global `Loading notes…` line is gone; each day carries its own.** With several days
  rendered, one status for the whole view says nothing about which day is waiting — and a day whose
  notes have not landed still renders its rows, so it stays scrollable and selectable rather than
  being replaced by a spinner. `DaySection` shows the line in its heading.
- **The day-boundary footer went with it**, as planned, and its two `ScheduleView` tests were
  replaced by the per-day loading tests. Day headings are `position: sticky`, so the day being read
  is always named at the top of the viewport — which is what the footer was really for.
- **`body` is `overflow: hidden` and `.app` is a full-height flex column.** Asked for mid-feature:
  with days accumulating, the *page* scrollbar grew unboundedly. The schedule is now the only scroll
  container, its height is what is left after the header, and `overscroll-behavior: contain` keeps a
  scroll at either end from turning into a page gesture. Verified in the browser: neither
  `documentElement` nor `body` is scrollable, and `.schedule-view` is.
- **Committing to a row pins the day that row is on, keeping the selection where it was.** Opening
  a note on a day other than the selected one therefore moves the focus day without moving the
  selection — the same rule as scrolling. Moving the selection too would have been the more obvious
  code, and it breaks a `LiveClock` test that opens a note, cancels, and expects `Note` to still be
  on the originally selected row.
- **One `LiveClock.MD` test changed, as its own §5 item predicted:** the midnight rollover still
  issues exactly one request, but it now covers the single new day rather than the whole three-day
  window. The old expectation was pinning the *absence* of a cache.
- **React StrictMode issues the mount request twice in dev.** The Schedule-scoped controller is
  aborted by StrictMode's simulated unmount, and the re-run resets the requested-days set and asks
  again — which is exactly right for a genuine abort, and unavoidable without leaving the aborted
  days marked as requested and never loaded. Dev-only; the production build fetches once.
- **Timezone note:** everything the feature adds is local-midnight arithmetic through
  `domain/days.ts`, so the day boundaries follow the browser's offset, and `notesApi` still sends
  them with that offset attached.

**Verified:** `npm test` — **176 passed** across 13 files (up from 123: +15 `days`, +12
`useScheduleNotes`, +13 `ScheduleView`, +13 `App — scrolling`), `npm run build` and `npm run lint`
clean (the pre-existing MDXEditor chunk-size warning is unchanged). `dotnet build` and `dotnet test`
from `TimelyNotes.Backend/` — **35 passed**, untouched by this feature. Driven end to end in
headless Chromium against the running API through the Vite proxy: the page does not scroll and the
schedule does, scrolling down appended four days and scrolling back up prepended four, each with a
one-day request ahead of it and none repeating a day already held, the reading position held across
every prepend, and the `Today` bar appeared once the current day was off-screen.
