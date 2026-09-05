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
│   │   ├── OneNotePerPeriod.MD    # next: a period holds 0 or 1 notes; the period is the key
│   │   ├── NoteAutosave.MD        # then: save-on-first-content, autosave, PUT upsert + DELETE
│   │   └── EmptyNotePruning.MD    # specified, not scheduled: server-side sweep of blank notes
│   └── done/                      # completed specifications, kept as a record
│       ├── GetNotesBySchedule.MD
│       ├── FrontendSkeleton.MD
│       ├── NotesDateRange.MD
│       ├── LiveClock.MD
│       ├── ScrollingSchedule.MD
│       ├── CalendarNavigation.MD
│       └── PlaywrightE2E.MD
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

**Backend — two read slices, both range-filtered.** `GET /api/schedules/{scheduleShortName}/notes?searchFrom=…&searchTo=…` lists a Schedule's notes (`s1`/`s3`/`s6`) whose `OccursAt` falls in the **half-open** window `[searchFrom, searchTo)`, newest first, served from an in-memory repository seeded across today ± 3 days. Both parameters are required ISO 8601 instants carrying their UTC offset, and a window wider than 7 days is a `400` (`GetNotesByScheduleValidator`). `GET /api/schedules/{scheduleShortName}/note-days` answers the same window as `[{ day, count }]` for the calendar's markers — ascending, days with no notes omitted, capped at **42 days** (`GetNoteDaysByScheduleValidator`, the widest month grid). Repository and endpoint tests cover the ranges, the boundaries and every rejection. Nothing else exists: no create/get-by-id, no Schedule endpoints, no persistence, no auth.

**`note-days` groups in `searchFrom`'s offset.** The bounds already carry the browser's UTC offset, so each `OccursAt` is converted to that offset before its date is taken and the `Day` returned is midnight *there* — the days that come back are the caller's local ones, and the UI reinterprets nothing. Grouping is done in the repository, not the endpoint: it is a query concern, and a real store pushes it into a `GROUP BY`.

**`Note` has two independent timestamps.** `OccursAt` is the slot the note is taken *for* — the only field that decides placement, ordering and filtering, in both projects. `CreatedAt`/`ModifiedAt` are server-set audit stamps recording when it was written, and nothing reads them for placement. When the create endpoint lands, the client sends `occursAt` and the server sets the rest.

**Frontend — three days at a time, a live clock, and a month calendar to move between them.** The app shows the focus day and its two neighbours as day sections in one scroll container (the page itself never scrolls), fetches through the Vite dev proxy, and opens both new and existing notes in a `NoteDialog` wrapping `NoteEditor`. The window never grows: three contiguous days is one request, and a navigation toolbar — *Calendar* and *Go to today* — sits above the scroller and never scrolls away. *Calendar* opens a `CalendarDialog`, a Monday-first month grid marked from the `note-days` route, which re-points the view at any day picked. `useNow` ticks on the minute and resyncs on visibility/focus, so the current-period marker moves and an untouched view rolls over at midnight; a view the user has committed to stays put, and a notice says so whenever the focus day is not the current one. Save still only `console.log`s the markdown and the note's `occursAt` — there is no create/update endpoint. There is no router and no state management library; the selected Schedule, what the user has pinned and the month on show are React state in `App.tsx`. Vitest + React Testing Library are set up and the slice is covered by tests.

**There is also a browser acceptance layer.** 221 Vitest tests cover the units; on top of them sit 59 Playwright specs in the hermetic `stubbed` lane and 4 in the opt-in `integrated` one, covering the journeys and the three things jsdom simulates away — the native `<dialog>`'s modality and its Escape path, real layout (row proportionality, the mount-time scroll into view, a toolbar that stays put), and MDXEditor's typing, toolbar and markdown shortcuts.

## Development approach

We use **Test Driven Development** in both the API and the UI: write a failing test first, then the minimum code to pass it, then refactor. This applies to all new domain code (models, endpoints, components, hooks, etc.), not just bug fixes. The backend has xUnit set up and the frontend has Vitest + React Testing Library.

