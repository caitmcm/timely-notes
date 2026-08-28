# Note autosave

## Goal

**A note exists from the moment its editor opens, and keeps itself saved while it is open.**

Pressing **Note** on a period no longer opens a scratch buffer that is thrown at the server
when the user remembers to press Save. It creates the note — one `POST`, with the
`occursAt` stamp `LiveClock.MD` settles and empty content — and the editor then edits a real,
identified note, autosaving it as the user types.

Delivering that necessarily delivers the two endpoints the design document has been waiting
for, so this feature is all of:

1. **`POST /api/schedules/{scheduleShortName}/notes`** — creates a note in a Schedule at a
   client-supplied `occursAt`. The server sets `Id`, `CreatedAt` and `ModifiedAt`.
2. **`PUT /api/schedules/{scheduleShortName}/notes/{id}`** — replaces a note's **content**
   only, and re-stamps `ModifiedAt`. `OccursAt` and the Schedule are immutable, per
   `DESIGN DOCUMENT.MD`.
3. **Create-on-open plus autosave in the UI** — the initial save when the dialog opens, then
   a debounced `PUT` after typing stops, a forced save during sustained typing, and a flush
   when the dialog closes or the tab is hidden.
4. **The end of `Save`/`Cancel`.** With the note created on open, a `Cancel` that claimed to
   discard would be lying. The dialog gets **Done** and a save-status line instead. This is
   the one part of the feature that needs sign-off — see **Scope decisions**.

It also closes two things left open elsewhere: `DESIGN DOCUMENT.MD`'s *concurrent edits to one
note* question (last-write-wins, decided below), and `LiveClock.MD`'s deferred `TimeProvider`
seam, which this feature is the first to actually need.

Following TDD (per `CLAUDE.md`): a failing test before each piece of code, xUnit v3 on the
backend and Vitest + React Testing Library on the frontend.

**Depends on `LiveClock.MD`.** `occursAt` is stamped when the dialog opens, which is only
correct once the clock is live — that is the whole reason the ordering matters. Do not start
this before that feature is in `done/`.

## Scope decisions

- **The initial save happens when the editor opens, not on the first keystroke.** As
  requested. The alternative — create lazily on first change — avoids empty notes but gives
  up the property that makes create-on-open worth having: from the instant the editor is on
  screen, a crash, a closed lid or a reload loses nothing, and every later write is a plain
  update against a known id rather than a create-or-update decision made under a race.
- **The consequence, stated plainly: pressing Note and changing your mind leaves an empty
  note.** There is no delete endpoint, and `DESIGN DOCUMENT.MD` says "No delete for now", so
  this feature cannot clean up after itself. `noteExcerpt` already renders such a row as
  *Empty note*, so it is legible rather than broken, and an empty slot is cheap in a log
  addressed by time. **This is the decision worth revisiting before implementation starts:**
  the fix is a `DELETE` restricted to empty notes (small, and reopens a design-document
  decision), or a server-side prune of empty notes on list. Neither is specified here; both
  are in **Deferred** with the argument for each.
- **`Save`/`Cancel` become `Done`.** Autosave makes `Save` redundant and `Cancel` false —
  by the time it is pressed, the note is already on the server, and honouring the word would
  need the delete this feature does not have. `Done` flushes any pending write and closes;
  Escape does the same. A save-status line (`Saved 12:03` / `Saving…` / `Not saved`) replaces
  the reassurance the Save button used to give. **If discard matters more than the initial
  save, that is a different feature and this one should not be built as specified** — the
  concern is recorded, and the spec continues as asked.
- **Debounced-on-idle, with a ceiling — not a fixed interval.** Save 2 seconds after the last
  change, and force a save every 10 seconds of continuous typing so a long paragraph is never
  more than ten seconds from safety. An idle editor issues **nothing**: an unchanged buffer is
  not written, so leaving a dialog open all afternoon is silent. A fixed `setInterval` would
  write the same content repeatedly and put avoidable load on a store that does not exist yet.
- **Flush on close, on `visibilitychange` → hidden, and on `pagehide`.** Closing the dialog or
  switching tabs is exactly when the debounce timer is most likely to be mid-wait.
