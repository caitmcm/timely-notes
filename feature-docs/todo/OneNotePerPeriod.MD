# One note per period

## Goal

**A period holds at most one note, and the period *is* the note's identity — named as a period,
not as an instant.**

A note is addressed by three things and nothing else: the Schedule it belongs to, the calendar
day it sits on, and **which period of that day** it is. On `s3` the day has eight periods, so
09:00–12:00 is `p4`; on `s1` it is `p10`; on `s6`, `p2`. The address of a note is
`(ScheduleShortName, Day, Ordinal)`, all three immutable, and the URL says it outright:

```
/api/schedules/s3/notes/2026-09-05/p4
```

There is no surrogate id and **no `OccursAt`**. A note has no instant, because an instant was
never what placed it — the period was, and the instant was a proxy for the period that could
disagree with it.

**Today's behaviour is a defect, and it has two halves.** `PeriodRow` renders a *list* of notes
and `assignNotes` buckets as many as it is given, so pressing **Note** twice in the same hour
makes two notes and the row grows a second button. Underneath that sits the reason the
duplicate is even constructible: **`assignNotes` places a note by containment
(`start <= occursAt < end`) while a row's button addresses `period.start`.** Two different
rules for the same relationship. A stored `s3` note at 10:00 renders in the 09:00–12:00 row
while being addressed at 10:00, so the row's button finds nothing at 09:00, creates, and the
period now holds two notes — one of which the UI can neither show nor delete, because no
address it can construct points at 10:00.

Naming the period directly collapses those two rules into one. The row is `p4`, the button
addresses `p4`, the note comes back as `p4`. There is no second address inside a row, so there
is nothing to disagree about and nothing to validate: the unreachable note is not prevented,
it is **unspellable**.

The prize is that every later write is idempotent for free. `PUT` to a period either creates
the note there or replaces its content; sending it twice is the same as sending it once; a note
the server has dropped is re-created at the address the client already knew. No client-minted
`Guid`, no create-versus-update branch, no stale id. `NoteAutosave.MD` is built on top of this
and is much smaller because of it.

**This feature is read-side only.** It changes the model, the seed, the two `GET` routes and the
schedule view. It adds no write endpoints — `NoteAutosave.MD` does that next, and depends on
this being in `done/` first.

Following TDD (per `CLAUDE.md`): a failing test before each piece of code, xUnit v3 on the
backend and Vitest + React Testing Library on the frontend, with the Playwright specs extended
once each slice is implemented.

## Scope decisions

### The rule

- **This is a correction, not a new direction.** The app is an hourly diary: a slot is a place
  you return to and add to. A row that holds one thing needs no list, no per-note timestamp and
  no way to tell two entries apart — all of which exist today only because the duplicate was
  possible. Removing them is the bulk of this work.
- **The consequence to be aware of while using it:** two separate thoughts in the same hour are
  one note, and on an `s6` Schedule that is a single note per six-hour block. That is the
  intended shape, and the Schedule picker is how a user chooses how fine the grain is.
- **One button, on the selected period.** The selected row carries a single button that opens
  **the** note for that period — the existing one if there is one, an empty one if not. It does
  not branch, and neither does the label: there is only ever one note it could mean. A row's
  excerpt is text, not a second control, so a period can never present two ways in.

### The address

- **The ordinal is 1-based and spelled `p{n}`.** `p1` is midnight to the first boundary,
  `p{24 / spanHours}` is the last block of the day. A bare integer in a path segment says
  nothing about what it counts and reads as an id; `p4` is self-describing in a log line, in
  the `.http` file and in a test name. 1-based because the user's sentence is "the fourth
  period", and the only arithmetic that touches it lives in one function per project.
- **The day is a plain calendar date, `2026-09-05` — no time, no offset.** That is the whole
  point: a date has no instant to be reinterpreted. The browser sends the day it is showing,
  the server stores that day, and it comes back the same day in Auckland as in London.
- **`OccursAt` is deleted, not moved.** It was the slot *expressed as an instant*, and the
  expression is what caused the defect. Keeping a derived `OccursAt` beside the ordinal would
  mean two representations of one fact and a way for them to drift.