**The two frontend suites answer different questions, and they run in that order.** TDD the feature with Vitest first — failing unit test, code, refactor — and only once it is implemented, add or extend the Playwright spec covering the journey it added. Vitest answers *is this unit correct*, during construction; Playwright answers *does the assembled app do what the specification promised the user*, once it is built. Playwright is never a substitute for a unit test and is not run during the TDD loop: a behaviour that a unit test can pin down is pinned down by a unit test. When an acceptance spec fails, the fix normally starts with a new failing **unit** test — the acceptance spec reports the symptom, the TDD loop deals with the cause.

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
- `npm test` — Vitest once (`npm run test:watch` to watch). Config lives in `vite.config.ts` (`jsdom`, globals on, `src/test/setup.ts`), which also stubs `HTMLDialogElement.showModal`/`close` since jsdom doesn't implement them. Tests sit next to the code they cover as `*.test.ts(x)`. Vitest's `include` is scoped to `src/`: `e2e/` is Playwright's, and its `test()` refuses to run under any other runner.
- `npm run test:e2e` — the Playwright acceptance suite, stubbed lane, headless. `test:e2e:integrated` runs the lane that needs the API; `test:e2e:ui` and `test:e2e:debug` are for a human and are never on the default path.

**`vite.config.ts` proxies `/api` to `http://localhost:5186`**, so the UI calls the backend same-origin and no CORS config is needed. Dev-only — there is no production API base URL yet.

**Layout inside `src/`:** `main.tsx` (root render), `App.tsx` + `App.css` (shell and schedule styles), `types/` (shared `Note`/`Schedule`/`Period`/`SpanHours`), `domain/` (pure time logic — `schedules.ts`, `periods.ts`, `notes.ts`, `days.ts`, `months.ts`), `hooks/` (`useNow.ts`, `useScheduleNotes.ts`, `useNoteDays.ts`), `api/` (`notesApi.ts`, a `fetch` wrapper returning parsed `Note`s and `NoteDay`s), `components/` (`SchedulePicker`, `ScheduleView`, `DaySection`, `PeriodRow`, `NoteDialog`, `NoteEditor`, `CalendarDialog`, `MonthGrid`), `test/` (Vitest setup), `index.css` (minimal global styles; no design system).

**`App` owns the domain calls.** It runs `buildPeriods` then `assignNotes` per rendered day in one `useMemo` and hands `ScheduleView` a finished `DayView[]`; nothing below `App` calls the domain functions or fetches, so component tests pass in fixed periods. The selected period is stored as a **timestamp**, not a `Period` object — periods are rebuilt whenever the notes or the Schedule change, so a held reference goes stale. It also owns the wanted window, which it hands to `useScheduleNotes` as day starts.

**Days are epoch ms of local midnight, and `domain/days.ts` is the only arithmetic on them.** `addDays` goes through local clock fields rather than 86 400 000 ms, so a DST day still lands on midnight; `contiguousRuns` and `chunkRun` are what keep a request from spanning a cached gap or exceeding the server's 7-day cap.

**`useScheduleNotes` is the only thing that fetches.** It caches every day it has loaded (including days that came back empty), requests only the missing ones, and is scoped to a Schedule — changing Schedule drops the cache and aborts what is in flight. Its `AbortController` is tied to the **Schedule, not the range**: a range change is what starts requests, so aborting on one would cancel the prefetch it just asked for.

**The rendered range is `focusDay ± 1`, derived — never state.** There is no range to grow, correct or reset, and the wanted window *is* the rendered window: no prefetch beyond it, because there is no scroll that could reach further. Three contiguous days sit inside both the server's 7-day cap and `useScheduleNotes`'s 5-day chunk, so a move is one request. `contiguousRuns` still earns its place — a jump from this week to last leaves a hole between the cached days and the wanted ones — and `chunkRun` stays as the cap guard.

**The schedule scrolls; the page does not.** `body` is `overflow: hidden` and `.schedule-view` is the only scroll container, so the scrollbar belongs to the three days. The navigation toolbar is a sibling of that container inside `.schedule`, not part of its content, so it stays put while the days scroll beneath it.

