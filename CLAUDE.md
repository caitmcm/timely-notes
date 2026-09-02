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
│   ├── todo/                      # the feature specifications not yet finished
│   │   ├── NoteAutosave.MD        # next: create-on-open, autosave, POST/PUT
│   │   └── PlaywrightE2E.MD       # last: the browser acceptance lane
│   └── done/                      # completed specifications, kept as a record
│       ├── GetNotesBySchedule.MD
│       ├── FrontendSkeleton.MD
│       ├── NotesDateRange.MD
│       └── LiveClock.MD
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

**Frontend — the schedule scrolls, its clock is live, and notes load ahead of the scroll.** The app shows the selected Schedule as a continuous column of day sections in one scroll container (the page itself never scrolls), fetches through the Vite dev proxy, and opens both new and existing notes in a `NoteDialog` wrapping `NoteEditor`. It starts on the focus day alone and grows a day at a time in whichever direction the user scrolls, unbounded either way; `useScheduleNotes` fetches two days past the edge in the direction of travel, caches every day it has loaded and never asks for one twice. `useNow` ticks on the minute and resyncs on visibility/focus, so the current-period marker moves and an untouched view rolls over at midnight; a view the user has committed to stays put, and a *Go to today* control appears whenever the day at the top of the viewport is not the current one. Save still only `console.log`s the markdown and the note's `occursAt` — there is no create/update endpoint. There is no router and no state management library; the selected Schedule, the rendered range and what the user has pinned are React state in `App.tsx`. Vitest + React Testing Library are set up and the slice is covered by tests.

## Development approach

We use **Test Driven Development** in both the API and the UI: write a failing test first, then the minimum code to pass it, then refactor. This applies to all new domain code (models, endpoints, components, hooks, etc.), not just bug fixes. The backend has xUnit set up and the frontend has Vitest + React Testing Library.

## Code style

**Comments are concise, and rare.** Code should carry its own meaning; a comment is added only when it cannot. This applies equally to C# XML docs, TS/TSX JSDoc, inline comments, and FastEndpoints `Summary`/`Description` text.

- **Never restate the code.** No comment for what a name already says (`/// <summary>The created date.</summary>`), no per-parameter docs that repeat the signature, no section-banner comments.
- **Comment only the non-obvious:** a constraint the type cannot express (a half-open range), a decision that looks wrong without its reason (singleton lifetime, a frozen clock), a third-party quirk being worked around, or a test fixture choice that is itself under assertion.
- **One or two lines.** Rationale essays, worked examples and history belong in `feature-docs/`, not in source. Prefer a fragment to a sentence, and drop "this method/class/component…" framing.
- **Endpoint `Summary`/`Description`:** one line of summary; add a description only for a rule the caller cannot guess (required parameters, exclusive bounds, limits). Don't narrate the response shape the schema already shows.
- **Deleting a stale comment beats updating it.** If the code moved on and the comment no longer earns its place, remove it.

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

**Layout inside `src/`:** `main.tsx` (root render), `App.tsx` + `App.css` (shell and schedule styles), `types/` (shared `Note`/`Schedule`/`Period`/`SpanHours`), `domain/` (pure time logic — `schedules.ts`, `periods.ts`, `notes.ts`, `days.ts`), `hooks/` (`useNow.ts`, `useScheduleNotes.ts`), `api/` (`notesApi.ts`, a `fetch` wrapper returning parsed `Note`s), `components/` (`SchedulePicker`, `ScheduleView`, `DaySection`, `PeriodRow`, `NoteDialog`, `NoteEditor`), `test/` (Vitest setup and the `IntersectionObserver` stub), `index.css` (minimal global styles; no design system).

**`App` owns the domain calls.** It runs `buildPeriods` then `assignNotes` per rendered day in one `useMemo` and hands `ScheduleView` a finished `DayView[]`; nothing below `App` calls the domain functions or fetches, so component tests pass in fixed periods. The selected period is stored as a **timestamp**, not a `Period` object — periods are rebuilt whenever the notes or the Schedule change, so a held reference goes stale. It also owns the wanted window, which it hands to `useScheduleNotes` as day starts.

**Days are epoch ms of local midnight, and `domain/days.ts` is the only arithmetic on them.** `addDays` goes through local clock fields rather than 86 400 000 ms, so a DST day still lands on midnight; `contiguousRuns` and `chunkRun` are what keep a request from spanning a cached gap or exceeding the server's 7-day cap.

**`useScheduleNotes` is the only thing that fetches.** It caches every day it has loaded (including days that came back empty), requests only the missing ones, and is scoped to a Schedule — changing Schedule drops the cache and aborts what is in flight. Its `AbortController` is tied to the **Schedule, not the range**: a range change is what starts requests, so aborting on one would cancel the prefetch it just asked for.

