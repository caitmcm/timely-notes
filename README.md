# Timely Notes

> Like daily notes, but a little more… **timely**.

A note-taking app organised around the clock. Instead of one page per day, every hour —
or three, or six — is its own addressable slot, and the schedule view *is* the index.

**Stack:** .NET 10 · FastEndpoints · React 19 · TypeScript · Vite 8 · Vitest · Playwright ·
xUnit v3 · GitHub Actions → Azure (OIDC, no stored credentials)

---

## The problem

Daily-note systems give you one page per day. By four in the afternoon that page is a wall of
text, and the one thing you actually wanted back — *what did I write during the stand-up?* —
has no address. So you start naming things. Then foldering them. Then tagging them. The
expensive part of a note system turns out not to be writing the note; it is filing it.

Timely Notes takes the other bet: **the slot is the index**.

A note's address is the time it belongs to — `(Schedule, Day, Period)` — and nothing else.
No id, no title, no tags, no folders. The 09:00–12:00 note on a 3-hourly Schedule lives at:

```
/api/schedules/s3/notes/2026-09-05/p4
```

A **Schedule** is a spanning period (1, 3 or 6 hours) and *is* its own identity. Switching
Schedule changes the granularity you read at without ever re-bucketing what was written: a
6-hourly note stays a 6-hourly note. **A period holds at most one note**, so there is no
disambiguation to build and no second note to lose.

The full domain model, including the parts still open, is in
[DESIGN DOCUMENT.MD](DESIGN%20DOCUMENT.MD).

---

## What it does today

- **A three-day scroll** — the focus day and its two neighbours, in one scroll container, under
  a fixed toolbar. Short, fixed-length, and one request to move.
- **A live clock** — the view follows the clock and rolls over at midnight on its own; pin a day
  and rollover moves nothing, with a `role="status"` notice saying which day is now current.
- **A month calendar** — Monday-first grid, marked from a per-day *counts* endpoint so it can
  show which days have notes without downloading a month of markdown.
- **Markdown editing** — `@mdxeditor/editor` in a dialog that opens on an *address*, not on a
  note, so a note begun at 23:58 and finished at 00:03 stays on the old day's 23:00 period.

Reads are done end to end. Writes (`PUT` upsert, autosave, pruning) are the slice in progress.

---

## The interesting engineering

### Time, without instants

The hardest part of a time-addressed app is that "a day" is not a moment. This codebase pushes
timezone all the way down to one line and then never touches it again:

- A day is the **string** `2026-09-05`, branded `DayKey`. The wire form *is* the in-memory form —
  nothing parses in, nothing formats out, ordering is lexicographic.
- **`new Date(dayKey)` is banned.** That is UTC midnight, and it is the exact trap the string key
  exists to remove. Two helpers convert, both through local clock fields, each with a test that
  fails east *and* west of Greenwich.
- **`dayKeyOf(now)` is the single clock-to-calendar conversion** in the frontend, and `useNow` is
  the only clock read. Components take `now` as a required prop.
- **The server has no timezone at all.** It stores a date and an integer. No route takes an
  `?offset=` parameter — that is the plausible helpful addition that would hand the period grid
  back to the server, and the grid is the viewer's local one.

### Backend — .NET 10 + FastEndpoints

- **FastEndpoints REPR**, no MVC controllers: `Request` / `Response` / `Endpoint` / `Validator`,
  one type per file, per endpoint.
- **FluentValidation** beside each endpoint. Required query parameters are declared *nullable* on
  purpose, so an omitted one fails `NotNull()` by name instead of silently binding to `default`.
- **Repository pattern** — filtering and grouping live in the repository, not the endpoint,
  because a real store pushes them into SQL. The in-memory implementation is a placeholder that
  swaps out without touching endpoint logic.
- **Cancellation tokens everywhere, explicitly** — `CancellationToken ct` with no `= default`,
  threaded through every downstream call including `Send.OkAsync(..., ct)`. The frontend mirrors
  it: every API call takes a required `AbortSignal` wired to its effect's cleanup.
- **One place knows the shape of a Schedule** (`Models/Schedules.cs`). Adding a span is a one-line
  edit, and a test enforces that every member divides 24.

### Frontend — React 19, TypeScript, Vite 8

- **No router and no state library**, deliberately. `App.tsx` owns the selected Schedule, the pin,
  the calendar month and the window; nothing below it fetches.
- **A pure domain layer** (`domain/`) — schedules, periods, notes, days, months. No React, no
  fetch, fully unit-testable.
- **Memoise on the day key, never on `now`.** `now` is a fresh `Date` every minute; anything keyed
  on it rebuilds each tick and refires the fetch effect. A test asserts a tick causes no refetch.
- Custom hooks own the seams: `useNow` (the clock), `useScheduleNotes` (the only note fetch),
  `useNoteDays` (calendar markers, fetched only while the calendar is open).

### Testing

| Layer | Tool | Scale |
| --- | --- | --- |
| Backend | xUnit v3 on Microsoft.Testing.Platform | endpoint + repository suites |
| Frontend units | Vitest + Testing Library | ~235 specs |
| Journeys, hermetic | Playwright `stubbed` lane — every `/api/**` call fulfilled from a fixture | ~63 specs |
| Contract | Playwright `integrated` lane — only the assertions about the two projects agreeing | 4 specs |