**Navigation is a fixed toolbar, not a control that comes and goes.** *Calendar* and *Go to today* are always present, in that order, above the scroll — pressing *Go to today* while already on today is a harmless no-op, and that is preferable to a button that appears only sometimes. What is conditional is the `role="status"` notice, shown when `focusDayStart !== currentDayStart`: it says what the current day is, and leaves the acting to the toolbar. Scrolling inside the three days is just reading, so it neither pins the view nor raises the notice — the notice means a rollover under a pinned view, or a calendar jump.

**The calendar is a modal `<dialog>`, and it decides nothing.** `CalendarDialog` renders the heading, the month arrows and `MonthGrid`; `App` owns `calendarMonth`, builds the grid with `monthGrid` and interprets a pick. Picking a day pins it with the selection on that day's first period; picking the current day is *Go to today* — `setPinned(null)`. `domain/months.ts` is the only month arithmetic, on the same local-midnight day keys `days.ts` uses.

**`useNoteDays` fetches the markers, and only while the calendar is open.** Same rules as `useScheduleNotes`: cached per Schedule, each grid asked for once, aborted on a Schedule change and on unmount. `enabled` is `isCalendarOpen`, so nothing is requested until it is opened. Counts are not revalidated — a note created in this session will not move a marker until a fresh mount, which is `NoteAutosave.MD`'s problem.