- **`occursAtFor` goes, and this overturns `LiveClock.MD` §4.** That feature made a new note's
  `occursAt` the live instant (`09:47`) rather than the slot start, so that several notes in one
  period could be told apart. There is no longer an instant to stamp and nothing to tell apart.
- **`Note.Id` is removed entirely.** A surrogate key nothing addresses is dead weight, and worse
  than dead weight: it is an invitation for the next endpoint to address by it and quietly
  reintroduce two notes in one period. The natural key is the only key.
- **Alignment validation is gone before it was ever written.** An earlier draft of this document
  made the backend learn `Schedules.SpanHoursFor` so it could `400` an `OccursAt` that was not
  exactly on a boundary, and carried a scope decision about the same instant being aligned or
  not depending on the offset it was spelled with. All of that was the cost of addressing by
  instant. The backend still needs one small fact about a Schedule — **how many periods a day
  has** — to reject `p9` on `s3`, and that is a bound check, not a timezone question.
- **The `400`s the reads should have had all along.** An unknown Schedule short name and an
  out-of-range ordinal are both rejected by name. `Schedules.PeriodCountFor(shortName)` in
  `Models/` is the one place the backend knows a Schedule's shape — a step toward the Schedule
  endpoints `DESIGN DOCUMENT.MD` wants, taken because the address needs it, not for its own
  sake.

### Time, and where it is allowed to exist

- **A day is the string `2026-09-05` everywhere — the wire format *is* the in-memory format.**
  `days.ts` currently keys a day by epoch ms of local midnight, which is the same mistake as
  `OccursAt` one layer down: an instant standing in for a calendar fact. The same calendar day
  is a *different number* in a different timezone, so the value is not the stable device-relative
  label it is meant to be, and every boundary invites a `new Date(...)` or a `toISOString()`. A
  `DayKey` branded string carries no such invitation. Nothing is parsed on the way in and nothing
  formatted on the way out; equality and ordering are lexicographic and timezone-independent,
  which is exactly what a device-relative label should be. It also reads: `2026-09-05` in a cache
  dump, in `data-day` and in a Playwright selector, where an epoch does not.
- **`new Date('2026-09-05')` parses as UTC midnight, and that is why the string key is worth the
  churn.** Under an epoch-ms key that trap sits at every boundary, guarded by convention and a
  test. Under a string key there are no boundaries to guard: the only code that turns a `DayKey`
  into a `Date` is the calendar arithmetic — `addDays` in `days.ts`, and `monthStartOf`,
  `addMonths` and `weekStartOf` in `months.ts`. Four functions, two files, each with a test that
  fails under a negative-offset timezone.
- **The one legitimate clock-to-calendar conversion is `dayKeyOf(now)`.** That is where the
  device's timezone enters the app, and the only place it should: `useNow` reads the wall clock,
  `dayKeyOf` says what calendar day that is, and `ordinalOf` says which period. Everything
  downstream is arithmetic on labels. `useNow` remains the only clock read in the app.
- **`Period` carries no `Date` at all.** `start`/`end` existed to render `09:00 – 12:00` and to
  answer "is this the current period", and both are arithmetic on the ordinal:
  `(ordinal - 1) * spanHours` gives the label, and current is
  `day === dayKeyOf(now) && ordinal === ordinalOf(now)`. So a `Period` is `{ ordinal, note }`,
  its label derived, and no instant survives anywhere in the rendered grid.
- **`CreatedAt`/`ModifiedAt` are server-side stamps, in the server's zone — UTC in practice —
  and this feature does not render either.** They are the audit fact the old live-instant
  `occursAt` was conflating with placement: "this was written at 09:47" is true of the *server's*
  clock, not the viewer's calendar. If one is ever displayed it is labelled as server time rather
  than quietly reinterpreted into the viewer's zone; reinterpreting it would put an instant back
  into exactly the part of the model this feature clears. Placement comes from the period, and
  nothing else.
