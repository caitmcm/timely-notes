## The repo

Two independent projects plus the planning docs, wired together in development **only** by the
Vite dev proxy (`/api` → `http://localhost:5186`); deployed, the UI reaches the API by its own
origin (`VITE_API_BASE_URL`). No shared build.

| Path | What |
| --- | --- |
| `DESIGN DOCUMENT.MD` | Domain model and goals — what an Instance, Schedule, period and note *are*, and why there is no id and no instant. Read before designing anything new. Intent, not a plan; its open questions are genuinely open. |
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
| `Models/Schedules.cs` | Known spans `{1,3,6}`, `PeriodCountFor`, `IsValidPeriodOrdinal`, `s`-sigil parse/format. |
| `Models/Periods.cs` | `p`-sigil parse/format. `TryParse` takes the Schedule's span first. |
| `Models/Note.cs` | Note entity. `NoteDayCount.cs` is the per-day count projection. |
| `Models/NoteContent.cs` | Empty-note check: `Normalise` on write, `IsReadable` on read. |
| `Repositories/` | `INoteRepository`, its memory and Postgres implementations (both singleton), and `NoteStoreRegistration`, which picks the provider. |
| `Data/` | `NotesDbContext`, `NoteQueries` (both reads as `IQueryable`), the design-time factory, `Migrations/`. |
| `Endpoints/Notes/` | FastEndpoints REPR: `Request`/`Response`/`Endpoint`/`Validator`, one type per file. |
| `Program.cs` | Registers `TimeProvider.System`; handlers take the clock from it. |
| `TimelyNotes.API.http` | Sample requests for every route, including invalid ones. |

**Frontend — `timely-notes-ui/src/`**

| Where | What |
| --- | --- |
| `App.tsx` | Holds all app state (Schedule, `anchorDay`, `selected`, `calendarMonth`) and the domain calls. Components below it don't fetch. |
| `hooks/useNoteAutosave.ts` | Autosave: debounce, max wait, dirty check, in-flight guard, save status. |
| `hooks/` | `useNow` (only clock read), `useScheduleNotes` (only note fetch), `useNoteDays` (calendar markers). |
| `domain/` | Pure time logic: `schedules`, `periods`, `notes`, `days`, `months`, `window`. No React, no fetch. |
| `types/index.ts` | `DayKey`, `Note`, `Schedule`, `Period`, `SpanHours`. |
| `api/notesApi.ts` | `fetch` wrapper; every call takes a required `AbortSignal`. |
| `components/` | `MenuDrawer`, `SchedulePicker`, `ScheduleView`, `DaySection`, `PeriodRow`, `NoteDialog`, `NoteEditor`, `CalendarDialog`, `MonthGrid`, `icons`. |
| `e2e/` | Playwright: `fixtures/app.ts` (extended `test` and `ApiStub`), `fixtures/ScheduleView.ts` (page object). `stubbed`: `api-contract`, `calendar`, `layout`, `menu`, `note-dialog`, `window`. `integrated`: `backend`. |

Tests sit beside the code they cover (`*.test.ts(x)`); backend test folders mirror the API's layout.

## Workflow

Per `feature-docs/WORKFLOW.MD` — one feature, one document, end to end:

1. Specify in `feature-docs/todo/<FeatureName>.MD`: Goal, Scope decisions, Architecture, Checklist, Verify, Deferred, Implementation notes.
2. Implement by TDD, ticking `- [ ]` → `- [x]` **as each test goes green**, never in a batch.
3. Append implementation notes to that same document as decisions are made. Never a second file.
4. Compact freely once the document is current — the specification is the memory, not the transcript.
5. Move it to `done/` and update **Current state** below.

## Engineering rules

- **TDD, both projects**, for all new code, not just fixes. Vitest first; Playwright after, never in the loop and never instead of a unit test.
- **Pass cancellation explicitly, everywhere** — `CancellationToken ct` with no default, down to `Send.OkAsync(..., ct)`; `TestContext.Current.CancellationToken` in tests; a required `AbortSignal` on every `notesApi` call. Third-party APIs with no overload are the only exception.
- **FastEndpoints only**, no MVC. Filtering and grouping in the repository; validation in a FluentValidation `Validator<TRequest>` beside the endpoint, with required query parameters nullable so an omitted one fails `NotNull()` by name.
- **Unit tests assert URLs structurally**, never as literal dates; only E2E has a pinned zone.
- **The `integrated` Playwright lane only tests that the two projects agree.** Everything else goes in `stubbed`.
- **A `stubbed` spec checks only what jsdom cannot:** layout and scrolling, the native `<dialog>`, the real editor, or a pinned zone. Anything else is a Vitest test. → `LeanStubbedLane.MD`
- **Comments are one or two lines, and only say what the code cannot.** This covers XML docs, TSDoc, inline comments and FastEndpoints `Summary`/`Description`. Plain fragments, no mannered prose, never restating the code. Rationale goes in `feature-docs/`. Code can change, so a comment never says code must stay as it is. Delete a stale comment rather than update it.

