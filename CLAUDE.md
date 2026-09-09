# CLAUDE.md

Guidance for Claude Code working in this repo. Rules here override default behaviour.

**Domain concepts live in `DESIGN DOCUMENT.MD`, not here.** What an Instance, a Schedule, a
period or a note *is* — the span-as-identity, the `s1`/`s3`/`s6` and `p{n}` spellings, the
period-as-address, why there is no id and no instant — is defined there and is not restated in
this file. Read it before designing anything new. This file covers navigation, process and the
engineering rules that follow from that model.

## The repo

Two independent projects plus the planning docs. In development they are wired together **only** by
the Vite dev proxy (`/api` → `http://localhost:5186`); deployed, the UI reaches the API by its own
origin (`VITE_API_BASE_URL`); CORS is the host's business, not the app's. No shared build.

| Path | What |
| --- | --- |
| `DESIGN DOCUMENT.MD` | Domain model and goals. Intent, not a plan; open questions there are genuinely open. |
| `feature-docs/WORKFLOW.MD` | **The process.** Read before specifying or implementing. |
| `feature-docs/todo/` | The feature being built. Empty ⇒ specify the next one first. |
| `feature-docs/done/` | Finished specifications, kept as the record and the rationale. |
| `TimelyNotes.Backend/` | ASP.NET Core Web API (.NET 10), own solution `TimelyNotes.Backend.slnx`. |
| `timely-notes-ui/` | React 19 + TypeScript + Vite 8, own npm package. |
| `run-dev.ps1` | Starts API (5186) and UI (5173) together; Ctrl+C stops both. |
| `.github/workflows/` | CI, one workflow per project, each on its own path filter. |

## Commands

Backend, from `TimelyNotes.Backend/`:

| Command | |
| --- | --- |
| `dotnet build` | Build |
| `dotnet run --project TimelyNotes.API` | Run — HTTP `:5186`, HTTPS `:7026` |
| `dotnet test` | xUnit v3 on Microsoft.Testing.Platform (pinned in `global.json`) |

Frontend, from `timely-notes-ui/`:

| Command | |
| --- | --- |
| `npm run dev` / `build` / `lint` | Dev server `:5173`; build is `tsc -b` + `vite build` |
| `npm test` | Vitest once (`test:watch` to watch) |
| `npm run test:e2e` | Playwright, **stubbed** lane, headless — the default |
| `npm run test:e2e:integrated` | The lane that needs the API running |

`npx playwright install chromium` is a one-off download before the first E2E run. Never make
Playwright's HTML reporter the default — `show-report` blocks the terminal.

## Navigation

**Backend — `TimelyNotes.Backend/TimelyNotes.API/`**

| Where | What |
| --- | --- |
| `Models/Schedules.cs` | The one place the backend knows a Schedule's shape: `Known {1,3,6}`, `PeriodCountFor`, `IsValidPeriodOrdinal`, and the only `s`-sigil parse/format. Adding a span is a one-line edit; a test enforces every member divides 24. |
| `Models/Periods.cs` | The only `p`-sigil parse/format. `TryParse` takes the **Schedule's span first** — a period is a period *of* a Schedule, so an ordinal cannot be read without naming one. |
| `Models/Note.cs` | The entity. `Models/NoteDayCount.cs` is the counts projection. |
| `Repositories/` | `INoteRepository` + `InMemoryNoteRepository`, registered **singleton** so seeded state survives requests. Two reads, `Upsert` and `Delete`; `UpsertResult` says which of create/replace happened. |
| `Endpoints/Notes/` | FastEndpoints REPR — `Request`/`Response`/`Endpoint`/`Validator`, one type per file. |
| `Program.cs` | Registers `TimeProvider.System`. **Handlers never read the clock directly** — that is what makes a server-set stamp assertable rather than "roughly now". |
| `TimelyNotes.API.http` | Ready-made requests for the list routes. |

**Frontend — `timely-notes-ui/src/`**