**Vitest first, Playwright after.** Vitest answers *is this unit correct* during construction;
Playwright answers *does the assembled app deliver the journey* once it is built. A failing
acceptance spec is treated as a symptom — the fix starts with a new failing unit test.

Unit tests assert URLs *structurally* so they pass in any timezone. Only E2E, with its pinned
`Europe/London` zone and a clock frozen at 20:20, may assert a literal date.

---

## How this was built

This project is an experiment in **spec-driven development with an AI agent** — not autocomplete,
but a process the agent is held to. Three artefacts carry it.

### 1. One feature, one document, end to end

Every feature is written up in `feature-docs/todo/<FeatureName>.MD` before any code exists: Goal,
Scope decisions, Architecture, Checklist, Verify, Deferred, Implementation notes. The checklist is
literal `- [ ]` boxes, each one a testable step, ticked **as each test goes green** — never in a
batch at the end. Decisions taken mid-build are appended to that same document, never a second
one. When it is finished it moves to [`feature-docs/done/`](feature-docs/done/) and stays there as
the record and the rationale.

The specification is the memory. The chat transcript is not.

### 2. `CLAUDE.md` as an executable constitution

[CLAUDE.md](CLAUDE.md) is not a description of the repo — it is the set of rules that override the
agent's defaults: navigation tables, the TDD rule, the cancellation-token rule, the code-style rule
that comments are *rare* and must never restate the code, and a **Current state** section kept
honest as the work moves.

### 3. Invariants that name the bug they closed

The part I would point at first. Each entry is a rule *plus the failure it prevents*, so a future
change knows what it is about to reintroduce:

> **The dialog opens on an address, not on a note.** `dialogSlot = { day, period }`, so a note
> begun at 23:58 and finished at 00:03 stays on the old day's 23:00 period.

> **A `PeriodRow` renders its one note as text**, never as a second control; the selected row's
> single *Note* button opens *the* note, existing or empty. A second address inside a row is how
> two notes in one period became constructible.

> **`useScheduleNotes`'s `AbortController` is tied to the Schedule, not the range.** A range change
> is what *starts* requests; aborting on it would cancel the prefetch it just asked for.

Every one of those is a bug that was found, fixed, and then written down so it stays fixed. The
reasoning behind each lives in the `feature-docs/done/` document that produced it.

---

## CI/CD — GitHub Actions to Azure

Two workflows, [one per project](.github/workflows/), each on its own **path filter** so the two
halves build, test and deploy completely independently. There is no shared build.

**[`api.yml`](.github/workflows/api.yml)** — `dotnet test` gates the deploy, then
`dotnet publish` → Azure App Service.

- **OIDC federated credentials**: `azure/login` trades the workflow's `id-token` for a short-lived
  Azure token. There is no publish profile and no stored password — the repository secrets are
  *identifiers*, not credentials.
- A `concurrency` group with `cancel-in-progress: false`, because a deploy is an upload to one
  slot and two must never overlap.

**[`ui.yml`](.github/workflows/ui.yml)** — `npm ci` → `npm test` → Azure Static Web Apps, with
`VITE_API_BASE_URL` injected at build time from a repository variable.

The two apps are wired together in development *only* by the Vite dev proxy (`/api` →
`localhost:5186`). Deployed, the UI reaches the API by its own origin. **CORS and TLS belong to the
host, not the app** — there is no custom middleware and no HTTPS redirection in the API, because
TLS terminates ahead of it.

---

## Running it

```powershell
./run-dev.ps1      # API on :5186 and UI on :5173 together; Ctrl+C stops both
```

Or separately:

| Backend — from `TimelyNotes.Backend/` | |
| --- | --- |
| `dotnet build` | Build |
| `dotnet run --project TimelyNotes.API` | HTTP `:5186`, HTTPS `:7026` |
| `dotnet test` | xUnit v3 |

| Frontend — from `timely-notes-ui/` | |
| --- | --- |
| `npm run dev` | Dev server `:5173` |
| `npm run build` | `tsc -b` + `vite build` |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright, stubbed lane (`npx playwright install chromium` first) |
| `npm run test:e2e:integrated` | The lane that needs the API running |

## Layout

| Path | What |
| --- | --- |
| [DESIGN DOCUMENT.MD](DESIGN%20DOCUMENT.MD) | The domain model and the goals — intent, not a plan |
| [CLAUDE.md](CLAUDE.md) | The rules the agent works under, including the invariants |
| [feature-docs/](feature-docs/) | `WORKFLOW.MD`, the feature in progress, and the finished record |
| [TimelyNotes.Backend/](TimelyNotes.Backend/) | ASP.NET Core Web API, own solution |
| [timely-notes-ui/](timely-notes-ui/) | React + TypeScript + Vite, own npm package |

## Status

Honest about what is not there: **no persistence** (an in-memory repository, seeded across today
± 3 days), **no auth**, and **no write endpoint yet** — save currently `console.log`s. Postgres
with JSONB and Keycloak are candidates recorded in the design document, not commitments.

Next up: `NoteAutosave.MD` — save-on-first-content, autosave, `PUT` upsert and `DELETE`.