## Invariants

Eleven rules nothing in the build enforces, where the wrong version looks reasonable. Every other
constraint is held by a type or by a named test — those are not restated here. Reasoning is in the
feature document named.

- **No `?offset=` parameter anywhere in the API.** The period grid is the viewer's local one. → `GetNotesBySchedule.MD`
- **`CreatedAt`/`ModifiedAt` are never rendered.** Placement comes from `(Day, PeriodOrdinal)` alone. → `OneNotePerPeriod.MD`
- **Never `new Date(dayKey)`** — that is UTC midnight. Only `addDays` (`days.ts`) and `weekStartOf` (`months.ts`) convert. → `OneNotePerPeriod.MD`
- **`useScheduleNotes`'s `AbortController` is tied to the Schedule, not the range** — aborting on a range change cancels the prefetch it just asked for. → `NoteAutosave.MD`
- **The dialog opens on an address, not on a note.** `dialogSlot = { day, period }`. → `LiveClock.MD` §4
- **Delete-on-close is best-effort and never load-bearing** — once per note ever, issued outside the writes' `AbortController`. → `NoteAutosave.MD`
- **Never decide anything after an `await` by reading React state.** `flush` and `finish` **return** whether the buffer reached the server. → `LocalPostgres.MD` §8
- **`.schedule-view` is the only scroll container** (`body` is `overflow: hidden`), and `.app__header` is its sibling, not its content. → `ScrollingSchedule.MD`, `MenuAndNoteNow.MD`
- **Selecting a period never moves the window.** `anchorDay` and `selected` are separate state; only navigation writes the anchor. → `DayWindowNavigation.MD`
- **`Note now` opens on the current period, never on the selection** — it clears both, then waits for the day to load rather than opening on an unloaded one. → `MenuAndNoteNow.MD`
- **A dialog that unmounts on close restores focus itself, from an effect** — `<dialog>`'s own restore never runs, and a handler is too early: on Escape the browser's close sequence lands last. → `MenuAndNoteNow.MD`

## Current state

**Backend.** Routes under `/api/schedules/{schedule}`:

- `GET …/notes?searchFrom&searchTo`: half-open range of at most 7 days.
- `GET …/note-days?searchFrom&searchTo`: calendar markers, at most 42 days.
- `PUT …/notes/{day}/p{ordinal}`: `201` created, `200` replaced.
- `DELETE …/notes/{day}/p{ordinal}`.

Reads never return empty notes. The validator returns `400` for a bad Schedule, period or format.
There is no auth, no Schedule endpoint, no custom middleware and no HTTPS redirection. The host
handles CORS and TLS.

**Stores.** `Database:Provider` selects `Memory` or `Postgres`. `Memory` is the default for CI,
the deployed app and all tests, seeded with notes from today − 3 to today + 3. `Postgres` is
EF Core on a local `postgresql-x64-18`, for local development only. The connection string is in
user secrets under `ConnectionStrings:Notes`. Nothing deployed persists notes.

**Frontend.** `App` holds two separate pieces of state: `anchorDay` (the visible days,
`anchor ± 1`) and `selected` (the selected period). `null` means follow the clock. Only navigation
changes `anchorDay`; `domain/window.ts` does the arithmetic. `Earlier days` and `Later days` move
the window three days. `Go to today` appears only in `CalendarDialog` and in the notice shown when
today is off screen. The Schedule is picked in `MenuDrawer`. Editing uses `@mdxeditor/editor` in
`NoteDialog`, saved by `useNoteAutosave`; `App` updates `useScheduleNotes`'s cache after each write
instead of refetching. There is no router and no state library. `timely-notes-ui/README.md` is
still the Vite template.

**Tests.** xUnit runs against the in-memory store. Playwright has two lanes. `stubbed` runs on
`127.0.0.1:5174` and answers every `/api/**` call from a fixture. `integrated` needs the running
API. `stubbed` has 15 tests and `integrated` 5. `App.test.tsx` and `NoteDialog.test.tsx` mock `NoteEditor` because MDXEditor emits no change
events under jsdom; Playwright tests the real editor.

**Next.** The docs in `feature-docs/todo/` are specified but not started. `EmptyNotePruning.MD` is
not scheduled.
