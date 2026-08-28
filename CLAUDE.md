# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace hierarchy

The repo root holds two independent projects plus the planning docs:

```
timely-notes/
├── CLAUDE.md                      # this file
├── run-dev.ps1                    # starts the API (5186) and UI (5173) together
├── DESIGN DOCUMENT.MD             # domain model + goals (source of truth for "what")
├── feature-docs/                  # how work is defined and recorded
│   ├── WORKFLOW.MD                # the process — read before specifying or implementing
│   ├── todo/                      # the feature specification being worked on
│   └── done/                      # completed specifications, kept as a record
│       ├── GetNotesBySchedule.MD
│       ├── FrontendSkeleton.MD
│       └── NotesDateRange.MD
├── TimelyNotes.Backend/           # ASP.NET Core Web API (.NET 10) — its own solution
└── timely-notes-ui/               # React + TypeScript frontend (Vite) — its own npm package
```

The two projects are wired together only by a **Vite dev proxy** (`/api` → `http://localhost:5186`): there is no `.env`, no shared build, no root README and no CI config. Run both dev servers together with `./run-dev.ps1` from the repo root (PowerShell 7+; it fails fast if either default port is taken, and stops both on Ctrl+C), or start them separately with the per-project commands below.

## Planning docs and workflow

**[`feature-docs/WORKFLOW.MD`](feature-docs/WORKFLOW.MD) is the process for this repo — read it before writing a feature specification or starting work on one.** The essentials:

- **`DESIGN DOCUMENT.MD`** describes the domain model (Instance → Schedule → Note), the backend/frontend goals, and the open questions (persistence, auth, CI/CD). It is a statement of intent, not an implementation plan — consult it before designing anything new, and treat unresolved items there as genuinely undecided.
- **Work happens one feature at a time, and one document owns that feature end to end.** The specification is written in `feature-docs/todo/<FeatureName>.MD`: goal, scope decisions, architecture, a checklist, how to verify, and what is deferred. A feature may span both projects or sit inside one.
- **The implementing agent ticks the boxes in that same file** as the work lands, and must satisfy every requirement in it. Per TDD, each item starts with a failing test.
- **Implementation notes are appended to that same file** — never a second, prefixed document.
- **When the feature is finished, the specification moves into `feature-docs/done/`** rather than being deleted. `feature-docs/done/GetNotesBySchedule.MD` and `feature-docs/done/FrontendSkeleton.MD` are the worked examples of the format and level of detail expected.
- If `feature-docs/todo/` is empty, the last feature is done and the next one needs specifying from the design document before code is written.

## Current state

**Backend — one vertical slice complete, now range-filtered.** `GET /api/schedules/{scheduleShortName}/notes?searchFrom=…&searchTo=…` lists a Schedule's notes (`s1`/`s3`/`s6`) whose `OccursAt` falls in the **half-open** window `[searchFrom, searchTo)`, newest first, served from an in-memory repository seeded across today ± 3 days. Both parameters are required ISO 8601 instants carrying their UTC offset, and a window wider than 7 days is a `400` (`GetNotesByScheduleValidator`). Repository and endpoint tests cover the range, the boundaries and every rejection. Nothing else exists: no create/get-by-id, no Schedule endpoints, no persistence, no auth.

**`Note` has two independent timestamps.** `OccursAt` is the slot the note is taken *for* — the only field that decides placement, ordering and filtering, in both projects. `CreatedAt`/`ModifiedAt` are server-set audit stamps recording when it was written, and nothing reads them for placement. When the create endpoint lands, the client sends `occursAt` and the server sets the rest.

**Frontend — the day schedule view slice is complete.** The app shows today split into periods by the selected Schedule, fetches through the Vite dev proxy, and opens both new and existing notes in a `NoteDialog` wrapping `NoteEditor`. Save still only `console.log`s the markdown — there is no create/update endpoint. `App` requests a **three-day window** (yesterday's local midnight up to the day after tomorrow's) but still renders today only; the extra days are groundwork for the deferred scrolling view. There is no router and no state management library; the selected Schedule and period are React state in `App.tsx`. Vitest + React Testing Library are set up and the slice is covered by tests.

## Development approach

We use **Test Driven Development** in both the API and the UI: write a failing test first, then the minimum code to pass it, then refactor. This applies to all new domain code (models, endpoints, components, hooks, etc.), not just bug fixes. The backend has xUnit set up and the frontend has Vitest + React Testing Library.

## Code style

**Always pass the cancellation token explicitly to every async call that accepts one.** Never rely on a defaulted or omitted token — an unpassed token silently makes the call uncancellable.

- Declare `CancellationToken ct` **without** a `= default`, so callers can't skip it by accident (see `INoteRepository`).
- In endpoints, thread the handler's `ct` through every downstream call, including `Send.OkAsync(..., ct)`.
- In tests, pass `TestContext.Current.CancellationToken` (xUnit v3) so a cancelled test run stops promptly — this is what the xUnit1051 analyzer asks for. Use it in preference to `TestBase.Cancellation`.
- Some third-party APIs offer no token overload — FastEndpoints' typed test-client helpers (`GETAsync<TEndpoint, TRequest, TResponse>`) are one. Leave those as they are; the rule applies wherever a token parameter actually exists.

## Backend — `TimelyNotes.Backend/TimelyNotes.API`

- .NET 10, ASP.NET Core Web API. Solution file: `TimelyNotes.Backend.slnx` (`TimelyNotes.API` + `TimelyNotes.API.Tests`).
- Build: `dotnet build` (run from `TimelyNotes.Backend/`)
- Run: `dotnet run --project TimelyNotes.API` (from `TimelyNotes.Backend/`)
  - HTTP: `http://localhost:5186`
  - HTTPS: `https://localhost:7026` (falls back to the HTTP port)
  - `TimelyNotes.API/TimelyNotes.API.http` has ready-made requests for the `s1`/`s3`/`s6` list routes.