**The viewed day and the current day are separate.** `currentDay` comes from the clock; the day being read is `pinned?.dayStart ?? currentDayStart`, derived rather than stored. `pinned` is `null` until the user commits to something — selecting a row, or opening a dialog — and while it is null the view *is* the clock: the day and the selection both follow it, so a tab left open overnight does the obvious thing. Once pinned, a rollover moves nothing (an open note's `occursAt` was stamped on the old day) and the `role="status"` notice says which day is now current; **Go to today** in the toolbar is `setPinned(null)`. Scrolling is viewport navigation only: it neither pins the view nor moves the selection. The calendar is the other way to move, and choosing from it *is* a commitment.

**Memoise on the day as a number, never on `now`.** `now` is a fresh `Date` every minute, so anything keyed on it — the window, the periods — would be rebuilt each tick and the fetch effect would refire each tick. `currentDayStart`/`focusDayStart` are epoch ms of local midnight and are what everything downstream keys off. A tick must never cause a refetch, and there is a test asserting exactly that.

**Place notes by `occursAt`, never `createdAt`.** `assignNotes` buckets on it and `PeriodRow` prints it beside each note; `createdAt` is only an audit stamp. Test fixtures deliberately set `createdAt` to a different day so the distinction is asserted rather than incidental.

**Pass an `AbortSignal` to every API call** — `getNotesBySchedule` and `getNoteDaysBySchedule` both take `(shortName, searchFrom, searchTo, signal)`, the signal required and wired to the calling effect's cleanup. This is the frontend mirror of the backend's cancellation-token rule above.

**Serialise instants with their offset, and build query strings with `URLSearchParams`.** `notesApi.ts` renders the window bounds as `2026-08-27T00:00:00+01:00` rather than `toISOString()`'s UTC — the bounds are *local* midnights and the offset is what says so. A raw `+` in a query string means a space, so it must be percent-encoded. Frontend tests assert such URLs **structurally** (parse, compare instants, match the format with a regex): a literal expectation only passes in one timezone.

**`useNow` is the only clock read in the app.** `useNow(frozen?)` returns `{ now, readNow }`: `now` is state replaced as the wall clock crosses each minute (nothing in the UI is finer-grained), and `readNow()` is the exact instant for a one-off stamp. It ticks on a self-rescheduling `setTimeout` whose delay is recomputed from the clock each time, *and* resyncs on `visibilitychange`/`focus` — a timer alone misses a suspended tab, a listener alone misses a tab left visible on a second monitor. Components never call `new Date()`: `ScheduleView` and `DaySection` take `now` as a **required** prop. `App`'s optional `now` prop means "frozen here" — supplied, the hook registers no timer and no listeners, which is how the older component tests stay deterministic; ticking is tested by rendering without it under fake timers.

**A new note's `occursAt` is the client's, stamped when the dialog opens.** `occursAtFor(period, now)` in `domain/notes.ts` is `now` for the live slot (so the row reads `09:47`, not `09:00`) and `period.start` for any other. `App.handleTakeNote` computes it with `readNow()`, not the ticked `now`, and holds it in the dialog state — a note begun at 23:58 and finished at 00:03 belongs to the 23:00 slot, and `occursAt` is immutable. `createdAt`/`modifiedAt` stay the server's and are never sent.

**Markdown editing uses `@mdxeditor/editor`.** `NoteEditor` is a `forwardRef` wrapper exposing `MDXEditorMethods` (so a parent reads the markdown via `ref.current.getMarkdown()`) and configures the plugin list and toolbar. Add editor features by extending that plugin list rather than dropping a second editor in. `@mdxeditor/editor/style.css` is imported inside the component.

**Playwright lives in `e2e/`, in two lanes.** `playwright.config.ts` defines both over Chromium only. **`stubbed`** is the default and is hermetic: every `/api/**` request is fulfilled from a fixture, so it needs no backend and no .NET SDK, and it is the lane to run while iterating on a UI change. **`integrated`** (`grep: /@integrated/`, `e2e/backend.spec.ts`) runs the same app against the real API through the real Vite proxy, and holds only the assertions that are *about* the two projects agreeing — the window format is accepted, the seeded notes render, the counts route answers. Keep it small; it is the slow lane.

- **Layout:** `e2e/fixtures/notes.ts` (wire-shaped fixtures), `e2e/fixtures/ScheduleView.ts` (the page object), `e2e/fixtures/app.ts` (the extended `test`), and one spec file per area.
- **`npx playwright install chromium` is a one-off, out-of-tree download** an agent needs before its first run. Without it every spec fails at launch with *"Executable doesn't exist at …\\ms-playwright\\chromium…"*, naming the command to run.
- **The clock is frozen at 20:20 on 25/08/2026** — the instant the `FrontendSkeleton` mockup is drawn at — and the timezone is pinned to `Europe/London` with `en-GB`. `page.clock.install()` runs **before** the first navigation and `pauseAt()` the moment the page is up; installing it behind the frozen instant leaves margin for the load, and pausing before the load strands it on timers that can no longer fire. `install()` + `pauseAt()`, never `setFixedTime` — the rollover journey fast-forwards, which needs an installed clock.
- **A pinned timezone means an E2E spec may assert a literal URL** (`2026-08-24T00:00:00+01:00`), unlike the unit tests, which must assert structurally to pass anywhere. `api-contract.spec.ts` re-runs one spec under `Pacific/Auckland` to keep the offset logic honest.
- **The page object exposes locators, not assertions**, all by ARIA role and accessible name — the same handles the Vitest suite uses, so breaking a row's accessibility breaks both suites. The scroll container is the one exception and is reached by its `data-testid`. Three days render at once, so **every per-day handle goes through `day(heading)`** and every row count is per day: an unscoped `getByRole('option')` matches the same slot three times over and fails strict mode.
- **The `api` fixture stubs two routes, not one** — `**/api/schedules/*/notes*` *and* `**/api/schedules/*/note-days*`, since `notes*` does not match `note-days`. It records what the browser actually asked for, which is a stronger statement about `notesApi.ts` than a `fetch` mock. Count requests through `notesWindows`/`noteDayWindows`, which de-duplicate: `StrictMode` runs an effect twice, and what the specs assert is that no render or clock tick asks for a *new* window.
- **The stubbed lane is served from `npm run build && npm run preview` on `127.0.0.1:5174`**, not the dev server on 5173 — a build so a cold context does not re-transform the editor's module graph per test, `5174` so a run never collides with a developer's own server, and the literal `127.0.0.1` because `localhost` resolves to `::1` here and the mismatch stalls navigation. `workers` is pinned to 2: every worker loads the editor bundle cold, and a wider fan-out starves the preview server.
- **Reporter is `[['list']]`.** Never make the HTML reporter the default — `playwright show-report` starts a server and blocks the terminal, stranding an agent mid-task.

`README.md` in this folder is still the stock Vite template text.
