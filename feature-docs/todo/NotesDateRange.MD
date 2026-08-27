# Notes date range

## Goal

Backend: **make `GET /api/schedules/{scheduleShortName}/notes` answer for a date range instead of for everything**, and give a Note its own idea of *when it is for*.

Two changes, one feature:

1. **`OccursAt`** joins the `Note` model — the time the note is taken **for**, i.e. the slot it sits in on its Schedule. `CreatedAt` goes back to meaning only *when the note was written*, a server-set audit stamp. Until now `CreatedAt` did both jobs, which stops working the moment a user writes a note against yesterday or next Tuesday.
2. **`searchFrom` / `searchTo`** become required query parameters. The endpoint returns every note in the Schedule whose `OccursAt` falls in the **half-open** range `[searchFrom, searchTo)`, newest first.

Half-open is the point of the whole design: the UI will fetch three days at a time as the user scrolls, and consecutive requests must not return the same note twice.

The frontend keeps working — it starts sending a default window of **today ± 1 day** and buckets notes by `OccursAt` — but the scrolling view itself is a separate feature (see **Deferred**).

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

- **`OccursAt` is a new field, not a rename.** `CreatedAt` and `ModifiedAt` stay on the model and on the wire. Slotting, filtering and ordering all move to `OccursAt`; nothing reads `CreatedAt` for placement any more.
- **Half-open `[searchFrom, searchTo)`.** `searchFrom` inclusive, `searchTo` exclusive — matching `isCurrentPeriod` and `buildPeriods` in the UI, which are already half-open. A note at exactly `searchTo` belongs to the next window.
- **`DateTimeOffset`, not `DateOnly`.** The client sends offset-bearing ISO 8601 instants (`2026-08-27T00:00:00+01:00`). Days are local midnights in the browser and the server has no idea what timezone the caller is in, so the boundary instants are the caller's to compute. Comparison is instant-to-instant throughout.
- **Both parameters are required.** No implicit "just today" default on the server — an omitted parameter is a `400`, not a guess. The *client* supplies the default window: today − 1 day to tomorrow + 1 day, three days in all.
- **Maximum range is 7 days.** A `searchTo - searchFrom` greater than 7 days is a `400`. One request can't ask for the whole history, and the UI's 3-day windows sit comfortably inside the cap.
- **This is a breaking change to the existing route**, deliberately. Existing endpoint tests, `TimelyNotes.API.http` and `notesApi.ts` are all updated as part of this feature.
- **Only a minimal frontend change here.** `getNotesBySchedule` gains the range parameters and the UI buckets by `OccursAt`. No scrolling, no day navigation, no `Today` button — the app still shows one day.
- **No Schedule short-name validation.** An unknown short name still returns an empty list, exactly as today. Out of scope.
- **No pagination.** A 7-day window is small enough to return whole.

## Architecture

All backend changes sit in `TimelyNotes.Backend/TimelyNotes.API`, in the folders that already exist:

- `Models/Note.cs` — add `OccursAt`.
- `Repositories/INoteRepository.cs` + `InMemoryNoteRepository.cs` — `GetBySchedule` takes the range; the seed spreads notes across several days so the filter has something to bite on.
- `Endpoints/Notes/` — `GetNotesByScheduleRequest` gains two query parameters, a new `GetNotesByScheduleValidator` rejects bad ranges, `NoteResponse` gains `occursAt`.

The filter lives in the **repository**, not the endpoint: it is a query concern, and a real store will push it down to the database rather than materialising every note and filtering in memory.

Frontend touch-points, kept as small as possible: `types/index.ts` (`Note.occursAt`), `api/notesApi.ts` (range parameters), `domain/periods.ts` (`assignNotes` buckets by `occursAt`), `App.tsx` (computes the default window).

### 1. Model (`TimelyNotes.API/Models`)

- [ ] Test first: a repository test that pins the distinction — a note whose `OccursAt` is inside the window and whose `CreatedAt` is outside it **is** returned, and the reverse case is not.
- [ ] Add `OccursAt` (`required DateTimeOffset`, `init`) to `Note`, documented as *the time the note is taken for — the slot it occupies on its Schedule*, immutable like the Schedule assignment.
- [ ] Amend the `CreatedAt` doc comment to say it is the write time and plays no part in slotting.

### 2. Repository (`TimelyNotes.API/Repositories`)