- **DST stops mattering to the key, and that is a real gain.** The grid is still
  `24 / spanHours` periods regardless of a 23- or 25-hour day. On a spring-forward day the local
  hour that never happens means `s1`'s `p2` is never the *current* period — it stays addressable
  and readable. On an autumn day that hour happens twice, so `p2` is current twice and both
  writings reach the same note. Under the instant key these were reachability failures; here they
  are display trivia, and are recorded as such rather than handled.

### The rest

- **Both read routes become date-ranged, and this is a contract change to
  `NotesDateRange.MD`.** A note has no instant, so `searchFrom`/`searchTo` can no longer be
  instants: they are `DateOnly` values, still **half-open** `[searchFrom, searchTo)`, still
  capped at 7 days for `notes` and 42 for `note-days`. This deletes machinery rather than
  adding it — the offset-carrying serialisation in `notesApi.ts`, the `ToOffset` grouping in
  `InMemoryNoteRepository`, and the "grouped in `searchFrom`'s offset" clause in the
  `note-days` description all exist to reconcile instants with local days, and there is nothing
  left to reconcile. `note-days` becomes a plain group-by-day, and returns a `DateOnly` too.
- **Ordering is by `(Day, Ordinal)` descending — still newest first**, and now exactly rather
  than by a proxy instant. Two notes in one day sort by their period, which is what the reader
  means by newest. Client-side the same ordering is a lexicographic string compare then a number
  compare, correct only because the date format is fixed-width ISO — so it is asserted, not
  assumed.
- **The row shows the period's label and the note's excerpt, and nothing else.** `PeriodRow`
  loses its `.map` and its per-note `formatTimeOfDay` — the excerpt becomes plain text sitting
  beside the period's own label, which was always the only time that mattered on that row.
- **Placement stops being a search.** `assignNotes` matched a note against every period by
  containment; it now matches on `(day, ordinal)`, which is a lookup — and with `Period` holding
  no instants, containment is not expressible there at all.
- **A future day's periods are addressable exactly like a past day's.** Nothing here changes
  which slots are writable — the design document's *future notes are a briefing for your future
  self* still holds, and a future period is just an address nothing has been written to yet.

### The assumption this key makes explicit

**A Schedule has no timezone, and the period grid is the viewer's local one.** Under an
instant-addressed note that assumption was hidden: the server held an absolute instant whose
meaning depended on a grid it did not own, so flying to Auckland silently re-bucketed
yesterday's notes and could put a row's button on a different note than the row displayed.

Storing `(day, ordinal)` does not resolve the question, it **relocates it into the open**: the
record is now explicitly a claim about the writer's local calendar, and it stays that claim
wherever it is later read. Your 09:00–12:00 note remains the fourth period of that date, in
Auckland as in London. For a single user with one calendar this is not merely adequate, it is
what they meant. Anyone adding multi-user or multi-timezone support should read this paragraph
before touching the key: the answer there is a Schedule that carries its own IANA timezone, and
`DESIGN DOCUMENT.MD` has not specified Schedule endpoints yet.

### The invariant to protect

**The server has no timezone.** It stores a date and an integer, and reads a clock only for the
two audit stamps. No read or write route takes an offset, and nothing in the API needs to know
where the user is. This belongs in `CLAUDE.md` in those words, because the plausible future
mistake is a helpful `?offset=` parameter added to a read route — which would hand the grid back
to the server and reintroduce everything above.

## Architecture

### Backend — `TimelyNotes.Backend/TimelyNotes.API`

- `Models/Note.cs` — `Id` and `OccursAt` removed; `Day` (`DateOnly`) and `Ordinal` (`int`)
  added. The remaining fields are the key (`ScheduleShortName`, `Day`, `Ordinal`), the content,
  and the two audit stamps.
- `Models/Schedules.cs` — new. `PeriodCountFor(shortName)`, `IsKnown(shortName)` and
  `IsValidOrdinal(shortName, ordinal)`: the one place the backend knows a Schedule's shape.
- `Repositories/INoteRepository.cs` / `InMemoryNoteRepository.cs` — both reads take
  `DateOnly searchFrom, DateOnly searchTo`; `GetBySchedule` orders by `(Day, Ordinal)`
  descending; `GetDayCountsBySchedule` groups on `Day` with no offset conversion.
  `NoteDayCount.Day` becomes `DateOnly`.
