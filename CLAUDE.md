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
| `feature-docs/INVARIANTS.MD` | The reasoning behind every rule in **Invariants** below. Read before changing one. |
| `feature-docs/todo/` | The feature being built. Empty ⇒ specify the next one first. |
| `feature-docs/done/` | Finished specifications, kept as the record and the rationale. |
| `TimelyNotes.Backend/` | ASP.NET Core Web API (.NET 10), own solution `TimelyNotes.Backend.slnx`. |
| `timely-notes-ui/` | React 19 + TypeScript + Vite 8, own npm package. |
| `run-dev.ps1` | Starts API (5186) and UI (5173) together; Ctrl+C stops both. |
| `.config/dotnet-tools.json` | `dotnet-ef` pinned and checked in. Run it as `dotnet tool run dotnet-ef`. |
| `.github/workflows/` | CI, one workflow per project, each on its own path filter. |

## Commands

Backend, from `TimelyNotes.Backend/`:

| Command | |
| --- | --- |
| `dotnet build` | Build |
| `dotnet run --project TimelyNotes.API` | Run — HTTP `:5186`, HTTPS `:7026` |
| `dotnet test` | xUnit v3 on Microsoft.Testing.Platform (pinned in `global.json`) |
| `dotnet tool run dotnet-ef database update` | Applies migrations to the Postgres store. Creates `timely_notes_dev` if absent; `database drop -f` then `update` is the reset while the schema churns. Never run at startup. |
| `dotnet tool run dotnet-ef migrations add <Name> --output-dir Data/Migrations` | From `TimelyNotes.API/`. Needs no server and no provider setting. |

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
| `Models/NoteContent.cs` | The one definition of empty, shared by both stores: `Normalise` on write, `IsReadable` on read. |
| `Repositories/` | `INoteRepository` and its **two** implementations, registered **singleton** either way. `NoteStoreRegistration` is the whole provider switch; `UpsertResult` says which of create/replace happened. |
| `Data/` | `NotesDbContext` (one table, the composite key, the column types), `NoteQueries` (both reads as `IQueryable`, so their SQL is assertable), the design-time factory and the checked-in `Migrations/`. |
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

Break one and the bug class it closed comes back. Short form here; the reasoning for every one
is in `feature-docs/INVARIANTS.MD`, and the full account is in the feature document named.

- **No `?offset=` parameter anywhere in the API.** The period grid is the viewer's local one.
- **`CreatedAt`/`ModifiedAt` are never rendered.** Placement comes from `(Day, PeriodOrdinal)` alone.
- **A day is the string `2026-09-05`, branded `DayKey`** — the wire form *is* the in-memory form, and `toDayKey` is the only way in. → `OneNotePerPeriod.MD`
- **Never `new Date(dayKey)`.** Only `addDays` (`days.ts`) and `weekStartOf` (`months.ts`) convert.
- **`dayKeyOf(now)` is the single clock-to-calendar conversion.**
- **Memoise on the day key, never on `now`.** A tick must never cause a refetch.
- **`useNow` is the only clock read.** Components take `now` as a required prop.
- **The rendered range is `focusDay ± 1`, derived — never state.**
- **`useScheduleNotes`'s `AbortController` is tied to the Schedule, not the range.**
- **The viewed day and the current day are separate.** `focusDay = pinned?.day ?? currentDay`. → `LiveClock.MD`
- **The dialog opens on an address, not on a note.** `dialogSlot = { day, period }`. → `LiveClock.MD` §4
- **Selection is stored as `{ day, ordinal }`, not as a `Period`** — a held `Period` goes stale.
- **`.schedule-view` is the only scroll container**, and the toolbar is its sibling, not its content.
- **A `PeriodRow` renders its one note as text**, never as a second control — one row, one `Note` button, one address.
- **The write is an idempotent `PUT` upsert addressed by the period**, and the address has exactly one spelling. There is no `404`-recovery path because there is no `404`. → `NoteAutosave.MD`
- **Both sigils bind as whole tokens and are parsed in code** — `{schedule}` and `{period}`, never split by the route template. `Schedules.TryParse` and `Periods.TryParse` are the only ways in.
- **A period is a period *of a Schedule*.** `Periods.TryParse` takes the span first.
- **An empty note is legal at the API and invisible in it** — omitted by both reads, on one predicate expressed once per repository.
- **Emptiness is decided on the *write*, by `NoteContent.Normalise`, and read back as `Content.Length > 0`** — never `IsNullOrWhiteSpace`, which does not survive translation to SQL. → `LocalPostgres.MD` §6
- **The address is the primary key, and `Database:Provider` chooses which store enforces it** — explicit, never inferred from a connection string; an unrecognised value fails at startup.
- **A Postgres repository method is the transaction boundary.** Every method opens its own context; there is no unit of work.
- **The Postgres upsert is one `INSERT … ON CONFLICT … DO UPDATE … RETURNING`.** Read-then-write is the race that puts two notes in one period.
- **No test touches a live database.** → `LocalPostgres.MD` §8
- **`isBlank` is the one definition of empty on the client** — *don't create*, *delete on close* and *don't display* alike, against the local cache included.
- **Nothing is written until the buffer holds something**, then 2s after typing stops and every 10s of continuous typing, flushing on close, tab-hide and `pagehide`. **Clearing a note is written like any other change.**
- **Delete-on-close is best-effort and never load-bearing** — once per note ever, from `finish()`, outside the writes' `AbortController`.
- **The dialog has no discard button, because clearing *is* the discard.** `Done` flushes and closes.
- **Never decide anything after an `await` by reading React state.** `flush` and `finish` **return** whether the buffer reached the server, and `Done` holds the dialog open on what they returned. → `LocalPostgres.MD` §8
- **`useNoteAutosave` sets its mounted flag in the effect body, not only in the cleanup** — StrictMode tears a hook down and builds it again.
- **E2E: `page.clock.install()` before the first navigation, `pauseAt()` once the page is up** — never `setFixedTime`. Frozen at 20:20 on 25/08/2026, `Europe/London`, `en-GB`. → `PlaywrightE2E.MD`
- **Every per-day E2E handle goes through `day(heading)`.** Three days render at once, so an unscoped query fails strict mode.

