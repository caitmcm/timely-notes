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
| `dotnet user-jwts create --audience https://api.timely-notes` | From `TimelyNotes.API/`. A Development-only token for `TimelyNotes.API.http` and curl. The first run per machine also creates the signing key in user secrets. |

Frontend, from `timely-notes-ui/`:

| Command | |
| --- | --- |
| `npm run dev` / `build` / `lint` | Dev server `:5173`; build is `tsc -b` + `vite build` |
| `npm test` | Vitest once (`test:watch` to watch) |
| `npm run test:e2e` | Playwright, **stubbed** lane, headless — the default |
| `npm run test:e2e:integrated` | Starts the API and an `e2e`-mode dev server itself; mints its token with `dotnet user-jwts` |

`npx playwright install chromium` is a one-off before the first E2E run. Never make Playwright's
HTML reporter the default — `show-report` blocks the terminal.

## Navigation

**Backend — `TimelyNotes.Backend/TimelyNotes.API/`**

| Where | What |
| --- | --- |
| `Models/Schedules.cs` | Known spans `{1,3,6}`, `PeriodCountFor`, `IsValidPeriodOrdinal`, `s`-sigil parse/format. |
| `Models/Periods.cs` | `p`-sigil parse/format. `TryParse` takes the Schedule's span first. |
| `Models/Note.cs` | Note entity, keyed `(UserId, ScheduleSpanHours, Day, PeriodOrdinal)`. `NoteDayCount.cs` is the per-day count projection. |
| `Models/User.cs` | The account: `Id` (a v7 `Guid` the app mints) and the provider's `(Issuer, Subject)`. Nothing else. |
| `Models/NoteContent.cs` | Empty-note check: `Normalise` on write, `IsReadable` on read. |
| `Auth/` | `AddNoteAuth` (`Auth0` bearer; in Development also user-jwts' `Bearer`, picked by issuer), `UserResolution` (`iss`+`sub` → `timely:user_id` claim), `UserClaims`. |
| `Repositories/` | `INoteRepository` (`userId` first on every read and delete) and `IUserRepository`, each with memory and Postgres implementations (all singleton), and `NoteStoreRegistration`, which picks the provider for both. |
| `Data/` | `NotesDbContext`, `NoteQueries` (both reads as `IQueryable`), the design-time factory, `Migrations/`. |
| `Endpoints/Notes/` | FastEndpoints REPR: `Request`/`Response`/`Endpoint`/`Validator`, one type per file. Each request binds `UserId` with `[FromClaim]`. |
| `Program.cs` | Registers `TimeProvider.System` and `AddNoteAuth`; `UseAuthentication`/`UseAuthorization` run before FastEndpoints. |
| `TimelyNotes.API.http` | Sample requests for every route, including invalid ones. Needs a `dotnet user-jwts` token. |

**Frontend — `timely-notes-ui/src/`**

| Where | What |
| --- | --- |
| `main.tsx`, `AuthGate.tsx` | `AuthBoundary` › `AuthGate`, which renders nothing while loading, `SignInScreen` signed out, `App` signed in. |
| `auth/` | `AuthBoundary` (picks `oidc` or `static` by `VITE_AUTH_MODE`), `useAuth` (`status`, `email`, `tokens: TokenSource`, `signIn`/`signUp`/`signOut`), `oidc.ts` (`UserManager` settings), `buildGuard.ts` (run by `vite.config.ts`). |
| `App.tsx` | Holds all app state (Schedule, `anchorDay`, `selected`, `calendarMonth`) and the domain calls, and hands `tokens` to every one. Components below it don't fetch. |
| `hooks/useNoteAutosave.ts` | Autosave: debounce, max wait, dirty check, in-flight guard, save status. |
| `hooks/` | `useNow` (only clock read), `useScheduleNotes` (only note fetch), `useNoteDays` (calendar markers). |
| `domain/` | Pure time logic: `schedules`, `periods`, `notes`, `days`, `months`, `window`. No React, no fetch. |
| `types/index.ts` | `DayKey`, `Note`, `Schedule`, `Period`, `SpanHours`. |
| `api/notesApi.ts` | `fetch` wrapper; every call takes a `TokenSource` first and a required `AbortSignal`, and retries once after a renew on `401`. |
| `components/` | `SignInScreen`, `MenuDrawer`, `SchedulePicker`, `ScheduleView`, `DaySection`, `PeriodRow`, `NoteDialog`, `NoteEditor`, `CalendarDialog`, `MonthGrid`, `icons`. |
| `e2e/` | Playwright: `fixtures/app.ts` (extended `test` and `ApiStub`), `fixtures/ScheduleView.ts` (page object), `fixtures/mintToken.ts` (the integrated lane's user-jwts token). `stubbed`: `api-contract`, `calendar`, `layout`, `menu`, `note-dialog`, `window`. `integrated`: `backend`. |

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

Every route needs a bearer token and answers `401` without one, before validation. The user is
the one the token names, never part of a URL or body; another user's note is simply absent, so a
`DELETE` of it is `404`. A user is created on their first authenticated request. Tokens come from
Auth0 (`Auth:Authority`, `Auth:Audience` in `appsettings.json`), and in Development also from
`dotnet user-jwts`. Reads never return empty notes. The validator returns `400` for a bad
Schedule, period or format. There is no Schedule endpoint, no custom middleware and no HTTPS
redirection. The host handles CORS and TLS.

**Stores.** `Database:Provider` selects `Memory` or `Postgres`, for notes and users alike.
`Memory` is the default for CI and all tests; it seeds each user with notes from today − 3 to
today + 3 on their first request. `Postgres` is EF Core, with a `users` table that
`notes.user_id` references. Locally it is `postgresql-x64-18`, with the connection string in user
secrets under `ConnectionStrings:Notes`. Deployed, it is Neon's free plan, with the connection
string in App Service; migrations are run by hand from a developer shell. → `DeployedEnvironment.MD`

**Frontend.** Signed out, the app shows `SignInScreen`, whose **Sign in** and **Create account**
both go to Auth0's hosted page (Authorization Code + PKCE through `oidc-client-ts` and
`react-oidc-context`; session in `sessionStorage`). Sign out is in `MenuDrawer`. A
`VITE_AUTH_MODE=static` build is always signed in with a fixed token; only `--mode e2e` may use it,
and a production build refuses it. `App` holds two separate pieces of state: `anchorDay` (the visible days,
`anchor ± 1`) and `selected` (the selected period). `null` means follow the clock. Only navigation
changes `anchorDay`; `domain/window.ts` does the arithmetic. `Earlier days` and `Later days` move
the window three days. `Go to today` appears only in `CalendarDialog` and in the notice shown when
today is off screen. The Schedule is picked in `MenuDrawer`. Editing uses `@mdxeditor/editor` in
`NoteDialog`, saved by `useNoteAutosave`; `App` updates `useScheduleNotes`'s cache after each write
instead of refetching. There is no router and no state library. `timely-notes-ui/README.md` is
still the Vite template.

**Tests.** xUnit runs against the in-memory store, authenticated by an `X-Test-User` header
scheme (`SignedInAppFixture`), so nothing needs a signing key or Auth0. Playwright has two lanes,
both run the UI in `e2e` mode, with static auth. `stubbed` runs on `127.0.0.1:5174` and answers every
`/api/**` call from a fixture. `integrated` starts the API and a dev server, runs serially, and
signs in with a `dotnet user-jwts` token. `stubbed` has 15 tests and `integrated` 5. `App.test.tsx` and `NoteDialog.test.tsx` mock `NoteEditor` because MDXEditor emits no change
events under jsdom; Playwright tests the real editor.

**Next.** `UserNotes.MD` and `DeployedEnvironment.MD` are done: the deployed app signs in through
Auth0 and keeps notes in Neon. `NowOnTheGrid.MD` is specified and not started.
`EmptyNotePruning.MD` is not scheduled.