- `Endpoints/Notes/` — both requests take `DateOnly?` bounds; both validators lose the
  instant-format messages, keep the caps in days, and gain the unknown-Schedule rejection.
  `NoteResponse` drops `id` and `occursAt`, gains `day` and `ordinal`.
- No new endpoints.

### Frontend — `timely-notes-ui/src`

- `types/index.ts` — `DayKey` (a branded `string`, `YYYY-MM-DD`) joins the shared types. `Note`
  loses `id` and `occursAt`, gains `day: DayKey` and `ordinal: number`. `Period` becomes
  `{ ordinal: number; note: Note | null }` — no `start`, no `end`, no `Date`.
- `domain/days.ts` — the day key becomes `DayKey` throughout: `dayStartOf` becomes
  `dayKeyOf(at: Date): DayKey`, the **only** clock-to-calendar conversion in the app; `addDays`,
  `eachDay`, `contiguousRuns` and `chunkRun` take and return `DayKey`s; the instant-keyed
  `dayKeyOf(note.occursAt)` goes, there being no instant to key from.
- `domain/months.ts` — the same retype. `monthStartOf`, `addMonths`, `weekStartOf`, `monthGrid`
  and `isInMonth` move to `DayKey`; those three plus `days.ts`'s `addDays` are the only functions
  in the app that construct a `Date` from a day key, and each carries the local-fields rule.
- `domain/periods.ts` — `buildPeriods(spanHours)` returns numbered, `Date`-free periods and no
  longer takes a day; `assignNotes` matches on `(day, ordinal)`; `formatPeriodLabel` and
  `formatPeriodStart` derive from the ordinal; `ordinalOf(now, spanHours)` replaces
  `isCurrentPeriod`'s containment test, and `findCurrentPeriod` follows.
- `domain/notes.ts` — `occursAtFor` removed; callers pass the period.
- `api/notesApi.ts` — `toOffsetIso` goes with nothing to replace it: a `DayKey` is already the
  wire form, so both bounds and the parsed `day` pass through untouched. `toNote` reads `day`
  and `ordinal`.
- `components/PeriodRow.tsx` — one note, no list, no per-note time. React keys come from the
  ordinal, which is what they should always have been here.
- `components/ScheduleView.tsx`, `DaySection.tsx`, `MonthGrid.tsx`, `CalendarDialog.tsx` — the
  same retype at their prop boundaries; `data-day` becomes the readable `2026-09-05`.
- `App.tsx` — the dialog's note state is the period's note or `null`, and the slot it opens on
  is `(day, ordinal)`.

## Checklist

### 1. The Schedule's shape, in the backend

- [ ] Test first: `Schedules.PeriodCountFor` answers 24 / 8 / 4 for `s1` / `s3` / `s6`, and
      rejects an unknown short name rather than defaulting.
- [ ] Test first: `Schedules.IsValidOrdinal` accepts 1 and the count, rejects 0, the count + 1
      and negatives — the boundaries, since a 1-based off-by-one is the live risk here.

### 2. The key in the backend model

- [ ] Test first: a note is identified by `(ScheduleShortName, Day, Ordinal)` — the repository's
      seed is the only writer today, so this is asserted as an invariant over `SeedNotes()`
      rather than through a write path that does not exist yet.
- [ ] Replace `Id` and `OccursAt` on `Note` with `Day` and `Ordinal`; update every test that
      names them.
- [ ] `NoteResponse` drops `id`/`occursAt` and gains `day`/`ordinal`.

### 3. The seed

- [ ] Test first: every seeded note's ordinal is valid for its Schedule, and no Schedule has two
      notes in one `(day, ordinal)`. Both assertions run over the real seed, so a careless
      future addition fails the build.
- [ ] Re-express the seed as `(dayOffset, ordinal)` — `at(1, 9.5)` had no period to belong to
      and becomes an ordinal like the rest. Keep the spread across today ± 3 days and keep at
      least one Schedule with two notes on the same *day* in different periods, so the day view
      still shows more than one row filled.

