# TODO

Actionable steps derived from `DESIGN DOCUMENT.MD`. Updated as work progresses.

## Current goal

Backend: first vertical slice — **list notes for a Schedule**. ✅ Complete.

`GET /api/schedules/{shortName}/notes` returns the notes for that Schedule, backed by an in-memory repository seeded with example data on startup. `shortName` is the Schedule's short name per its spanning period: `s1` (1-hourly), `s3` (3-hourly), `s6` (6-hourly).

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Architecture

Single project, no layer-splitting for now:

- **`TimelyNotes.API`** — everything lives here.
  - `Models/` — entities (e.g. `Note`).
  - `Repositories/` — repository interfaces and implementations (e.g. `INoteRepository`, `InMemoryNoteRepository`) side by side.
  - `Endpoints/` — FastEndpoints, REPR pattern (Request/Response/Endpoint, one endpoint per route).
- **`TimelyNotes.API.Tests`** — xUnit. References `TimelyNotes.API`.

### 1. Solution scaffolding

- [x] Create `TimelyNotes.API.Tests` xUnit project (`dotnet new xunit`), referencing `TimelyNotes.API`.
- [x] Add the test project to `TimelyNotes.Backend.slnx`.
- [x] Confirm `dotnet build` and `dotnet test` both run clean (empty test project) before writing any domain code.

### 2. Models (`TimelyNotes.API/Models`)

- [x] `Note`: `Id`, `ScheduleShortName`, `Content` (markdown text), `CreatedAt`, `ModifiedAt`. Keep minimal — just enough to satisfy the list endpoint; extend when Create/Get-by-Id land.

### 3. Repositories (`TimelyNotes.API/Repositories`)

- [x] `INoteRepository` interface: starts with `GetBySchedule(string scheduleShortName)`.
- [x] `InMemoryNoteRepository : INoteRepository` — backed by a `List<Note>` seeded with a few example notes at construction/startup.
- [x] Test first: write the `InMemoryNoteRepository` test (seeded data returned, filtered by schedule) before implementing.

### 4. Endpoints (`TimelyNotes.API/Endpoints`)

- [x] Register `INoteRepository` → `InMemoryNoteRepository` as a singleton in `Program.cs` (in-memory state needs to survive across requests).
- [x] `Endpoints/Notes/` folder: `GetNotesByScheduleEndpoint` (REPR: `Request`, `Response`, `Endpoint`) mapped to `GET api/schedules/{scheduleShortName}/notes`.
  - Request: route param `scheduleShortName` (e.g. `s1`, `s3`, `s6`).
  - Response: list of notes (id, content, createdAt, modifiedAt) for that schedule.
- [x] Test first: endpoint test (via FastEndpoints' test client or a WebApplicationFactory-style integration test) asserting a 200 and the seeded example notes for a known schedule shortname.

### 5. Verify

- [x] `dotnet test` passes for the full slice (repository test + endpoint test).
- [x] `dotnet run --project TimelyNotes.API`, hit `GET http://localhost:5186/api/schedules/{shortname}/notes` manually (or via `TimelyNotes.API.http`) and confirm example notes come back.

## Deferred (not in this slice)

- Get-by-Id and Create endpoints for notes.
- Schedule endpoints (create, list) — schedules are hardcoded/assumed to exist for now.
- Real persistence (file system / SQL / NoSQL) — open question per design doc.
- Auth/multi-user.
- Frontend work — starts after this backend slice is in place.