- [ ] Test first, covering: notes inside the range come back; a note at exactly `searchFrom` is included; a note at exactly `searchTo` is excluded; notes outside the range are dropped; another Schedule's notes in the same range are dropped; results are newest-first by `OccursAt`; a range containing nothing returns an empty list, not null.
- [ ] Change `INoteRepository.GetBySchedule` to `GetBySchedule(string scheduleShortName, DateTimeOffset searchFrom, DateTimeOffset searchTo, CancellationToken ct)`. Keep `ct` without a default, per `CLAUDE.md`.
- [ ] Document the half-open contract on the interface — it is the part a future SQL implementation is most likely to get wrong.
- [ ] Implement in `InMemoryNoteRepository`: filter on `ScheduleShortName`, then `OccursAt >= searchFrom && OccursAt < searchTo`, ordered by `OccursAt` descending.
- [ ] Reseed: keep the existing example notes but spread them over **today − 3 days to today + 3 days**, so a 3-day window returns a strict subset and scroll-driven fetches have something to load. Each Schedule keeps at least one note on today.
- [ ] Seeded `OccursAt` stays anchored to local midnight today, as now; seeded `CreatedAt`/`ModifiedAt` are the construction time, so the seed itself demonstrates that the two are independent.
- [ ] Amend the existing "seed is anchored to today" test: it now asserts the seeded `OccursAt` values span the ±3 day window **and** include the current date.

### 3. Endpoint (`TimelyNotes.API/Endpoints/Notes`)

- [ ] Test first: a `200` for a valid window returning only that window's notes, plus a `400` for each rejection below.
- [ ] `GetNotesByScheduleRequest` gains `SearchFrom` and `SearchTo` (`DateTimeOffset`), bound from the query string, documented as half-open with an ISO 8601 example including the offset.
- [ ] `GetNotesByScheduleValidator : Validator<GetNotesByScheduleRequest>` (FluentValidation, bundled with FastEndpoints), rejecting: a missing or unparseable parameter; `SearchTo <= SearchFrom`; a span greater than 7 days. Each message names the parameter and the rule.
- [ ] Express the cap as a single `TimeSpan.FromDays(7)` constant, so the number lives in one place.
- [ ] Endpoint passes both values to the repository and threads `ct` through every call, including `Send.OkAsync(..., ct)`.
- [ ] `NoteResponse` gains `occursAt`; `createdAt` and `modifiedAt` stay.
- [ ] Update the endpoint `Summary` to describe the range behaviour.
- [ ] Update `TimelyNotes.API.http` — the `s1`/`s3`/`s6` requests now carry `?searchFrom=...&searchTo=...`.

### 4. Frontend — keep the app working

- [ ] Test first in each case; these are the minimum changes that keep the day view green against the new contract.
- [ ] `Note` in `types/index.ts` gains `occursAt: Date`; `notesApi.ts` maps it from the wire alongside the existing fields.
- [ ] `getNotesBySchedule(shortName, searchFrom, searchTo, signal)` — the two `Date`s are serialised as offset-bearing ISO strings and appended as query parameters. Tests assert the URL, the encoding, and the existing abort and error behaviour.
- [ ] `assignNotes` buckets by `occursAt` rather than `createdAt`. Update `domain/periods.test.ts` accordingly, keeping the non-UTC-offset test.
- [ ] `App.tsx` computes the default window from its frozen `now` — local midnight of the previous day, to local midnight of the day after tomorrow (three days, half-open) — and passes it to the fetch. The view still renders today only; the extra days are fetched and unused, which is what the scrolling feature will build on.

### 5. Verify

- [ ] `dotnet test` from `TimelyNotes.Backend/` — all green, including the new range tests.
- [ ] `dotnet build` from `TimelyNotes.Backend/` — no new warnings.
- [ ] `npm test`, `npm run build` and `npm run lint` from `timely-notes-ui/` — all green.
- [ ] `./run-dev.ps1` from the repo root, then in the browser: today's notes still render for each Schedule, and the network tab shows one request per Schedule change, carrying both parameters.
- [ ] Manually via `TimelyNotes.API.http`: a valid window returns only its notes; a window with no notes returns `[]`; an 8-day window returns `400`; a missing parameter returns `400`; two adjacent 3-day windows return no note twice.

## Deferred

- **The Create endpoint — called out explicitly.** `POST /api/schedules/{shortName}/notes` does not exist yet, and this feature settles what its body looks like: the client supplies **`occursAt`** (the slot the user is writing into, offset-bearing), and the server sets `CreatedAt`/`ModifiedAt` itself. The client never sends `createdAt`. Until that endpoint lands, saving a note still only `console.log`s the markdown, which remains correct.
- **`ScrollingSchedule.MD` — the next specification.** Continuous vertical scroll through past and future days, unbounded in both directions, fetching the next **3 days** in the direction of travel and prefetching **3 days** ahead of the viewport, plus a **Today** button that jumps back to the current day. It builds directly on the range endpoint delivered here. Settled alongside it: opening an existing note is **editable** — write-once has been dropped from `DESIGN DOCUMENT.MD`, so content can be corrected while `OccursAt` stays fixed.
- Get-by-Id for notes, and any update or delete.
- Schedule endpoints, and validating the Schedule short name on this route.
- Real persistence — the half-open range filter is written so it can be pushed down into a query when the store is swapped.
- Auth/multi-user.

## Implementation notes

_(filled in by the implementing agent)_