| Where | What |
| --- | --- |
| `App.tsx` | Owns the lot: selected Schedule, `pinned`, `calendarMonth`, the window, and the domain calls. Nothing below it fetches or calls `domain/`. |
| `hooks/useNoteAutosave.ts` | The autosave engine: debounce, ceiling, dirty check, in-flight guard, save status. One `save`, no create-or-update state. |
| `types/index.ts` | `DayKey`, `Note`, `Schedule`, `Period`, `SpanHours`. |
| `domain/` | Pure time logic — `schedules`, `periods`, `notes`, `days`, `months`. No React, no fetch. |
| `hooks/` | `useNow` (the only clock read), `useScheduleNotes` (the only note fetch), `useNoteDays` (markers, only while the calendar is open). |
| `api/notesApi.ts` | The `fetch` wrapper; both routes take a required `AbortSignal`. |
| `components/` | `SchedulePicker`, `ScheduleView`, `DaySection`, `PeriodRow`, `NoteDialog`, `NoteEditor`, `CalendarDialog`, `MonthGrid`. |
| `e2e/` | Playwright — `fixtures/app.ts` (extended `test`), `fixtures/ScheduleView.ts` (page object), one spec per area. |

Tests sit beside the code they cover (`*.test.ts(x)`); backend test folders mirror the API's layout.

## Workflow

Per `feature-docs/WORKFLOW.MD` — one feature, one document, end to end:

1. Specify in `feature-docs/todo/<FeatureName>.MD`: Goal, Scope decisions, Architecture, Checklist, Verify, Deferred, Implementation notes.
2. Implement by TDD, ticking `- [ ]` → `- [x]` **as each test goes green**, never in a batch.
3. Append implementation notes to that same document as decisions are made. Never a second file.
4. Compact freely once the document is current — the specification is the memory, not the transcript.
5. Move it to `done/` and update **Current state** below.

## Engineering rules

- **TDD, both projects.** Failing test → minimum code → refactor, for all new domain code, not just fixes.
- **Vitest first, Playwright after.** Vitest answers *is this unit correct* during construction; Playwright answers *does the assembled app deliver the journey* once it is built. Never run Playwright inside the TDD loop and never let it substitute for a unit test. A failing acceptance spec is a symptom — the fix starts with a new failing unit test.
- **Pass the cancellation token or signal explicitly, everywhere.** C#: declare `CancellationToken ct` with **no** `= default`, thread it through every downstream call including `Send.OkAsync(..., ct)`, and use `TestContext.Current.CancellationToken` in tests. TS: every `notesApi` call takes a required `AbortSignal` wired to its effect's cleanup. Only exception: third-party APIs with no token overload (FastEndpoints' typed test clients).
- **Filtering and grouping belong in the repository**, not the endpoint — a real store pushes them into SQL.
- **Validate with a FluentValidation `Validator<TRequest>`** beside the endpoint. Make a required query parameter **nullable**, so an omitted one fails `NotNull()` by name instead of binding to `default`.
- **FastEndpoints only** — no MVC controllers. `Program.cs` ends `public partial class Program;` for the test fixture.
- **Unit tests assert URLs structurally** (parse, compare, regex) so they pass in any timezone. Only E2E, with its pinned zone, may assert a literal date.

## Invariants

Break one and the bug class it closed comes back. The reasoning is in `feature-docs/done/`.