- **The autosave timer is not the clock.** `useNow` (from `LiveClock.MD`) answers *what time is
  it*; autosave asks *how long since the last change*. They stay separate hooks — but the
  status line's timestamp is a clock read, so it comes from `useNow`'s `readNow()`, never from
  a `new Date()` inside the dialog. `CLAUDE.md`'s rule holds.
- **Content-only updates; `occursAt` is not on the wire for `PUT`.** The slot is immutable, so
  the safest update body is the one that cannot express a move. A `PUT` carrying a different
  `occursAt` is impossible rather than rejected.
- **Concurrent edits: last-write-wins, decided.** The server sets `ModifiedAt` on every update
  and the client never sends it — `DESIGN DOCUMENT.MD`'s own proposal. Autosave makes
  collisions more likely (two tabs on one note now write without anyone pressing a button) and
  makes optimistic concurrency more annoying, not less: an autosave that fails with `412`
  cannot ask the user anything useful mid-keystroke. Single-user, one editor per note in
  practice — take the simple rule now, and revisit with auth, when "who won" starts to matter.
  This feature updates the open question in `DESIGN DOCUMENT.MD` to record the decision.
- **`201` with the created note in the body, and no `Location` header.** A `Location` must
  resolve, and get-by-id does not exist yet; a header pointing at a `404` is worse than no
  header. The client needs the `id` and the stamps, and gets both in the body.
- **The server reads the clock through `TimeProvider`.** `CreatedAt`/`ModifiedAt` are the first
  server-set times in a testable path, so register `TimeProvider.System` and inject it rather
  than calling `DateTimeOffset.Now` in a handler — that is the difference between asserting the
  stamps and asserting that they are "roughly now".
- **The in-memory store becomes writable, so it needs a lock.** It is a singleton, and reads
  currently walk a bare `List<Note>` with no synchronisation. That is safe only while nothing
  writes; adding `POST`/`PUT` makes it a genuine race.
- **Optimistic local state, no refetch after a save.** `App` inserts the created note into its
  own `notes` state and replaces it on each successful update, so closing the dialog shows the
  note in its row immediately. Refetching a 3-day window after every keystroke-batch would be
  absurd.

## Architecture

### Backend — `TimelyNotes.Backend/TimelyNotes.API`

- `Models/Note.cs` — unchanged in shape. Stays a `class`, not a `record`: an update copies it
  explicitly, and value equality would change what the existing repository tests assert.
- `Repositories/INoteRepository.cs` / `InMemoryNoteRepository.cs` — `Add` and `UpdateContent`
  join `GetBySchedule`; `_notes` gets a lock covering reads and writes.
- `Endpoints/Notes/` — `CreateNoteRequest` / `CreateNoteValidator` / `CreateNoteEndpoint`, and
  `UpdateNoteRequest` / `UpdateNoteValidator` / `UpdateNoteEndpoint`, one type per file beside
  the existing `GetNotesBySchedule*`. Both reuse `NoteResponse`.
- `Program.cs` — `builder.Services.AddSingleton(TimeProvider.System)`.
- `TimelyNotes.API.Tests` — `Microsoft.Extensions.TimeProvider.Testing` for `FakeTimeProvider`.

### Frontend — `timely-notes-ui/src`

- `api/notesApi.ts` — `createNote(shortName, occursAt, content, signal)` and
  `updateNote(shortName, id, content, signal)`, both returning a parsed `Note`, both reusing
  `toOffsetIso` and taking a required `AbortSignal`.
- `hooks/useNoteAutosave.ts` — the engine, beside `useNow` in the folder `LiveClock.MD` adds.
  Owns the debounce, the ceiling, the dirty check, the in-flight guard and the save status;
  knows nothing about MDXEditor or about periods.
- `components/NoteEditor.tsx` — forwards an `onChange` from MDXEditor. Still the only place
  the plugin list lives.
- `components/NoteDialog.tsx` — drives `useNoteAutosave`, renders the status line, and swaps
  `Save`/`Cancel` for `Done`.
- `App.tsx` — passes `occursAt` (stamped in `handleTakeNote`, per `LiveClock.MD` §4) and the
  Schedule down, and merges created/updated notes into `notes`.

Flow for a new note: **Note** pressed → `App` stamps `occursAt` → dialog mounts → `POST` →
`App` merges the created note and the dialog switches to update mode → typing → debounced
`PUT`s → **Done** flushes and closes. Flow for an existing note: dialog mounts in update mode,
no `POST`, first change starts the same loop.