**The rendered range grows, the wanted range runs ahead of it.** `ScheduleView` grows the rendered days a day at a time when an `IntersectionObserver` sentinel reaches an edge; `App` then wants **two days past the edge in the direction of travel** and one behind. A focus day outside the rendered range (a rollover, *Go to today*) resets the range to that day rather than spanning the gap.

**The schedule scrolls; the page does not.** `body` is `overflow: hidden` and `.schedule-view` is the only scroll container, so the scrollbar belongs to the calendar. Sentinels are 1px tall, not zero — a zero-height box flush with the end of the scroll content never reports as intersecting — and the observer carries a `rootMargin` so a day is asked for slightly before its edge is reached.

**`focusDay` and `anchorDay` are different things.** `focusDay` is what the app points the view at (`pinned?.dayStart ?? currentDayStart`); `anchorDay` is the earliest day the user has actually scrolled into view, reported by `ScheduleView`. The anchor is stored against the focus day it was observed under, so it is discarded in the same render when the focus moves — no effect, no clock-driven `setState`. *Go to today* keys off the anchor, which is why it covers both a rollover and a scroll away.

**The viewed day and the current day are separate.** `currentDay` comes from the clock; the day being read is `pinned?.dayStart ?? currentDayStart`, derived rather than stored. `pinned` is `null` until the user commits to something — selecting a row, or opening a dialog — and while it is null the view *is* the clock: the day and the selection both follow it, so a tab left open overnight does the obvious thing. Once pinned, a rollover moves nothing (an open note's `occursAt` was stamped on the old day) and a `role="status"` notice offers **Go to today**, which is `setPinned(null)`. Scrolling is viewport navigation only: it neither pins the view nor moves the selection. *Go to today* is still the only jump there is; a date picker stays deferred.

**Memoise on the day as a number, never on `now`.** `now` is a fresh `Date` every minute, so anything keyed on it — the window, the periods — would be rebuilt each tick and the fetch effect would refire each tick. `currentDayStart`/`focusDayStart` are epoch ms of local midnight and are what everything downstream keys off. A tick must never cause a refetch, and there is a test asserting exactly that.

**Place notes by `occursAt`, never `createdAt`.** `assignNotes` buckets on it and `PeriodRow` prints it beside each note; `createdAt` is only an audit stamp. Test fixtures deliberately set `createdAt` to a different day so the distinction is asserted rather than incidental.

**Pass an `AbortSignal` to every API call** — `getNotesBySchedule(shortName, searchFrom, searchTo, signal)` takes one as a required parameter, wired to the calling effect's cleanup. This is the frontend mirror of the backend's cancellation-token rule above.

**Serialise instants with their offset, and build query strings with `URLSearchParams`.** `notesApi.ts` renders the window bounds as `2026-08-27T00:00:00+01:00` rather than `toISOString()`'s UTC — the bounds are *local* midnights and the offset is what says so. A raw `+` in a query string means a space, so it must be percent-encoded. Frontend tests assert such URLs **structurally** (parse, compare instants, match the format with a regex): a literal expectation only passes in one timezone.

**`useNow` is the only clock read in the app.** `useNow(frozen?)` returns `{ now, readNow }`: `now` is state replaced as the wall clock crosses each minute (nothing in the UI is finer-grained), and `readNow()` is the exact instant for a one-off stamp. It ticks on a self-rescheduling `setTimeout` whose delay is recomputed from the clock each time, *and* resyncs on `visibilitychange`/`focus` — a timer alone misses a suspended tab, a listener alone misses a tab left visible on a second monitor. Components never call `new Date()`: `ScheduleView` and `DaySection` take `now` as a **required** prop. `App`'s optional `now` prop means "frozen here" — supplied, the hook registers no timer and no listeners, which is how the older component tests stay deterministic; ticking is tested by rendering without it under fake timers.

**A new note's `occursAt` is the client's, stamped when the dialog opens.** `occursAtFor(period, now)` in `domain/notes.ts` is `now` for the live slot (so the row reads `09:47`, not `09:00`) and `period.start` for any other. `App.handleTakeNote` computes it with `readNow()`, not the ticked `now`, and holds it in the dialog state — a note begun at 23:58 and finished at 00:03 belongs to the 23:00 slot, and `occursAt` is immutable. `createdAt`/`modifiedAt` stay the server's and are never sent.

**Markdown editing uses `@mdxeditor/editor`.** `NoteEditor` is a `forwardRef` wrapper exposing `MDXEditorMethods` (so a parent reads the markdown via `ref.current.getMarkdown()`) and configures the plugin list and toolbar. Add editor features by extending that plugin list rather than dropping a second editor in. `@mdxeditor/editor/style.css` is imported inside the component.

`README.md` in this folder is still the stock Vite template text.
