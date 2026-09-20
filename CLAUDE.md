# CLAUDE.md

Guidance for Claude Code working in this repo. Rules here override default behaviour.

**Domain concepts live in `DESIGN DOCUMENT.MD`, not here** — what an Instance, a Schedule, a
period or a note *is*, and why there is no id and no instant. Read it before designing anything
new. This file covers navigation, process and the rules that follow.

## The repo

Two independent projects plus the planning docs, wired together in development **only** by the
Vite dev proxy (`/api` → `http://localhost:5186`); deployed, the UI reaches the API by its own
origin (`VITE_API_BASE_URL`). No shared build.

| Path | What |
| --- | --- |
| `DESIGN DOCUMENT.MD` | Domain model and goals. Intent, not a plan; open questions there are genuinely open. |
| `feature-docs/WORKFLOW.MD` | **The process.** Read before specifying or implementing. |
| `feature-docs/todo/` | The features specified and waiting; each states its own Goal. Empty ⇒ specify the next one first. |
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
| `dotnet tool run dotnet-ef database update` | Applies migrations by hand, never at startup. → `LocalPostgres.MD` |
| `dotnet tool run dotnet-ef migrations add <Name> --output-dir Data/Migrations` | From `TimelyNotes.API/`. |

Frontend, from `timely-notes-ui/`:

| Command | |
| --- | --- |
| `npm run dev` / `build` / `lint` | Dev server `:5173`; build is `tsc -b` + `vite build` |
| `npm test` | Vitest once (`test:watch` to watch) |
| `npm run test:e2e` | Playwright, **stubbed** lane, headless — the default |
| `npm run test:e2e:integrated` | The lane that needs the API running |

`npx playwright install chromium` is a one-off before the first E2E run. Never make Playwright's
HTML reporter the default — `show-report` blocks the terminal.

## Navigation

**Backend — `TimelyNotes.Backend/TimelyNotes.API/`**

| Where | What |
| --- | --- |
| `Models/Schedules.cs` | A Schedule's shape: `Known {1,3,6}`, `PeriodCountFor`, `IsValidPeriodOrdinal`, the only `s`-sigil parse/format. |
| `Models/Periods.cs` | The only `p`-sigil parse/format. `TryParse` takes the Schedule's span first. |
| `Models/Note.cs` | The entity. `Models/NoteDayCount.cs` is the counts projection. |
| `Models/NoteContent.cs` | The one definition of empty: `Normalise` on write, `IsReadable` on read. |
| `Repositories/` | `INoteRepository` and its two implementations, both singleton. `NoteStoreRegistration` is the provider switch. |
| `Data/` | `NotesDbContext`, `NoteQueries` (both reads as `IQueryable`), the design-time factory, the checked-in `Migrations/`. |
| `Endpoints/Notes/` | FastEndpoints REPR — `Request`/`Response`/`Endpoint`/`Validator`, one type per file. |
| `Program.cs` | Registers `TimeProvider.System`. Handlers never read the clock directly. |
| `TimelyNotes.API.http` | Ready-made requests for the list routes. |

**Frontend — `timely-notes-ui/src/`**

| Where | What |
| --- | --- |
| `App.tsx` | Owns the lot: Schedule, `pinned`, `calendarMonth`, the window, the domain calls. Nothing below it fetches. |
| `hooks/useNoteAutosave.ts` | The autosave engine: debounce, ceiling, dirty check, in-flight guard, save status. |
| `hooks/` | `useNow` (the only clock read), `useScheduleNotes` (the only note fetch), `useNoteDays` (calendar markers). |
| `domain/` | Pure time logic — `schedules`, `periods`, `notes`, `days`, `months`. No React, no fetch. |
| `types/index.ts` | `DayKey`, `Note`, `Schedule`, `Period`, `SpanHours`. |
| `api/notesApi.ts` | The `fetch` wrapper; every route takes a required `AbortSignal`. |
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
- **Vitest first, Playwright after.** Never run Playwright inside the TDD loop, and never let it substitute for a unit test — a failing acceptance spec is a symptom, and the fix starts with a new failing unit test.
- **Pass the cancellation token or signal explicitly, everywhere** — `CancellationToken ct` with no `= default`, threaded through every downstream call including `Send.OkAsync(..., ct)`; `TestContext.Current.CancellationToken` in tests; a required `AbortSignal` on every `notesApi` call. Only exception: third-party APIs with no token overload.
- **Filtering and grouping belong in the repository**, not the endpoint.
- **Validate with a FluentValidation `Validator<TRequest>`** beside the endpoint, and make a required query parameter nullable so an omitted one fails `NotNull()` by name.
- **FastEndpoints only** — no MVC controllers. `Program.cs` ends `public partial class Program;` for the test fixture.
- **Unit tests assert URLs structurally**, never as literal dates; only E2E has a pinned zone.