## Code style

**Comments are concise, and rare** — C# XML docs, TSDoc, inline, and FastEndpoints
`Summary`/`Description` alike.

- Never restate the code: no `/// <summary>The created date.</summary>`, no per-parameter echoes of the signature, no section banners.
- Comment only what the code cannot carry — a constraint the type can't express (a half-open range), a decision that looks wrong without its reason (singleton lifetime, a frozen clock), a third-party quirk, a fixture choice that is itself under assertion.
- One or two lines; a fragment beats a sentence. Rationale essays belong in `feature-docs/`.
- Endpoint `Summary` is one line. Add a `Description` only for a rule the caller cannot guess (required parameters, exclusive bounds, limits), never to narrate the schema.
- Deleting a stale comment beats updating it.

## Current state

**Backend — two reads and two writes**, all under `/api/schedules/{schedule}`. `GET …/notes?searchFrom=…&searchTo=…`
lists a Schedule's notes over the **half-open** `[searchFrom, searchTo)`, newest first; both bounds
required, a window wider than 7 days a `400`. `GET …/note-days` answers the same window as
`[{ day, count }]` ascending for the calendar markers, capped at 42. **Neither read returns an
empty note.** `PUT …/notes/{day}/p{ordinal}` upserts — `201` created, `200` replaced, the note in
the body either way; content alone, empty accepted, capped at 16,384. `DELETE` is `204`, or `404`
when the period held none. A bad Schedule, period or spelling is a `400` from the validator.

**Two stores, chosen by `Database:Provider`.** `Memory` is the default everywhere — CI, the
deployed app, the whole test suite — seeded across today ± 3 days and guarded by a `Lock`.
`Postgres` is EF Core over a local `postgresql-x64-18`, one `notes` table, migrations checked in
and applied by hand, connection string in **user secrets** under `ConnectionStrings:Notes`.
Switching is one line in `appsettings.Development.json`, which stays on `Memory`. Local
development only — nothing deployed has persistence yet.

No auth, no Schedule endpoints, no custom middleware, no HTTPS redirection — CORS and TLS belong
to the host.

**Frontend — three days, a live clock, a month calendar.** The focus day and its two neighbours
render as day sections in one scroll container under a fixed toolbar (*Calendar*, *Go to today*).
`CalendarDialog`'s Monday-first grid, marked from `note-days`, re-points the view. Markdown
editing is `@mdxeditor/editor` — extend `NoteEditor`'s plugin list rather than adding a second
editor. **Notes save themselves** through `useNoteAutosave`; the dialog's one button is **Done**,
beside a `Saved HH:MM` / `Saving…` / `Not saved — retrying` line. `App` applies each write to
`useScheduleNotes`'s cache rather than refetching. No router, no state library.
`timely-notes-ui/README.md` is still stock Vite template text.

**Tests.** 274 xUnit specs, all against the in-memory store; ~323 Vitest; ~73 Playwright in the
hermetic `stubbed` lane (previewed on `127.0.0.1:5174`, every `/api/**` call fulfilled from a
fixture — `notes*` matches neither `note-days` nor `notes/{day}/p{n}`, so all three routes are
stubbed) and 5 in `integrated`, which holds only the assertions about the two projects agreeing.
Keep that lane small. `NoteEditor` is mocked in `App.test.tsx` and `NoteDialog.test.tsx` —
MDXEditor emits no change event under jsdom, so its real behaviour is the Playwright lane's job.

**Next:** `LocalPostgres.MD` is built and still in `todo/` — every item ticked and the schema in
the local database, but the by-hand walk-through is done only at the API. The browser half (a
fresh database rendering three empty days, clearing a note, two tabs, a reboot) is what it waits
on. `TrustworthyLane.MD` is specified and unstarted — the `stubbed` lane has two request-count
specs that fail about one run in fifty, and it diagnoses before it fixes. `NowOnTheGrid.MD` then
`MenuAndNoteNow.MD` are specified and waiting after it;
`EmptyNotePruning.MD` is specified but **not scheduled** — the read filter and the upsert together
make it optional rather than owed.