## Checklist

### 1. Server clock seam (prerequisite)

- [ ] Test first: a create endpoint test using `FakeTimeProvider` asserts the created note's
      `CreatedAt` is exactly the fake instant — impossible before this item exists.
- [ ] Add `Microsoft.Extensions.TimeProvider.Testing` to `TimelyNotes.API.Tests`.
- [ ] Register `TimeProvider.System` as a singleton in `Program.cs`; endpoints take it by
      constructor injection. No handler calls `DateTimeOffset.Now` directly.

### 2. Repository — writes (`TimelyNotes.API/Repositories`)

- [ ] Test first, covering: an added note is returned by a later `GetBySchedule` whose window
      contains its `OccursAt`; adding does not disturb the seed; `UpdateContent` changes the
      content and the `ModifiedAt` and leaves `Id`, `OccursAt`, `CreatedAt` and
      `ScheduleShortName` untouched; updating an unknown id returns `null`; updating an id that
      belongs to a *different* Schedule returns `null` rather than crossing the boundary.
- [ ] `Task<Note> Add(Note note, CancellationToken ct)` on `INoteRepository` — `ct` with no
      default, per `CLAUDE.md`. Document that the caller supplies a fully-stamped note.
- [ ] `Task<Note?> UpdateContent(string scheduleShortName, Guid id, string content,
      DateTimeOffset modifiedAt, CancellationToken ct)` — returns the updated note, or `null`
      when no note with that id exists in that Schedule. Document that only content and
      `ModifiedAt` move, and that this is last-write-wins by design.
- [ ] Implement both in `InMemoryNoteRepository`; the update replaces the stored instance with
      an explicit copy, so `Note` keeps its `init`-only members.
- [ ] Guard `_notes` with a lock across `GetBySchedule`, `Add` and `UpdateContent` — the store
      is a singleton and, from this feature on, concurrently mutated. Add a test that
      concurrent `Add`s all land.

### 3. Create endpoint (`TimelyNotes.API/Endpoints/Notes`)

- [ ] Test first: `201` with the created note in the body; the response `occursAt` matches what
      was sent, offset and all; `createdAt` and `modifiedAt` are the `FakeTimeProvider` instant
      and are equal to each other; the note then appears in a `GET` for a window containing it;
      plus a `400` per rule below.
- [ ] `CreateNoteRequest`: `ScheduleShortName` from the route, `OccursAt` (`DateTimeOffset?`,
      nullable so a missing value fails `NotNull()` and names itself — the lesson recorded in
      `NotesDateRange.MD`) and `Content` (`string?`) from the body.
- [ ] `CreateNoteValidator`: `OccursAt` required; `Content` not null — but **empty is valid**,
      because create-on-open sends an empty note by design; content no longer than a stated
      maximum, expressed as one constant.
- [ ] `CreateNoteEndpoint` — `Post("api/schedules/{scheduleShortName}/notes")`, builds the
      `Note` with a new `Guid` and `TimeProvider.GetUtcNow()` for both stamps, calls
      `Add`, and sends `201` with a `NoteResponse`. Thread `ct` through every call including
      the send.
- [ ] `Summary` describing the create contract, and stating that `createdAt`/`modifiedAt` are
      server-set and ignored if sent.
- [ ] No `Location` header until get-by-id exists — record the reason in the endpoint remarks.

### 4. Update endpoint (`TimelyNotes.API/Endpoints/Notes`)

- [ ] Test first: `200` with the new content; `modifiedAt` advances to the fake instant while
      `createdAt` and `occursAt` do not move; two updates in a row both apply (last-write-wins);
      `404` for an unknown id and for an id belonging to another Schedule; `400` for null
      content and for over-long content.
- [ ] `UpdateNoteRequest`: `ScheduleShortName` and `Id` from the route, `Content` from the body.
      No `occursAt` — the slot is immutable and the request type is where that is enforced.
- [ ] `UpdateNoteValidator` sharing the content rule with create, so the limit lives in one
      place.
- [ ] `UpdateNoteEndpoint` — `Put("api/schedules/{scheduleShortName}/notes/{id}")`, calls
      `UpdateContent` with `TimeProvider.GetUtcNow()`, sends `200` or `404`.