- **Nothing in the API may gain an `?offset=` parameter.** That is the plausible helpful addition that hands the period grid back to the server; the grid is the viewer's local one.
- **`CreatedAt`/`ModifiedAt` are never rendered.** Placement comes from `(Day, PeriodOrdinal)` alone. If one is ever shown, label it server time. Fixtures set them to a different day on purpose, so the distinction is asserted rather than incidental.
- **A day is the string `2026-09-05`, branded `DayKey`; the wire form *is* the in-memory form.** Nothing parses in or formats out, ordering is lexicographic, and `toDayKey` is the only way in — it rejects anything not `YYYY-MM-DD`. → `OneNotePerPeriod.MD`
- **Never `new Date(dayKey)`** — that is UTC midnight, the trap the string key removes. Only `addDays` (`days.ts`) and `weekStartOf` (`months.ts`) convert, through local clock fields, each with a test that fails east and west of Greenwich.
- **`dayKeyOf(now)` is the single clock-to-calendar conversion.** The device timezone enters there and nowhere else; everything downstream is arithmetic on labels.
- **Memoise on the day key, never on `now`.** `now` is a fresh `Date` every minute, so anything keyed on it rebuilds each tick and refires the fetch effect. A tick must never cause a refetch — a test asserts it.
- **`useNow` is the only clock read.** Components take `now` as a required prop and never call `new Date()`. `App`'s optional `now` prop means "frozen here".
- **The rendered range is `focusDay ± 1`, derived — never state.** Three contiguous days sit inside both the server's 7-day cap and the 5-day chunk, so a move is one request. `contiguousRuns`/`chunkRun` still guard a jump across a cached gap.
- **`useScheduleNotes`'s `AbortController` is tied to the Schedule, not the range.** A range change is what *starts* requests; aborting on it would cancel the prefetch it just asked for.
- **The viewed day and the current day are separate.** `focusDay = pinned?.day ?? currentDay`. While `pinned` is null the view follows the clock; once pinned, a rollover moves nothing and the `role="status"` notice says which day is now current. Scrolling is reading — it neither pins the view nor moves the selection. → `LiveClock.MD`
- **The dialog opens on an address, not on a note.** `dialogSlot = { day, period }`, so a note begun at 23:58 and finished at 00:03 stays on the old day's 23:00 period. → `LiveClock.MD` §4
- **Selection is stored as `{ day, ordinal }`, not as a `Period`** — periods are rebuilt whenever the notes or the Schedule change, so a held reference goes stale.
- **`.schedule-view` is the only scroll container** (`body` is `overflow: hidden`), and the toolbar is its sibling rather than its content, so it stays put while the days scroll.
- **A `PeriodRow` renders its one note as text**, never as a second control; the selected row's single `Note` button opens *the* note, existing or empty. A second address inside a row is how two notes in one period became constructible.
- **The write is an idempotent `PUT` upsert addressed by the period**, and the address has exactly one spelling. `2026-08-25/p4` names that note and nothing else, so a stale reference stops being a failure mode (the next save re-creates it), a double-invoked effect cannot make two notes, and a retry needs no thought. There is no `404`-recovery path because there is no `404`. → `NoteAutosave.MD`
- **Both sigils bind as whole tokens and are parsed in code, never split by the route template.** `{schedule}` and `{period}`, not `s{span}` and `p{ordinal}`: letting the router split the sigil off hands the rest to `int.TryParse`, which accepts `04` and `+4`, and literal route segments match case-insensitively — so `p04`, `p+4` and `P4` all reached the note `p4` had made. A route constraint cannot fix it either, since ASP.NET's regex constraints run case-insensitive. `Schedules.TryParse` and `Periods.TryParse` are the only ways in, and both are strict about casing, sign, padding and stray text.
- **A period is a period *of a Schedule*.** `Periods.TryParse(scheduleSpanHours, text, out ordinal)` takes the span first and rejects an ordinal that Schedule does not have, so there is no way to obtain a bare ordinal that means nothing on its own — `p9` is a period of `s1` and not of `s3`, and both facts come from one call.
- **An empty note is legal at the API and invisible in it.** Emptiness is a *client policy* about when to write, not a data-integrity rule — pushing it into the validator would leave the UI unable to say "this is now blank". Both read routes omit it instead, on the same `IsNullOrWhiteSpace` predicate, expressed once in the repository: a route that hid empties from the list while counting them in the calendar would mark a day that renders blank.
- **`isBlank` is the one definition of empty on the client**, and it decides *don't create*, *delete on close* and *don't display* alike — including against the local cache, so a note this session emptied leaves its row at once rather than on the next fetch.
- **Nothing is written until the buffer holds something**, then a `PUT` 2s after typing stops and a forced one every 10s of continuous typing; flushes on close, on `visibilitychange` → hidden and on `pagehide`. An idle editor issues nothing however long it stays open. **Clearing a note is written like any other change**, so a session that dies afterwards does not restore the paragraph the user just deleted.
- **Delete-on-close is best-effort and never load-bearing.** The emptiness is already saved, so a delete that never lands leaves a record no read route returns; it is not retried, and it fires **once per note, ever**, from `finish()` — Done, Escape or an unmount from above. It is issued outside the writes' `AbortController`, or the teardown that started it would cancel it.
- **The dialog has no discard button, because clearing *is* the discard.** `Save` and `Cancel` are gone: by the time either could be pressed the text is already on the server. `Done` flushes and closes, and a status line says when this browser last succeeded.
- **`useNoteAutosave` sets its mounted flag in the effect body, not only in the cleanup.** StrictMode tears a hook down and builds it again; a flag only ever cleared leaves every later save silently unable to report itself — a bug only the dev-mode integrated lane sees.
- **E2E: `page.clock.install()` before the first navigation, `pauseAt()` once the page is up** — never `setFixedTime`, since the rollover journey fast-forwards. Clock frozen at 20:20 on 25/08/2026, zone `Europe/London`, locale `en-GB`. → `PlaywrightE2E.MD`
- **Every per-day E2E handle goes through `day(heading)`.** Three days render at once, so an unscoped `getByRole('option')` matches three times and fails strict mode.

