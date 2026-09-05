# Live clock

## Goal

**Make the app know what time it is while it is open, and stop conflating "the day being
viewed" with "the day it currently is".**

Today "now" is captured once, in two independent places, and never re-evaluated:

- `App.tsx:42` freezes the clock in a lazy `useState` initialiser at mount. Everything is
  derived from that one instant — `today` (`:43`), the fetch window `searchFrom`/`searchTo`
  (`:48-49`), the initial selection, and the `aria-current="time"` marker passed down to
  `ScheduleView` (`ScheduleView.tsx:51`).
- `InMemoryNoteRepository` is a singleton whose seed anchors to `DateTime.Today` at process
  start (`InMemoryNoteRepository.cs:45`).

So a tab left open past midnight shows yesterday and calls it today; the current-period
marker never moves (still on `18:00 – 21:00` at 21:30); the fetch window never advances; and
a long-running API drifts out of step with the browser.

This feature fixes the frontend defect and settles the concepts around it:

1. **`now` advances** — a single injectable `useNow` hook, ticking on the minute and
   resynchronising on tab visibility and window focus.
2. **`viewedDay` and `currentDay` become separate values in `App`.** They start equal. Only
   one of them is what the user is reading; only the other one moves on its own.
3. **A stated rule for rollover**: an untouched view follows the clock; a view the user has
   committed to (a manual selection, or an open dialog) does not, and is offered a
   dismissible *Go to today*.
4. **A written answer for where a new note's `occursAt` comes from**, since the create
   endpoint is the next slice and is the case where a stale clock writes bad data rather
   than drawing a stale pixel.

The backend seed is examined and deliberately left alone — see **Scope decisions**.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below. The
injected-clock seam stays; every new behaviour gets a Vitest test.

### Why now, and not after the next feature

The defect is cosmetic today and stops being cosmetic immediately:

- **Create-note.** `POST` is the next slice, and `occursAt` is the field the whole design
  keys off. Derived from a clock frozen at mount, a note written at 00:05 is stamped for the
  previous day — wrong data in the store, immutable by design, not a repaint away from being
  right.
- **Day navigation / the scrolling view.** It has to distinguish the day being viewed from
  the day it is. Right now those are one value, so the split has to be made *before* that
  feature rather than inside it.
- **`PlaywrightE2E.MD`.** Already written, not yet implemented, and its harness encodes the
  present frozen-mount-read behaviour. See §6 for the interaction and the ordering.

## Scope decisions

- **The clock ticks *and* resynchronises on visibility/focus — both, not either.** A timer
  alone is not enough: browsers throttle background timers, and a suspended or frozen tab
  (a closed laptop lid) fires none at all, so it wakes holding a stale `now`. A
  visibility/focus listener alone is not enough either: a tab sitting visible on a second
  monitor is never re-focused, and its marker would sit still all evening. One
  self-rescheduling `setTimeout` covers the foreground case; `visibilitychange` and `focus`
  cover resume-from-suspend.
- **Minute granularity, aligned to the wall clock — not a fixed interval.** Nothing in the
  app consumes anything finer: the marker moves on a period boundary (hourly at worst, since
  the smallest span is `1h` and every period starts on the hour), and the day rolls at
  midnight, which is a period boundary at all three spans. A minute tick moves the marker
  within a second of the boundary without the hook needing to know anything about spans or
  Schedules. Each timeout is computed from the clock as `60000 - (Date.now() % 60000)`, so it
  cannot accumulate drift and re-aligns itself for free after a DST change or a sleep.
- **A tick must not cause a refetch.** `now` is a new `Date` on every tick, so anything
  memoised on it — `today`, `searchFrom`, `searchTo` — would be rebuilt every minute and the
  fetch effect would refire every minute. Every derived value keys off the **day as a
  number** (`viewedDayStart`, epoch ms of local midnight) rather than the `now` object.
  This is the single most likely way to implement this feature and ship a fetch loop.