### 4. The reads

- [ ] Test first, repository: `GetBySchedule` filters `[searchFrom, searchTo)` on `Day` — a note
      on `searchTo` is excluded, one on `searchFrom` is included — and orders by
      `(Day, Ordinal)` descending, asserted with two notes on one day so the ordinal tiebreak is
      under test rather than incidental.
- [ ] Test first, repository: `GetDayCountsBySchedule` groups on `Day` with no offset in sight,
      ascending, empty days omitted.
- [ ] Both requests take `DateOnly?` bounds; both validators keep `NotNull`, the half-open
      ordering rule and the 7-day / 42-day caps, with messages naming the `2026-09-05` format.
- [ ] Test first, endpoints: an unknown Schedule short name is a `400` naming the parameter, on
      both routes. This is behaviour the reads should always have had; the new `Schedules.IsKnown`
      is what makes it a one-liner.
- [ ] Endpoint `Summary`/`Description` updated: half-open day range, the caps, and **no** offset
      clause — the sentence about grouping in `searchFrom`'s offset describes machinery that no
      longer exists.
- [ ] `TimelyNotes.API.http` requests updated to the date form.
- [ ] The existing range, boundary and rejection tests still hold in their new shape — this is
      the contract change, and that suite is what says it landed intact.

### 5. The frontend day key

- [ ] Test first in `days.test.ts`: `dayKeyOf(new Date(2026, 8, 5, 23, 30))` is `'2026-09-05'`,
      asserted under a negative-offset timezone as well as a positive one. This is the one
      clock-to-calendar conversion in the app and the one place a `toISOString`-shaped slip
      would land on the wrong day.
- [ ] `DayKey` in `types/`, branded — so a bare string cannot be passed by accident, and a
      `DayKey` cannot be handed to arithmetic expecting a number.
- [ ] Retype `days.ts`: `dayStartOf` becomes `dayKeyOf`, and `addDays`, `eachDay`,
      `contiguousRuns` and `chunkRun` follow. Tests: `addDays` across a DST boundary, a month
      end and a year end; `contiguousRuns` and `chunkRun` unchanged in behaviour but keyed by
      string. Assert the sort is lexicographic and correct — it is only correct because the
      format is fixed-width ISO, so it is stated rather than assumed.
- [ ] `addDays` is the only `Date` construction left in `days.ts`; a comment says so, since the
      whole point of the type is that nothing else needs one.
- [ ] Retype `months.ts` the same way, keeping its existing tests and the 31 March − 1 month
      overflow case the code already guards.
- [ ] Remove the instant-keyed `dayKeyOf(note.occursAt)` — there is no instant to key from.

### 6. The frontend note and period

- [ ] `Note` loses `id`/`occursAt` and gains `day: DayKey`/`ordinal` in `types/`; `toNote`
      follows, and a test asserts `day` is carried through **verbatim** — no `Date` round-trip
      anywhere in the client.
- [ ] `notesApi` sends both bounds as the `DayKey`s it was given; `toOffsetIso` goes. The URL
      tests stay **structural** per `CLAUDE.md`, and one runs under a non-UK timezone to assert
      the request is *identical* — there is no longer anything in it a timezone could change.
- [ ] Test first in `periods.test.ts`: `buildPeriods(spanHours)` returns `24 / spanHours`
      periods numbered from 1, carrying no `Date`; `formatPeriodLabel` gives `09:00 – 12:00` for
      `s3`'s `p4` and `21:00 – 00:00` for its last period, so the midnight wrap is asserted
      rather than incidental.
- [ ] Test first: `ordinalOf(now, spanHours)` answers 1 at 00:00, the count at 23:59, and the
      right side of each boundary — for all three Schedules. The current period is then
      `day === dayKeyOf(now) && ordinal === ordinalOf(now, spanHours)`, and `findCurrentPeriod`
      is that comparison rather than a containment scan.