## Invariants

Eight rules nothing in the build enforces, where the wrong version looks reasonable. Every other
constraint is held by a type or by a named test — those are not restated here. Reasoning is in the
feature document named.

- **No `?offset=` parameter anywhere in the API.** The period grid is the viewer's local one. → `GetNotesBySchedule.MD`
- **`CreatedAt`/`ModifiedAt` are never rendered.** Placement comes from `(Day, PeriodOrdinal)` alone. → `OneNotePerPeriod.MD`
- **Never `new Date(dayKey)`** — that is UTC midnight. Only `addDays` (`days.ts`) and `weekStartOf` (`months.ts`) convert. → `OneNotePerPeriod.MD`
- **`useScheduleNotes`'s `AbortController` is tied to the Schedule, not the range** — aborting on a range change cancels the prefetch it just asked for. → `NoteAutosave.MD`
- **The dialog opens on an address, not on a note.** `dialogSlot = { day, period }`. → `LiveClock.MD` §4
- **Delete-on-close is best-effort and never load-bearing** — once per note ever, issued outside the writes' `AbortController`. → `NoteAutosave.MD`
- **Never decide anything after an `await` by reading React state.** `flush` and `finish` **return** whether the buffer reached the server. → `LocalPostgres.MD` §8
- **`.schedule-view` is the only scroll container** (`body` is `overflow: hidden`), and the toolbar is its sibling, not its content. → `ScrollingSchedule.MD`

## Code style

**Comments are concise, and rare** — C# XML docs, TSDoc, inline, and FastEndpoints
`Summary`/`Description` alike. Never restate the code; comment only what the code cannot carry;
one or two lines, a fragment over a sentence. Rationale essays belong in `feature-docs/`, and
deleting a stale comment beats updating it.

## Current state

**Backend.** Two reads and two writes under `/api/schedules/{schedule}`: `GET …/notes` over a
required half-open `[searchFrom, searchTo)` of at most 7 days, `GET …/note-days` for the calendar
markers (capped at 42), `PUT …/notes/{day}/p{ordinal}` (`201` created, `200` replaced) and
`DELETE` on the same address. Neither read returns an empty note; a bad Schedule, period or
spelling is a `400` from the validator. No auth, no Schedule endpoints, no custom middleware, no
HTTPS redirection — CORS and TLS belong to the host.

**Stores.** `Database:Provider` picks one. `Memory` is the default everywhere — CI, the deployed
app, the whole test suite — seeded across today ± 3 days. `Postgres` is EF Core over a local
`postgresql-x64-18`, migrations applied by hand, connection string in user secrets under
`ConnectionStrings:Notes`. Local development only; nothing deployed has persistence yet.

**Frontend.** The focus day and its two neighbours render in one scroll container under a fixed
toolbar (*Calendar*, *Go to today*), with a Monday-first `CalendarDialog` marked from `note-days`.
Markdown editing is `@mdxeditor/editor` — extend `NoteEditor`'s plugin list rather than adding a
second editor. Notes save themselves through `useNoteAutosave`, the dialog's one button is
**Done**, and `App` applies each write to `useScheduleNotes`'s cache rather than refetching. No
router, no state library. `timely-notes-ui/README.md` is still stock Vite template text.

**Tests.** 274 xUnit, all against the in-memory store; ~323 Vitest; ~73 Playwright in the hermetic
`stubbed` lane (previewed on `127.0.0.1:5174`, every `/api/**` call fulfilled from a fixture) and 5
in `integrated`, which holds only the assertions about the two projects agreeing — keep that lane
small. `NoteEditor` is mocked in `App.test.tsx` and `NoteDialog.test.tsx`: MDXEditor emits no
change event under jsdom, so its real behaviour is the Playwright lane's job.

**Next.** `LocalPostgres.MD` is built and still in `todo/`, waiting only on the browser half of its
by-hand walk-through. The rest of `feature-docs/todo/` is specified and unstarted; each doc's Goal
says what it is for, and `EmptyNotePruning.MD` is **not scheduled**.