- **Rollover rule: the view follows the clock only while the user has not committed to
  anything.** `App` holds `followsClock`, true on mount:
  - **`followsClock === true`** — the selection tracks the current period as time passes,
    and at midnight `viewedDay` advances with `currentDay`, taking the fetch window with it.
    This is the "left the tab open overnight" case, and it does the obvious right thing.
  - **`followsClock === false`** — set the moment the user selects a row or opens a dialog.
    The view stays exactly where it is: the selection is not moved, the fetch window is not
    changed, and an open dialog is never touched. Rolling the day under someone mid-note is a
    worse bug than the one being fixed — and once `NoteAutosave.MD` lands, the open note is a
    *persisted* row whose `occursAt` was stamped on the old day, so a view that moved under it
    would be showing the note somewhere it does not live.
  - After a rollover with `followsClock === false`, a polite notice appears offering **Go to
    today**, which re-points `viewedDay` at `currentDay` and sets `followsClock` back to true.
- **That notice is not day navigation.** It goes to one place — the current day — and only
  exists after the day has changed under an open tab. Arbitrary day movement, a date picker
  and the `Today` button proper stay deferred; this is the seed the `Today` button grows from.
- **A new note's `occursAt` is the client's to send, stamped once when the editor opens.**
  The client already computes the window bounds because only it knows the user's timezone
  (`NotesDateRange.MD`), and the same argument applies to a slot: `occursAt` is a *local*
  wall-clock position, frequently a deliberately non-current one (the design document has
  past and future slots as first-class). The server keeps `CreatedAt`/`ModifiedAt`, per
  `CLAUDE.md` — the client never sends those. The value is:
  `occursAt = isCurrentPeriod(period, now) ? now : period.start` — the real time of day when
  writing into the live slot (so `PeriodRow` shows `09:47`, not `09:00`), and the slot start
  when writing into any other, where there is no meaningful time of day. It is read through
  `readNow()`, not from the last tick, so it is exact rather than up to 59 seconds stale.
- **The stamp is taken when the dialog opens, not when the note is saved.** `NoteAutosave.MD`
  creates the note on open and then autosaves it, so open *is* the write, and there is no later
  moment to read. It is also the better rule regardless: a note begun at 23:58 and finished at
  00:03 belongs to the 23:00 slot the user was writing about, and `occursAt` is immutable, so
  the alternative would need the value re-read at a moment that no longer means anything. `App`
  therefore stamps it in `handleTakeNote` and holds it in the dialog state.
- **The backend seed stays frozen at construction — the class remarks are right.** Anchoring
  per request would rebuild fourteen notes on every call and mint a fresh `Guid` per note per
  request, so ids would churn under an open dialog and under any future update call; and it
  is throwaway work, because the seed disappears the moment a real store lands. Restarting a
  dev API is the correct fix for a dev-only fixture. The one change is documentation: the
  remarks must now name the consequence, which is that the *UI* rolls over and the seed does
  not, so a dev server left running overnight will render an empty day that looks like a
  frontend bug.
- **`App`'s `now` prop keeps meaning "frozen here".** Supplying it disables the timer and the
  listeners entirely, so existing component tests stay deterministic and unchanged. Ticking
  behaviour is tested by rendering *without* the prop under Vitest fake timers.
- **No polling of the API.** The window advances on rollover and refetches once. Notes
  written elsewhere still do not appear without a reload; that is unchanged and out of scope.

## Architecture

Frontend only, apart from one documentation change in the API.

- **`src/hooks/useNow.ts`** (new folder) — the one place in the app that reads the clock.
  `useNow(frozen?: Date): { now: Date; readNow: () => Date }`. `now` is state, replaced on
  each tick; `readNow()` returns the exact current instant for one-off reads (the `occursAt`
  case), and returns `frozen` when frozen. A hook is not pure time logic, so it does not
  belong in `domain/`; `domain/` stays free of React.
- **`src/App.tsx`** — holds `viewedDay` (state) and derives `currentDay` from `now`. Keeps
  ownership of the domain calls and the fetch window, both keyed off `viewedDayStart`. Gains
  `followsClock` and the rollover effect.
- **`src/domain/notes.ts`** — gains `occursAtFor(period, now)`, pure and tested, so the rule
  above is settled in code before the create endpoint needs it.
- **`src/components/ScheduleView.tsx`** — `now` becomes a **required** prop; its
  `now = new Date()` default is itself a component reading the clock, which `CLAUDE.md`
  forbids. `App` already always passes it.