- Test: `dotnet test` (from `TimelyNotes.Backend/`). Tests live in `TimelyNotes.API.Tests` — xUnit **v3**, because `FastEndpoints.Testing` requires it.
  - `global.json` opts `dotnet test` into the Microsoft.Testing.Platform runner (required on the .NET 10 SDK, which no longer supports VSTest here) — that's also why the test project is `<OutputType>Exe</OutputType>`.
  - Endpoint tests use `AppFixture<Program>` / `TestBase<T>` from `FastEndpoints.Testing`, which is why `Program.cs` ends with `public partial class Program;`.
  - Test folders mirror the API's own layout (`Endpoints/Notes/`, `Repositories/`).
- No database/EF Core, no authentication, and no custom middleware are configured — `appsettings.json` only has default `Logging`/`AllowedHosts` keys.

**Endpoints use FastEndpoints in the REPR pattern** — one endpoint per route, with `Request`/`Response`/`Endpoint` types each in their own file under `Endpoints/<Area>/` (see `Endpoints/Notes/`). `Program.cs` wires this up via `AddFastEndpoints()`/`UseFastEndpoints()` plus Swagger. Don't add MVC controllers.

**Validate requests with a FluentValidation `Validator<TRequest>`** in its own file beside the endpoint (`GetNotesByScheduleValidator`) — FastEndpoints discovers it and turns a failure into a `400` before the handler runs. Make an optional-looking query parameter **nullable** even when the value is required, so an omitted one fails `NotNull()` with a message naming the parameter, rather than silently binding to `default`.

**Filtering belongs in the repository, not the endpoint.** It is a query concern, and a real store will push it into the database instead of materialising everything first.

**Layout inside `TimelyNotes.API`:** `Models/` (entities), `Repositories/` (interfaces and implementations side by side), `Endpoints/` (FastEndpoints). Repositories abstract persistence so the store can be swapped later; `InMemoryNoteRepository` is registered as a **singleton** so its seeded state survives across requests.

## Frontend — `timely-notes-ui`

- React 19 + TypeScript, built with Vite 8. Package manager: npm.
- `npm run dev` — start the dev server (default `http://localhost:5173`)
- `npm run build` — type-check (`tsc -b`) and build (`vite build`)
- `npm run lint` — ESLint (flat config in `eslint.config.js`; basic, non-type-aware rules)
- `npm run preview` — preview a production build
- `npm test` — Vitest once (`npm run test:watch` to watch). Config lives in `vite.config.ts` (`jsdom`, globals on, `src/test/setup.ts`), which also stubs `HTMLDialogElement.showModal`/`close` since jsdom doesn't implement them. Tests sit next to the code they cover as `*.test.ts(x)`.

**`vite.config.ts` proxies `/api` to `http://localhost:5186`**, so the UI calls the backend same-origin and no CORS config is needed. Dev-only — there is no production API base URL yet.

**Layout inside `src/`:** `main.tsx` (root render), `App.tsx` + `App.css` (shell and day-view styles), `types/` (shared `Note`/`Schedule`/`Period`/`SpanHours`), `domain/` (pure time logic — `schedules.ts`, `periods.ts`, `notes.ts`), `api/` (`notesApi.ts`, a `fetch` wrapper returning parsed `Note`s), `components/` (`SchedulePicker`, `ScheduleView`, `PeriodRow`, `NoteDialog`, `NoteEditor`), `index.css` (minimal global styles; no design system).

**`App` owns the domain calls.** It runs `buildPeriods` then `assignNotes` in a `useMemo` and hands `ScheduleView` a finished `Period[]`; nothing below `App` calls the domain functions, so component tests pass in fixed periods. The selected period is stored as a **timestamp**, not a `Period` object — periods are rebuilt whenever the notes or the Schedule change, so a held reference goes stale. It also owns the fetch window: `searchFrom`/`searchTo` are `useMemo`d off the frozen `today` so they stay referentially stable and the effect fires once per Schedule change.

**Place notes by `occursAt`, never `createdAt`.** `assignNotes` buckets on it and `PeriodRow` prints it beside each note; `createdAt` is only an audit stamp. Test fixtures deliberately set `createdAt` to a different day so the distinction is asserted rather than incidental.

**Pass an `AbortSignal` to every API call** — `getNotesBySchedule(shortName, searchFrom, searchTo, signal)` takes one as a required parameter, wired to the calling effect's cleanup. This is the frontend mirror of the backend's cancellation-token rule above.

**Serialise instants with their offset, and build query strings with `URLSearchParams`.** `notesApi.ts` renders the window bounds as `2026-08-27T00:00:00+01:00` rather than `toISOString()`'s UTC — the bounds are *local* midnights and the offset is what says so. A raw `+` in a query string means a space, so it must be percent-encoded. Frontend tests assert such URLs **structurally** (parse, compare instants, match the format with a regex): a literal expectation only passes in one timezone.

**Inject the clock, never read it in a component.** `App` and `ScheduleView` both take an optional `now` prop so tests are deterministic; `App` freezes it at mount.

**Markdown editing uses `@mdxeditor/editor`.** `NoteEditor` is a `forwardRef` wrapper exposing `MDXEditorMethods` (so a parent reads the markdown via `ref.current.getMarkdown()`) and configures the plugin list and toolbar. Add editor features by extending that plugin list rather than dropping a second editor in. `@mdxeditor/editor/style.css` is imported inside the component.

`README.md` in this folder is still the stock Vite template text.