- [ ] Test first in `periods.test.ts`: `assignNotes` gives each period `note: Note | null`,
      matched on `(day, ordinal)`. A stray second note for one ordinal is a state the type
      cannot hold; assert the last one wins and that nothing throws, so bad data degrades rather
      than crashes.
- [ ] `Period.notes: Note[]` becomes `Period.note: Note | null`, `Period` gains `ordinal` and
      loses `start`/`end`, and every consumer follows.
- [ ] Remove `occursAtFor` from `domain/notes.ts` and its tests. Record in the removal that this
      reverses `LiveClock.MD` §4 and why.

### 7. The row

- [ ] Test first in `PeriodRow.test.tsx`: a period with a note renders its excerpt as **text**,
      with no time-of-day prefix and no button around it; the **selected** row renders exactly
      **one** button whichever case it is in, and pressing it opens the period's note — the
      existing one when there is one, a new one when there is not; an unselected row renders no
      button at all; clicking the row still selects it.
- [ ] The row exposes **one** `onOpenNote(period)` — `onTakeNote` and the two-callback split go
      with the defect that needed them. `App` decides what opening means; the row does not.
- [ ] Rewrite `PeriodRow` accordingly; keys come from the ordinal.
- [ ] `DaySection` and `ScheduleView` tests updated for the single-note row and the `DayKey`
      props; `data-day` carries the readable date.

### 8. `App`

- [ ] Test first: `handleOpenNote(period)` passes the period's note to the dialog when there is
      one and `null` when there is not, with `(day, period.ordinal)` as the slot either way;
      nothing anywhere holds a note id or an `occursAt`; `handleTakeNote` is gone.
- [ ] The selected period is held as `(day, ordinal)` rather than a timestamp — the reason the
      old code stored a number (periods are rebuilt, so a held reference goes stale) is
      unchanged, but the stable value is now the address.
- [ ] The `LiveClock.MD` rules still hold, minus the live-instant stamp: opening the dialog
      pins the view, a rollover leaves an open dialog alone, and a tick still causes no refetch.

### 9. Acceptance specs (`e2e/`)

- [ ] `e2e/fixtures/notes.ts` — fixtures lose `id`/`occursAt`, gain `day`/`ordinal`, and no two
      share a period.
- [ ] Existing specs updated: a row's note reads as text by its excerpt, with no `09:47` prefix
      anywhere, and the opener is the selected row's single button. The page object gains one
      handle for that button and loses the per-note ones; its `data-day` handles read
      `2026-08-25` rather than an epoch.
- [ ] `api-contract.spec.ts` — the literal window assertions become dates
      (`searchFrom=2026-08-24`), and the `Pacific/Auckland` re-run now proves something sharper:
      the requests are **identical** to the `Europe/London` ones and the same days render,
      because nothing in them depends on an offset. Keep the re-run; it is the regression test
      for a `Date` creeping back into the day path.
- [ ] One new assertion, the defect stated as far as this feature can state it: selecting a
      period that already has a note and pressing its button opens **that note's content**, not
      an empty editor, and the row still shows exactly one entry. Today the button is a
      create-only *Note*, so this fails before the fix.
- [ ] The journey that closes it — type, close, reopen, same note — needs writes and belongs to
      `NoteAutosave.MD`. Noted here so it is not forgotten rather than attempted early.

### 10. Docs

- [ ] `DESIGN DOCUMENT.MD`: record that a period holds at most one note, that a note is
      identified by `(Schedule, Day, Ordinal)`, and that it has no `OccursAt` — amend the
      three-timestamp section, which is now two server-side audit stamps and a period.
- [ ] `CLAUDE.md` **Backend**: the natural key and its URL form; the date-ranged reads and the
      removal of the offset machinery; **the server has no timezone**, in those words, with the
      `?offset=` parameter named as the mistake it forbids.
- [ ] `CLAUDE.md` **Frontend**: `DayKey` as a string and why (the wire form *is* the in-memory
      form; ordering is lexicographic; the four arithmetic functions are the only place a `Date`
      is built from one); `dayKeyOf(now)` as the single clock-to-calendar conversion; `Period`
      carrying no `Date`; the single-note row; the removal of `occursAtFor` and `toOffsetIso`.