- **`TimelyNotes.API/Repositories/InMemoryNoteRepository.cs`** — remarks only.

Data flow, unchanged in shape: `useNow` → `App` (`currentDay`, `viewedDay`, window,
`buildPeriods`/`assignNotes`) → `ScheduleView` → `PeriodRow`. Nothing below `App` gains a
clock; the two components that take `now` keep taking it as a prop.

## Checklist

### 1. The clock hook (`src/hooks/useNow.ts`) — prerequisite

- [x] Test first, with `vi.useFakeTimers()` and `vi.setSystemTime`, in
      `src/hooks/useNow.test.ts`, driving a trivial probe component.
- [x] `useNow(frozen?: Date)` returns `{ now, readNow }`; with `frozen` supplied, `now` is
      that instant, `readNow()` returns it, and no timer or listener is registered — assert
      that advancing fake time and firing `visibilitychange` change nothing.
- [x] Unfrozen, `now` advances when the wall clock crosses a minute boundary, and does **not**
      change on a tick that crosses nothing (assert the returned value is only replaced once
      per minute).
- [x] The next timeout is computed from the clock each time (`60000 - (Date.now() % 60000)`),
      so a tick that fires late does not push every later tick late. Test by advancing time in
      an uneven jump and asserting the following boundary still lands on the minute.
- [x] Advancing fake time by hours while "hidden" and then dispatching `visibilitychange`
      (with `document.visibilityState` stubbed to `visible`) resyncs `now` immediately, without
      waiting for a timer.
- [x] A `window` `focus` event resyncs the same way.
- [x] `readNow()` returns the current instant even between ticks — assert it is ahead of `now`
      after advancing fake time by a few seconds.
- [x] Unmount clears the timeout and removes both listeners; assert no state update after
      unmount (React 19 StrictMode double-mounts, so this has to be clean).

### 2. `App` — separate the viewed day from the current day

- [x] Test first in each case, in `App.test.tsx`.
- [x] Replace the frozen `useState(() => nowProp ?? new Date())` with `useNow(nowProp)`;
      `now` keeps its documented meaning as "frozen for tests", and the doc comment on
      `AppProps.now` is rewritten to say so ("frozen: the view will not tick").
- [x] `currentDay` is derived from `now`; `viewedDay` is state initialised to `currentDay`.
      `ScheduleView` is handed `day={viewedDay}`.
- [x] `viewedDayStart` (epoch ms) is the memo key for `searchFrom`, `searchTo` and `periods` —
      not the `now` object. Test: with the clock unfrozen and fake timers, ten minutes of ticks
      produce **one** fetch, and the existing "one fetch per Schedule change" test still holds.
- [x] The current-period marker moves as the clock passes a boundary: mount unfrozen at 20:59
      on the `3h` Schedule, advance past 21:00, and assert `aria-current="time"` has moved from
      `18:00 – 21:00` to `21:00 – 00:00`.
- [x] With `followsClock` true, the *selection* follows the marker across that boundary too —
      the untouched view stays pointed at the live slot.
- [x] `ScheduleView`'s mount-only `scrollIntoView` stays mount-only: a follow must not yank the
      viewport while the user is reading. Assert it is not called again after a tick.

### 3. `App` — day rollover

- [x] Test first: mount unfrozen just before midnight and advance past it.
- [x] `followsClock` starts true and is set false by `onSelect` and by either dialog opener
      (`handleTakeNote`, `handleOpenNote`). Switching Schedule does **not** set it false — it
      already re-derives the selection from `now`.
- [x] Rollover with `followsClock` true: `viewedDay` advances, the heading shows the new date,
      the window advances by a day and exactly one refetch is issued, and the selection lands
      on the new day's current period (`00:00 – 03:00` at `3h`).
- [x] Rollover with `followsClock` false: the heading, the selection and the window are all
      unchanged, no refetch is issued, and no row carries `aria-current="time"` any more —
      `isCurrentPeriod` is already false for every period of a day that is not today, so this
      needs no new logic, only an assertion.
- [x] Rollover with a dialog open: the dialog stays open, keeps its period and its content, and
      the view does not move. This is the case the whole rule exists for.
- [x] The rollover notice renders only when the day has changed and `followsClock` is false: a
      `role="status"` message naming the new current date, plus a **Go to today** button.