- [ ] Add create and update requests to `TimelyNotes.API.http`, including an empty-content
      create, so the flow is exercisable by hand.

### 5. API client (`src/api/notesApi.ts`)

- [ ] Test first for each: the method, the URL, the JSON body, the parsed result, a non-2xx
      throw, and abort behaviour — matching how `getNotesBySchedule` is already tested.
- [ ] `createNote(shortName, occursAt, content, signal)` — `POST`, body
      `{ occursAt: toOffsetIso(occursAt), content }`, returns the parsed `Note`. Assert the
      body's `occursAt` **structurally** (parse and compare instants, match the offset format
      with a regex): a literal string only passes in one timezone, per `NotesDateRange.MD`.
- [ ] `updateNote(shortName, id, content, signal)` — `PUT`, body `{ content }`, returns the
      parsed `Note`. A test asserts the body carries no `occursAt`, `createdAt` or `modifiedAt`.

### 6. The autosave engine (`src/hooks/useNoteAutosave.ts`)

- [ ] Test first throughout, with `vi.useFakeTimers()` and a stubbed save function.
- [ ] `useNoteAutosave({ save, initialContent, createOnMount })` returns
      `{ status, onChange, flush }`, where `status` is
      `'idle' | 'saving' | 'saved' | 'failed'` plus the instant of the last successful save.
- [ ] With `createOnMount`, exactly one save fires on mount, before any change, and the id it
      returns is used by every later save. Assert it fires once under React 19 StrictMode's
      double-mount — this is the item most likely to create two notes per press.
- [ ] A change schedules a save 2 seconds later; further changes inside that window reset the
      timer; the save carries the **latest** content, not the content at the first change.
- [ ] Continuous changes force a save every 10 seconds regardless of the debounce — assert with
      a change every second for 25 seconds that saves land at ~10s and ~20s.
- [ ] An unchanged buffer never saves: no change, no request, however long the dialog stays
      open. Assert zero calls after minutes of fake time.
- [ ] `flush()` saves immediately when dirty, resolves when the write settles, and is a no-op
      when clean.
- [ ] Only one save is in flight at a time; a change arriving mid-save schedules the next one
      rather than racing it, and the last content always wins.
- [ ] A failed save sets `'failed'`, keeps the content dirty, and retries on the next flush or
      the next debounce — nothing is dropped. A subsequent success clears the state.
- [ ] Unmount clears timers and aborts the in-flight request; no state update after unmount.

### 7. The dialog (`src/components/NoteDialog.tsx`, `NoteEditor.tsx`)

- [ ] Test first in `NoteDialog.test.tsx`; the existing tests move from Save-button assertions
      to autosave assertions.
- [ ] `NoteEditor` forwards an `onChange` to MDXEditor, keeping its `MDXEditorMethods` ref.
- [ ] Opening on a **new** note issues the create immediately, with the `occursAt` handed down
      and empty content, and the row's note appears in `App` without a refetch.
- [ ] Opening on an **existing** note issues no create, and the first change updates it.
- [ ] The status line reads `Saving…`, then `Saved HH:MM` using `formatTimeOfDay` and the
      instant from `readNow()`; a failure reads `Not saved — retrying` and is announced with
      `role="status"`.
- [ ] `Save`/`Cancel` are replaced by a single **Done** that flushes and closes; Escape
      (`onCancel`) flushes and closes the same way.
- [ ] If the final flush fails, the dialog stays open with the failure visible rather than
      closing over unsaved text; a second **Done** closes anyway, and a test pins that the text
      is lost in that case so the behaviour is deliberate rather than discovered.
- [ ] Remove the `console.log` placeholder from `App.handleSave` and, with it, the last
      pretend-persistence in the app.

### 8. `App` — local state and the day view

- [ ] Test first in `App.test.tsx`.
- [ ] A created note is merged into `notes` and appears in its period's row when the dialog
      closes, with no second `GET`.
- [ ] An updated note replaces the old one in place; the row's excerpt changes and no duplicate
      appears.
- [ ] A created note whose `occursAt` is outside the fetched window (not reachable from the day
      view today, but reachable the moment day navigation lands) is merged without disturbing
      the rendered day. State the invariant even though nothing exercises it yet.