- [ ] `CLAUDE.md`: `CreatedAt`/`ModifiedAt` are server-zone stamps, are not rendered, and are
      labelled as server time if they ever are.
- [ ] `CLAUDE.md` **Current state** once green.
- [ ] Add a note to `feature-docs/done/LiveClock.MD` saying its §4 live-instant `occursAt` was
      overturned here, and by what.
- [ ] Add a note to `feature-docs/done/NotesDateRange.MD` and
      `feature-docs/done/GetNotesBySchedule.MD` saying the instant-with-offset window they
      specified is now a date window, and why the offset stopped being needed. Those documents
      are the record; they should not read as current.

## Verify

- [ ] `dotnet test` and `dotnet build` from `TimelyNotes.Backend/` — green, no new warnings.
- [ ] `npm test`, `npm run build`, `npm run lint` and `npm run test:e2e` from
      `timely-notes-ui/` — all green.
- [ ] `npm run test:e2e:integrated` — the two projects agree on the new date-range contract.
      This lane exists for exactly this kind of change and is the one that would catch a
      frontend still sending offsets.
- [ ] `grep` the frontend for `toISOString`, `getTime()` and `new Date(` outside `useNow.ts`,
      `days.ts` and `months.ts`. Anything left is either an audit stamp or a mistake; the point
      of the day key is that this grep is short and stays short.
- [ ] `./run-dev.ps1`, then in the browser:
  - [ ] Every filled row shows one excerpt, as text, with no `09:47`-style prefix.
  - [ ] The selected row has exactly one button, whether or not it holds a note, and pressing it
        opens that period's note — with its content when there is one, empty when there is not.
  - [ ] There is no way to reach a second note in one period, by any sequence of clicks.
  - [ ] Switching between `s1`, `s3` and `s6` still shows every seeded note, each in the right
        block, one per row.
  - [ ] With the browser set to a timezone west of Greenwich, every note still renders on the
        day the seed put it on, and the requests are the same ones.
- [ ] By hand through `TimelyNotes.API.http`: both read routes answer to date bounds, an unknown
      Schedule is a `400`, and no `id` or `occursAt` appears in any response body.

## Deferred

- **Every write.** `NoteAutosave.MD` adds `PUT` and `DELETE` on this key, and is the reason this
  feature exists.
- **Enforcing one-note-per-period at the store.** Nothing writes yet, so the invariant is
  asserted over the seed. The write endpoint is where it becomes structural.
- **Merging two notes that already share a period.** Cannot arise from the seed, and there is no
  other writer. If real data ever needs migrating, that is a migration, not this.
- **Rendering a Schedule's notes on another Schedule's grid.** Structurally impossible now: a
  note is `p4` of `s3`, and `s3`'s eight periods are the only grid it names. This is intended —
  one day, one Schedule, one period, one note — and is recorded here so it is not later mistaken
  for an oversight.
- **Moving a note to another slot.** Now structurally impossible rather than merely forbidden —
  the slot is the address. Worth stating plainly, because it closes the question.
- **Showing `createdAt` or `modifiedAt` anywhere.** They are server-zone stamps and this feature
  renders neither. Displaying one is a small feature of its own, and its only real requirement is
  the label that says whose clock it came from.
- **Rendering a DST day's grid differently.** The skipped and repeated local hours are display
  trivia under this key, per the scope decision above; nothing addresses them and nothing needs
  to.
- **Schedule endpoints.** `Schedules.PeriodCountFor` is the smallest thing the address needs,
  not the beginning of a Schedule API. Creating and listing Schedules is still unspecified.
- **Giving a Schedule a timezone.** The right answer to the assumption above, and it needs the
  Schedule endpoints first. Until then the grid is the viewer's, and the app is single-user in
  one timezone.
- **Migrating notes that carry an `OccursAt`.** Nothing persists, so there are none but the
  seed's, which this feature rewrites. If a real store lands first, converting an instant to
  `(day, ordinal)` is a migration to write — not a case to handle at runtime.

## Implementation notes

_Left empty at specification time — the implementing agent fills this in._