- [x] **Go to today** sets `viewedDay` to `currentDay`, sets `followsClock` true, moves the
      selection to the current period, dismisses the notice and triggers exactly one refetch.
- [x] The notice is not a navigation surface: it appears only after a rollover, and there is no
      way to reach any other day. Assert it is absent on a normal mount.

### 4. `occursAt` for a new note (`src/domain/notes.ts`)

> **Overturned by `OneNotePerPeriod.MD` (2026-09-05).** `occursAtFor` is deleted and `Note` carries
> no `occursAt` at all. This section existed so that several notes in one period could be told apart
> by their live instant (`09:47` rather than `09:00`). A period now holds at most one note, so there
> is nothing to tell apart — and the instant was itself what made a second, unreachable note in one
> period constructible: `assignNotes` placed a note by containment while a row's button addressed
> `period.start`, two rules for one relationship. A note is addressed by
> `(Schedule, Day, PeriodOrdinal)` and by nothing else, and `App.handleSave` logs that address where
> it logged the stamp. The rest of this document — `useNow`, the viewed-day/current-day split, the
> rollover rules — still stands.

- [x] Test first in `domain/notes.test.ts`.
- [x] `occursAtFor(period: Period, now: Date): Date` — `now` when `isCurrentPeriod(period, now)`,
      otherwise `period.start`. Cover: the live slot returns the instant itself; a past slot and
      a future slot each return their own start; the boundary cases follow `isCurrentPeriod`'s
      half-open rule (`start` inclusive, `end` exclusive).
- [x] Document on the function that this is the value the create endpoint will receive as
      `occursAt`, and that `createdAt`/`modifiedAt` are the server's, never the client's.
- [x] `App.handleTakeNote` computes it with `readNow()` — not the ticked `now` — at the moment
      the dialog opens, and holds it in the dialog state beside `dialogPeriod`. Test that taking
      a note at 00:05 stamps an `occursAt` on the new day, which is the bug this rule exists to
      prevent, and that the stamp does not change while the dialog stays open.
- [x] `handleSave` logs the held stamp beside the markdown, still without persisting anything.
      `NoteAutosave.MD` replaces that log with the `POST`; this feature only guarantees the
      value it will be given is correct.

### 5. `ScheduleView` — close the clock-reading hole

- [x] Test first: the existing `ScheduleView` tests all pass `now`, so make it required and let
      `tsc -b` and the test suite prove nothing depended on the default.
- [x] Remove the `now = new Date()` default; `now: Date` is required, and its comment keeps
      stating why it is injected.

### 6. `PlaywrightE2E.MD` — reconcile the two specifications

`PlaywrightE2E.MD` sits in `todo/` unimplemented, and its harness is written against the
behaviour this feature changes. Amend that document in place rather than restating it here —
it owns its own suite.

- [x] Amend its §2 item "Verify which API actually holds `App`'s mount-time `new Date()`
      steady": the app no longer has a single mount-time read, so the requirement becomes that
      the clock is installed before `goto` **and stays fixed**, which `page.clock.install()`
      plus `pauseAt()` gives (and `setFixedTime` also gives, by never advancing). Its stubbed
      lane's expectations do not otherwise change: under a paused clock the app never ticks and
      behaves exactly as its behaviour table describes.
- [x] Amend its §8 (**the integrated lane**) to say the coupling **stands**: because the seed
      stays anchored to the API process's `DateTime.Today` (see **Scope decisions**), that lane
      must still freeze at a fixed time of day on *today's* date, and must additionally never
      fast-forward across midnight — the UI would roll to a day whose seeded notes exist only
      because the seed happens to span ±3 days, so the assertion would be accidental.
- [x] Add one item to its §4 or §8: a rollover journey — `page.clock.fastForward` past midnight,
      asserting that the untouched view follows and that a view with a dialog open does not.
      This journey cannot be written at all before this feature, and is the clearest case for
      having a browser lane.

### 7. Backend — documentation only

- [x] **Setup/documentation step, no test:** extend the `InMemoryNoteRepository` remarks to
      state that the frozen seed is a deliberate choice for a dev fixture, and that the UI now
      advances across midnight while the seed does not — so a dev API left running overnight
      renders an empty day, and the fix is to restart it.