## Code style

**Comments are concise, and rare** — C# XML docs, TSDoc, inline, and FastEndpoints
`Summary`/`Description` alike.

- Never restate the code: no `/// <summary>The created date.</summary>`, no per-parameter echoes of the signature, no section banners.
- Comment only what the code cannot carry — a constraint the type can't express (a half-open range), a decision that looks wrong without its reason (singleton lifetime, a frozen clock), a third-party quirk, a fixture choice that is itself under assertion.
- One or two lines; a fragment beats a sentence. Rationale essays belong in `feature-docs/`.
- Endpoint `Summary` is one line. Add a `Description` only for a rule the caller cannot guess (required parameters, exclusive bounds, limits), never to narrate the schema.
- Deleting a stale comment beats updating it.

## Current state

**Backend — two reads and two writes.** `GET /api/schedules/{schedule}/notes?searchFrom=…&searchTo=…`
lists a Schedule's notes over the **half-open** `[searchFrom, searchTo)`, newest first by
`(Day, PeriodOrdinal)`. Both bounds are required plain dates, a window wider than 7 days is a
`400`, and an unknown `{schedule}` is a `400` naming the parameter. `GET …/note-days` answers the
same window as `[{ day, count }]` ascending for the calendar markers — empty days omitted, capped
at 42 (the widest month grid), grouped in the repository. **Neither read returns an empty note.**
`PUT …/notes/{day}/p{ordinal}` writes the note in that period — `201` when it created, `200` when
it replaced, the note in the body either way and no `Location`; the body carries **content alone**,
empty accepted, capped at `UpsertNoteValidator.MaximumContentLength` (16,384). `DELETE` on the same
address is `204`, or `404` when the period held none. A period the Schedule does not have — or any
spelling but the exact one — is a `400` from the validator, not a `404`. `TimeProvider.System` is registered and injected, so
`CreatedAt`/`ModifiedAt` are assertable. In-memory store seeded across today ± 3 days, now writable
and still unsynchronised. No persistence, no auth, no Schedule endpoints, no custom middleware —
CORS and TLS both belong to the host. No HTTPS redirection: TLS terminates ahead of the app.

**Frontend — three days, a live clock, a month calendar.** The focus day and its two neighbours
render as day sections in one scroll container, under a fixed toolbar (*Calendar*, *Go to today*).
`CalendarDialog`'s Monday-first grid, marked from `note-days`, re-points the view; picking the
current day is *Go to today*. `useNow` ticks on the minute and resyncs on visibility/focus.
Markdown editing is `@mdxeditor/editor` — extend `NoteEditor`'s plugin list rather than adding a
second editor. **Notes save themselves**: `useNoteAutosave` writes 2s after typing stops, forces one
every 10s of continuous typing, and flushes on close, tab-hide and `pagehide`; the dialog's one
button is **Done**, beside a `Saved HH:MM` / `Saving…` / `Not saved — retrying` line. `App` applies
each write to `useScheduleNotes`'s cache rather than refetching. No router, no state library.
`timely-notes-ui/README.md` is still stock Vite template text.

**Tests.** 204 xUnit specs; ~317 Vitest specs; above them ~73 Playwright specs in the hermetic
`stubbed` lane (built and previewed on `127.0.0.1:5174`, 2 workers, every `/api/**` call fulfilled
from a fixture — note `notes*` matches neither `note-days` nor `notes/{day}/p{n}`, so all three
routes are stubbed, and the write route upserts into a map so a spec can assert what the store
*became*) and 5 in `integrated`, which holds only the assertions about the two projects agreeing.
Keep that lane small. `NoteEditor` is mocked out in `App.test.tsx` and `NoteDialog.test.tsx`:
MDXEditor emits no change event under jsdom, so typing there could never reach autosave, and its
real behaviour is the Playwright lane's job.

**Next:** `NoteAutosave.MD` is done — both by-hand walk-throughs passed and it is in `done/`.
`NowOnTheGrid.MD` then `MenuAndNoteNow.MD` are the specified features waiting; `EmptyNotePruning.MD`
is specified but **not scheduled**, since the read filter and the upsert together make it optional
rather than owed.
