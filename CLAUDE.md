# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workspace hierarchy

The repo root is a plain folder (not a git repository yet) holding two independent projects plus the planning docs:

```
timely-notes/
├── CLAUDE.md                      # this file
├── DESIGN DOCUMENT.MD             # domain model + goals (source of truth for "what")
├── TODO-<Slice>.MD                # the one slice currently being worked on (absent when idle)
├── done-docs/                     # completed TODO docs, kept as a record
│   └── TODO-GetNotesBySchedule.MD
├── TimelyNotes.Backend/           # ASP.NET Core Web API (.NET 10) — its own solution
└── timely-notes-ui/               # React + TypeScript frontend (Vite) — its own npm package
```

The two projects are **not integrated**: there is no dev-server proxy, no `.env` pointing the UI at the API, and no shared build. There is also no root README and no CI config.

## Planning docs and workflow

- **`DESIGN DOCUMENT.MD`** describes the domain model (Instance → Schedule → Note), the backend/frontend goals, and the open questions (persistence, auth, CI/CD). It is a statement of intent, not an implementation plan — consult it before designing anything new, and treat unresolved items there as genuinely undecided.
- **Work happens one vertical slice at a time.** A slice gets its own `TODO-<SliceName>.MD` at the repo root, derived from the design document: goal, architecture notes, then a checklist ticked off as the work lands.
- **When a slice is finished, its TODO doc moves into `done-docs/`** rather than being deleted — `done-docs/TODO-GetNotesBySchedule.MD` is the worked example of the format and level of detail expected.
- Only outstanding TODO docs live at the root. If the root has no `TODO-*.MD`, the last slice is done and the next one needs planning from the design document before code is written.

## Current state

**Backend — one vertical slice complete.** `GET /api/schedules/{scheduleShortName}/notes` lists the notes for a Schedule (`s1`/`s3`/`s6`), served from an in-memory repository seeded with example data, with repository and endpoint tests. Nothing else exists: no create/get-by-id, no Schedule endpoints, no persistence, no auth.

**Frontend — editor spike only, no test framework.** `src/App.tsx` renders a heading, a `NoteEditor` component wrapping MDXEditor, and a Save button that just `console.log`s the markdown. There is no router, state management, API client, or test framework, and nothing calls the backend yet. Per the TDD rule below, installing a test framework (e.g. Vitest + React Testing Library) is the prerequisite for the first real piece of frontend domain logic.

## Development approach

We use **Test Driven Development** in both the API and the UI: write a failing test first, then the minimum code to pass it, then refactor. This applies to all new domain code (models, endpoints, components, hooks, etc.), not just bug fixes. The backend has xUnit set up; the frontend does not — don't write feature code ahead of the test setup.

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

**Layout inside `TimelyNotes.API`:** `Models/` (entities), `Repositories/` (interfaces and implementations side by side), `Endpoints/` (FastEndpoints). Repositories abstract persistence so the store can be swapped later; `InMemoryNoteRepository` is registered as a **singleton** so its seeded state survives across requests.

## Frontend — `timely-notes-ui`

- React 19 + TypeScript, built with Vite 8. Package manager: npm.
- `npm run dev` — start the dev server (default `http://localhost:5173`)
- `npm run build` — type-check (`tsc -b`) and build (`vite build`)
- `npm run lint` — ESLint (flat config in `eslint.config.js`; basic, non-type-aware rules)
- `npm run preview` — preview a production build

**Layout inside `src/`:** `main.tsx` (root render), `App.tsx` (current shell), `components/` (e.g. `NoteEditor.tsx`), `index.css` (minimal global styles — a `color-scheme` and a body margin reset; no design system yet).

**Markdown editing uses `@mdxeditor/editor`.** `NoteEditor` is a `forwardRef` wrapper exposing `MDXEditorMethods` (so a parent reads the markdown via `ref.current.getMarkdown()`) and configures the plugin list and toolbar. Add editor features by extending that plugin list rather than dropping a second editor in. `@mdxeditor/editor/style.css` is imported inside the component.

`README.md` in this folder is still the stock Vite template text.