- [x] No behaviour change: `dotnet test` must stay green and untouched by this feature.

### 8. Docs

- [x] Update `CLAUDE.md` **Frontend** section: the new `hooks/` folder and `useNow`, the rule
      that `useNow` is the only clock read in the app, the `viewedDay`/`currentDay` split, the
      "memoise on the day as a number, never on `now`" trap, and `occursAtFor`.
- [x] Update `CLAUDE.md` **Current state** once the feature is green.

## Verify

- [x] `npm test` from `timely-notes-ui/` — green, including every new test above.
- [x] `npm run build` and `npm run lint` — clean.
- [x] `dotnet build` and `dotnet test` from `TimelyNotes.Backend/` — green and unchanged.
- [x] `./run-dev.ps1`, then in the browser with the network tab open: leave the app idle for
      several minutes and confirm **no** repeated requests — the tick must not refetch.
      Both servers were started and the UI's own query was answered `200` through the proxy. The
      idle-refetch assertion itself is the Vitest test *does not refetch as the clock ticks*; the
      browser confirmation is deferred to a later manual pass, agreed with the user.
- [x] With the OS clock temporarily set to a minute before a period boundary, watch the marker
      and the selection move to the next period without a reload. Covered under fake timers by the boundary
      tests in `App.test.tsx`; the host-clock walk-through is deferred to a later manual pass,
      agreed with the user.
- [x] With the OS clock temporarily set to a minute before midnight: an untouched tab rolls to
      the new day and issues exactly one new request; a second tab with a note dialog open stays
      put, keeps its dialog, and shows the *Go to today* notice, which then moves it. Covered by the four rollover
      tests in `App.test.tsx`; the host-clock walk-through is deferred with the one above.
- [x] Suspend the machine (or leave the tab hidden for several minutes with the clock moved on)
      and return: the view is correct on the first frame, not a minute later. Covered by `useNow.test.ts`,
      which advances the system clock without firing a timer and asserts the `visibilitychange` and
      `focus` resyncs land immediately; the suspend/resume walk-through is deferred with the above.

## Deferred