- [ ] The `LiveClock.MD` rules still hold: opening the dialog sets `followsClock` false, and a
      midnight rollover with a dialog open leaves the dialog, its `occursAt` and the view alone.

### 9. Docs

- [ ] Update `DESIGN DOCUMENT.MD`: the *concurrent edits to one note* open question is answered
      — last-write-wins, server-set `ModifiedAt`, client never sends it — moved out of **Open
      Questions** into the backend goals, with optimistic concurrency named as the thing to
      revisit alongside auth.
- [ ] Update `CLAUDE.md` **Backend**: the two new endpoints, the `TimeProvider` registration and
      the rule that handlers never read the clock directly, and the lock on the in-memory store.
- [ ] Update `CLAUDE.md` **Frontend**: `useNoteAutosave`, create-on-open, the debounce/ceiling
      numbers, the flush points, and that the dialog no longer has a discard path.
- [ ] Update `CLAUDE.md` **Current state** once the feature is green.
- [ ] Amend `PlaywrightE2E.MD` where it says Save "still only reaches the console" (its §6 and
      its **Deferred**): those become persistence assertions, and its stubbed lane needs `POST`
      and `PUT` routes in the network stub.

## Verify

- [ ] `dotnet test` and `dotnet build` from `TimelyNotes.Backend/` — green, no new warnings.
- [ ] `npm test`, `npm run build`, `npm run lint` from `timely-notes-ui/` — all green.
- [ ] `./run-dev.ps1`, then in the browser with the network tab open:
  - [ ] Press **Note**: exactly **one** `POST` fires, returning `201`, before anything is typed.
  - [ ] Type a sentence and stop: one `PUT` about two seconds later, carrying the whole
        sentence — not one per keystroke.
  - [ ] Type continuously for half a minute: saves land roughly every ten seconds.
  - [ ] Stop typing and wait a few minutes: **no** further requests at all.
  - [ ] Press **Done**, then reload the page: the note is in its period row with its content.
  - [ ] Reopen it, edit, close, reload: the edit survived and its slot did not move.
  - [ ] Stop the API, type, and watch the status go to `Not saved — retrying`; restart the API,
        type again, and watch it recover without losing the text.
  - [ ] Kill the browser tab mid-sentence, reopen: everything up to the last save is there, and
        the note exists even if nothing was typed at all.
- [ ] By hand through `TimelyNotes.API.http`: create with empty content succeeds; update an
      unknown id returns `404`; update an id under the wrong Schedule returns `404`; a `PUT`
      body containing `occursAt` is ignored rather than honoured.

## Deferred

- **Discarding a note, and cleaning up empty ones.** The two candidates, so the next
  specification does not start from scratch:
  - **`DELETE` restricted to an empty note** — smallest thing that restores *Cancel*: the
    dialog deletes on close when nothing was ever typed. It reopens `DESIGN DOCUMENT.MD`'s
    "No delete for now", which is a decision to take deliberately rather than by accident.
  - **A server-side prune** — the list endpoint omits empty notes, or a create replaces an
    existing empty note in the same slot. No new verb, but it makes "the store contains it"
    and "the user can see it" diverge, which is its own kind of surprise.
- **Get-by-id**, and with it a real `Location` header on the `201`.
- **Optimistic concurrency** (an ETag or a `ModifiedAt` precondition). Decided against above,
  for now; revisit with auth and multi-user, per `DESIGN DOCUMENT.MD`.
- **Offline queueing.** A failed save retries while the dialog is open and gives up when it
  closes. Surviving a closed tab needs a durable outbox and is a feature of its own.
- **Conflict detection between two open tabs.** Last-write-wins means the second tab silently
  wins; nothing warns anyone.
- **Real persistence.** Everything here still lands in `InMemoryNoteRepository`, so a restart
  loses every note written — including, now, real ones. The repository interface is the seam;
  swapping it is the next backend feature of consequence.
- **Day navigation and the scrolling view** — unchanged from `LiveClock.MD`. §8's
  out-of-window merge is written so that feature does not have to revisit it.
- **Editing anything but content.** `occursAt` and the Schedule stay immutable; there is no
  move-a-note story and this feature does not start one.

## Implementation notes

_Left empty at specification time — the implementing agent fills this in._