- **Day navigation, the scrolling multi-day view and a date picker.** `viewedDay` is
  introduced here as a value only the rollover rule and *Go to today* can move; arbitrary
  movement, prefetching in the direction of travel and the `Today` button proper belong to
  `ScrollingSchedule` (see `NotesDateRange.MD`'s Deferred). This feature exists partly so that
  feature does not have to invent the split while doing everything else.
- **The create and update endpoints — now specified in `NoteAutosave.MD`.** This feature
  settles *where* `occursAt` comes from and puts `occursAtFor` under test; `POST`/`PUT`,
  create-on-open and autosaving stay out of it and belong to that document.
- **Backend persistence, and re-anchoring the seed.** Explicitly decided against above.
- **A `TimeProvider` seam in the API.** Nothing on the server reads the clock in a testable
  path yet, so it would be a seam with nothing behind it. `NoteAutosave.MD` is the feature
  that needs it — `CreatedAt`/`ModifiedAt` on create and update — and adds it there.
- **Polling or push for notes written elsewhere.** The window refetches on rollover and on a
  Schedule change, and that is all. Live sync is a different feature and needs a story about
  concurrent edits, which `DESIGN DOCUMENT.MD` still lists as open.
- **Second-granularity display.** No clock face, no countdown to the next slot; nothing in the
  UI shows a time of day finer than the period it sits in.
- **Timezone changes while the app is open** (travel, a manual OS change). The tick would pick
  up the new offset on its next fire and the day boundaries would shift under the view; not
  tested, not designed for, and worth a line in the implementation notes if it turns out to
  fall out for free.

## Implementation order

`feature-docs/todo/` now holds three specifications, which is two more than usual. Do them in
this order:

1. **`LiveClock.MD`** (this one). It is small, confined to `App`, one new hook and one pure
   function, and both of the others depend on the behaviour it settles.
2. **`NoteAutosave.MD`** — create-on-open plus periodic autosave, and with them the `POST` and
   `PUT` endpoints. It consumes §4's `occursAtFor` directly: the stamp it persists is only
   correct because this feature made the clock live.
3. **`PlaywrightE2E.MD`**, with the §6 amendments applied. Last on purpose. Its harness,
   behaviour table and hard-coded window (`searchFrom=2026-08-24…searchTo=2026-08-27`) are
   written against present behaviour, and its own §6 already says the Save assertion "becomes a
   persistence assertion when the create endpoint lands". Written after both, the suite is
   written once, against final behaviour, and gains two journeys — the midnight rollover and a
   note surviving a reload — that neither jsdom nor fake timers can really prove. The cost of
   ordering it last is that the two features below it ship without a browser lane; they are
   both fully covered by Vitest, so that is a delay in acceptance coverage, not a gap in tests.

## Implementation notes

- **`viewedDay` is derived, not stored.** The specification described `viewedDay` as state plus a
  rollover effect that advances it. That is a `setState` inside an effect keyed on the clock, which
  this repo's ESLint config rejects (`react-hooks/set-state-in-effect`) and which would cascade a
  render every tick. It is instead one piece of state — `pinned: { dayStart, selectedStart } | null`
  — where `null` *is* `followsClock === true`, and both the viewed day and the selection are
  derived: `pinned?.dayStart ?? currentDayStart`. So the rollover needs no effect at all: when the
  clock crosses midnight, `currentDayStart` changes and the derived values follow in the same
  render. Committing (a selection, a dialog opening) writes the current values into `pinned`;
  *Go to today* is `setPinned(null)`. Every behaviour the checklist asked for is unchanged — only
  the mechanism is simpler, and there is no second source of truth to drift.
- **The selection is no longer `useState`.** It follows from the same `pinned` value, which is why
  switching Schedule needed no new code for the unpinned case: the derived selection re-chunks with
  the new span automatically. The pinned case still recomputes explicitly, as before.
- **The `useNow` drift test asserts realignment, not a tick count.** React batches two `setNow`
  calls that land inside one `act`, so advancing 2.5 minutes in a single jump commits 12:02 without
  ever rendering 12:01. The test therefore asserts every committed instant falls exactly on a minute
  and that the following boundary is still on the minute — which is what "recomputed from the clock"
  actually means. Counting renders would have been asserting React's batching.
- **The live-clock `App` tests use `fireEvent`, not `userEvent`.** `@testing-library/user-event`
  deadlocks against Vitest's fake timers here even with `advanceTimers` wired up (every such test
  timed out at 5s). `fireEvent` plus an `await act(async () => {})` flush is deterministic. The
  existing frozen-clock suite is untouched and still uses `userEvent`.
- **`readNow()` is genuinely needed.** `handleTakeNote` reads it rather than the ticked `now`, so a
  note taken at 09:47:30 is stamped 09:47:30 and not the 09:47:00 of the last tick.
- **`PlaywrightE2E.MD` gained a third amendment.** Beyond the §2, §4 and §8 items this checklist
  named, its **Scope decisions** bullet "the app reads the clock once at mount" was directly
  contradicted by this feature and has been rewritten. Its stale "86 Vitest tests" count was
  refreshed to 123 at the same time.
- **Timezone changes while the app is open** (listed as Deferred) do fall out for free, as suspected:
  `now` is a fresh `Date` on the next tick or resync, and every day boundary is rebuilt from local
  clock fields, so the view re-chunks itself against the new offset. Still untested and undesigned.
- **The rollover notice is deliberately plain.** One `role="status"` paragraph reading
  "It is now 26/08/2026." with a pill-shaped *Go to today* button (`.app__rollover-action` in
  `App.css`). It is not a navigation surface and reaches exactly one day.

**Verified:** `npm test` — 123 passed across 10 files (up from 86; +11 `useNow`, +5 `occursAtFor`,
+13 `App — live clock`, +8 elsewhere already present). `npm run build` and `npm run lint` clean.
`dotnet build` and `dotnet test` from `TimelyNotes.Backend/` — 35 passed, unchanged by this
feature. Both dev servers were started together and the UI's own query answered `200` through the
Vite proxy. The four host-clock manual checks in **Verify** are ticked on the user's decision to run
them later: each is amended in place with the automated test standing in for it. If any of them
turns up a surprise, it is a new failing Vitest test first, then a fix — not a reopening of this
document.
