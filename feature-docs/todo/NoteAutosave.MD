# Note autosave

## Goal

**A note is created the moment there is something worth saving, and keeps itself saved from
then on.**

Opening a period's note no longer gives a scratch buffer thrown at the server when the user
remembers to press Save. The first time the buffer holds anything, the note is written, and
every later change writes it again — including the change that empties it. Clearing a note
saves it empty, which hides it everywhere; closing then deletes the record.

Every one of those writes is **the same request**, to an address that existed before the note
did: the period itself.

1. **`PUT /api/schedules/{scheduleShortName}/notes/{day}/p{ordinal}`** — writes the note in that
   period: creates it if there is none, replaces its **content** if there is.
   `CreatedAt`/`ModifiedAt` are the server's; the body carries **content alone**, because the
   Schedule and the slot are in the route and are the note's identity. A note cannot be moved,
   and — as under the original `PATCH` design — that is not a rule the server enforces but a
   sentence the request cannot express.
2. **`DELETE /api/schedules/{scheduleShortName}/notes/{day}/p{ordinal}`** — removes a note. This
   reverses
   the design document's *"No delete for now"*, deliberately: without it, autosave has no
   honest way to undo itself. It is also the verb a user-facing *delete this note* will need,
   whenever that gets specified — this feature is the first caller, not the only one.
3. **An empty note is never returned by either read route** — not by `notes`, not by the
   `note-days` counts. Emptiness is a record's problem, not a reader's: the delete above is
   best-effort, and this is what makes a stray one harmless in the meantime.
4. **Save-on-interaction plus autosave in the UI** — nothing is written until the buffer is
   non-empty, then a debounced `PUT` after typing stops, a forced save during sustained typing,
   and a flush when the dialog closes or the tab is hidden.
5. **The end of `Save`/`Cancel`.** With the note saved as it is written, the dialog gets
   **Done** and a save-status line.

### The principle underneath all of it

**An accidental note leaves no trace, and tidying up is never the user's job.** In Obsidian, a
mis-pressed `Ctrl+N` leaves an `Untitled` file that you have to go and delete by hand — a
chore created by the tool, handed to the user, for something they did not mean to do. This app
is Obsidian's note-taking made timely, and that annoyance is one of the things it exists to
fix.

Every rule below is downstream of that. No write until there is content, so a mis-press writes
nothing at all. Clearing a note saves the clearing, so changing your mind sticks without a
confirmation step. The record is deleted on close, and hidden the instant it is empty if the
delete cannot be made. There is no *Untitled* to find, and no list of empties to go through:
**the user never performs housekeeping the app could have avoided creating.** Where a rule here
costs an extra request or a little more code, that is what it is buying.

**Depends on `OneNotePerPeriod.MD`**, and cannot start before it is in `done/`. That feature
supplies the key this one writes to, the ordinal bound check, and the single-button row. Almost
everything that made earlier drafts of this spec complicated — the minted id, the
create-versus-update branch, the `404` recovery — was the cost of not having it.

Following TDD (per `CLAUDE.md`): a failing test before each piece of code, xUnit v3 on the
backend and Vitest + React Testing Library on the frontend, with the Playwright specs extended
once each slice is implemented.

## Scope decisions

- **Nothing is written until the user has actually written something.** No request on open. The
  first save fires on the first autosave beat at which the editor's markdown is non-empty.
  Pressing **Note**, looking at the slot and closing it again is **zero requests** and leaves
  nothing behind — which is the whole point of the change, and is why the earlier
  create-on-open design (and the empty-note problem it created) is gone.
- **The price is that a crash before the first save loses what was typed** — at most two
  seconds of it. Accepted: create-on-open bought that back only by writing a note for every
  press, including the ones the user immediately abandoned.
- **One idempotent `PUT` upsert, addressed by the period.** `OneNotePerPeriod.MD` makes
  `(Schedule, Day, Ordinal)` a note's identity, so the address exists before the note does and the
  client already knows it — it is the row the user is looking at. Everything below follows from
  the write being **idempotent**, which a `POST`-to-a-collection could never be:
  - **A stale reference stops being a failure mode.** Any note the server has dropped — pruned,
    deleted in another tab, lost to a restart of the in-memory store — is simply re-created by
    the next save, in the same period. There is no `404` to recover from and no re-create branch
    to write, because *the write is the recovery*.
  - **The double-create hazard disappears.** Under React 19 StrictMode a double-invoked effect
    could fire the first save twice; against a collection that means two notes in one slot,
    which was the single most likely bug in this feature. Sent twice to the same address, the
    second is a no-op.
  - **Retrying a failed save is safe by construction.** Autosave retries; a retry that might
    duplicate is a retry you have to think about.
- **No id is minted anywhere — not by the client, not by the server.** The earlier draft of
  this spec had the browser generate a `Guid` to get the same idempotency. The natural key gets
  it without asking anyone to trust a client-chosen identity, and without a surrogate field.
- **This overturns the earlier `PATCH`-not-`PUT` decision without losing what `PATCH` bought.**
  `PATCH` was chosen because the body was a *partial* representation and a move was
  unexpressible. With the slot in the route, the body is content alone again — so the move is
  still unexpressible, **and** the request is idempotent. That is `PUT` in its proper sense: the
  full state of the resource at a known address.
- **The address has exactly one spelling, and that is the point.** `2026-08-25/p4` is the only
  way to name that note — no instant, no offset, no equality rule to get wrong. The earlier
  instant-addressed draft needed a scope decision here, that `09:00+01:00` and `08:00Z` must
  reach the same note or a client whose offset changed mid-session would silently write a
  duplicate into one period. `OneNotePerPeriod.MD` removed the instant, and the hazard with it.
- **A write to an ordinal the Schedule does not have is a `400`** — `p9` on `s3`, or `p0`
  anywhere — via `Schedules.IsValidOrdinal` from `OneNotePerPeriod.MD`, alongside an unknown
  Schedule and an unparseable day. That is the whole of the address validation: a bound check,
  not the alignment rule an instant-addressed write would have needed.
- **An emptied buffer is saved like any other content: `PUT` with empty content, on the normal
  beat.**
  Autosave's promise is *what is on your screen is on the server*, and it cannot hold that
  promise for every state except blank. If clearing a note wrote nothing, a session killed
  afterwards would restore the paragraph the user had just deleted — which does not read as a
  clever optimisation, it reads as autosave being broken. So emptiness is durable within two
  seconds, exactly like a sentence is.
- **The row disappears when that write lands, not when the dialog closes.** An empty note is
  not displayed (see the read filter below), and the same predicate runs against the local
  cache, so the slot is already clear behind the open dialog. Nothing about the note's
  visibility waits on the close.
- **And it stays gone across a restart, which is the point.** Clear a note, have the session
  die before the `DELETE`, reopen the app: the slot is empty. The record survives, the note
  does not, and what the user sees matches what they did — the `DELETE` was only ever going to
  reclaim the row, never to cause its disappearance. This is the whole argument for writing the
  emptiness, stated as the outcome to test for.
- **The `DELETE` on close is the tidy-up, not the mechanism.** With the emptiness already
  saved, deleting is about not keeping a record nothing can read — worth doing, never load
  bearing. It fires when the dialog closes with a blank buffer, from **Done**, from Escape, or
  from the dialog being unmounted by anything above it (a Schedule change, a day jump, a
  re-render that closes it): all three are in-page and reliable.
- **Delete is best-effort, and the two unreliable endings are not chased.** A hidden tab
  (`visibilitychange` → hidden) is not a close at all — the user switched away with the dialog
  open and is coming back — so it flushes pending writes and stops there. `pagehide` is a
  close, but a `DELETE` issued as the page dies is a request we cannot promise lands, so it too
  only flushes. Either way the note is already empty on the server, invisible to every client,
  and the prune reaps it eventually. A floating record is the accepted cost of not writing code
  that pretends to a guarantee the platform will not give.
- **The closing delete must still outlive the thing that triggered it.** A `DELETE` issued from
  an unmount cleanup cannot be tied to the dialog's `AbortController`, or the teardown that
  started it would cancel it: it is fire-and-forget on its own. And it fires **once per note,
  ever** — a guard in the hook, so **Done** followed immediately by unmount does not issue two.
  A `404` from the second would be harmless, but sending it at all is a request that says
  nothing.
- **Fewer requests is a design constraint, but never at the cost of the buffer being safe.**
  In order: never write an unchanged buffer; never create an empty note; never issue two writes
  for one beat; never refetch after a write. What is explicitly *not* on that list is skipping
  the write that makes a deletion durable — that is the one saving this feature refuses to
  take. The full lifecycle of *press Note, type a sentence, clear it, close* is **three**
  requests: `PUT`, `PUT` to empty, `DELETE`. *Press Note, close* is none.
- **A failed `DELETE` is not retried, and does not hold the dialog open.** It leaves an empty
  note in the store, which is exactly what `EmptyNotePruning.MD` exists to sweep up. Retrying
  a delete against a server that is down is more requests to less effect than letting the
  prune find it later — and on the unmount and `pagehide` paths there is no longer a dialog to
  report the failure to anyway.
- **Empty notes are legal at the API, and invisible in it.** The upsert does not reject empty
  content — emptiness is a *client policy* about when to write, not a data-integrity
  rule, and pushing it into the validator would only mean the UI could never express "this is
  now blank". Instead, **both read routes omit empty notes**: an empty note is not a note
  anyone can read, only a record waiting to be collected. So a `400` is not the answer, and
  neither is relying on the sweep to be timely.
- **The read filter applies to `note-days` as well as `notes`, and it lives in the
  repository.** Filtering is a query concern (`CLAUDE.md`), and a route that hid empties from
  the list while still counting them in the calendar would mark a day that renders as blank.
  Same predicate — null, empty, or whitespace-only — on both.
- **And it applies client-side too, to the local cache.** The rule is *don't display an empty
  note*, not *don't display an empty note the server sent*: `App` renders from
  `useScheduleNotes`'s cache, which holds notes this session wrote. Clearing a note and closing
  must remove its row **now**, not on the next fetch, whether or not the `DELETE` succeeded.
  `isBlank` is the one predicate, used at the render boundary.
- **There is no `404`-recovery path, because there is no `404`.** A live dialog *can* end up
  open on a note the server has dropped — emptiness is written, so a cleared note left
  open past a prune's grace period is a real case. The upsert makes it a non-event: the next
  save re-creates the note in the same period, and neither the user nor
  the hook has to know it happened. This is why `EmptyNotePruning.MD`'s grace period is a
  courtesy rather than a correctness mechanism, and why that feature can stay parked.
  The only visible trace is a reset `createdAt` on a note nobody could read in the interval —
  an audit stamp, on a record that was empty. Worth a line in the docs, not a mechanism.
- **`Save`/`Cancel` become `Done`.** Autosave makes `Save` redundant and `Cancel` false — by
  the time it is pressed, anything typed is already on the server. `Done` flushes any pending
  write and closes; Escape does the same. A save-status line (`Saved 12:03` / `Saving…` /
  `Not saved — retrying`) replaces the reassurance the Save button used to give. Clearing the
  note and pressing **Done** is the discard path, and it is honest about being one.
- **Debounced-on-idle, with a ceiling — not a fixed interval.** Save 2 seconds after the last
  change, and force a save every 10 seconds of continuous typing so a long paragraph is never
  more than ten seconds from safety. An idle editor issues **nothing**, however long it stays
  open: a `setInterval` would rewrite identical content forever.
- **Flush pending writes on close, on `visibilitychange` → hidden, and on `pagehide`.**
  Switching tabs is when the debounce is most likely to be mid-wait. Of those three, the
  hidden-tab one flushes writes and stops there; the other two also delete a blank note, per
  the rule above.
- **The autosave timer is not the clock.** `useNow` answers *what time is it*; autosave asks
  *how long since the last change*. Separate hooks — but the status line's timestamp is a clock
  read, so it comes from `useNow`'s `readNow()`, never a `new Date()` in the dialog.
- **Concurrent edits: last-write-wins, decided.** The server sets `ModifiedAt` on every update
  and the client never sends it. Autosave makes collisions more likely and optimistic
  concurrency more annoying, not less: a save that fails with `412` cannot ask the user
  anything useful mid-keystroke. Single-user, one editor per note in practice — take the simple
  rule now and revisit alongside auth.
- **`201` when the upsert created, `200` when it replaced**, the note in the body either way,
  and no `Location` header — the request already names the address it wrote to, so a `Location`
  would only repeat the URL the caller sent. The status code is the only thing distinguishing
  the two paths, and the client ignores it: it wanted the note in that period and it has one.
  It is there for a human reading the network tab and for the tests, which very much do care.
- **`204` for a successful delete**, `404` when that period holds no note.
- **There is no cross-Schedule case to guard.** The Schedule is part of the address, so an
  upsert can only ever write inside the Schedule it names — the `409` an id-based design needed
  has nothing to describe. One more thing the natural key removes rather than handles.
- **The server reads the clock through `TimeProvider`.** `CreatedAt`/`ModifiedAt` are the first
  server-set times in a testable path, so register `TimeProvider.System` and inject it rather
  than calling `DateTimeOffset.Now` in a handler — that is the difference between asserting the
  stamps and asserting they are "roughly now".
- **The in-memory store becomes writable, so it needs a lock.** It is a singleton and reads
  currently walk a bare `List<Note>` unsynchronised. Safe only while nothing writes.
- **Local cache updates, no refetch.** A created, updated or deleted note is applied to
  `useScheduleNotes`'s own cache, so the row appears, changes or disappears immediately.
  Refetching a three-day window after a keystroke batch would be absurd — and is a request.

## Architecture

### Backend — `TimelyNotes.Backend/TimelyNotes.API`

- `Models/Note.cs` — unchanged in shape. Stays a `class`, not a `record`: an update copies it
  explicitly, and value equality would change what the existing repository tests assert.
- `Repositories/INoteRepository.cs` / `InMemoryNoteRepository.cs` — `Upsert` and `Delete` join
  the two reads; both reads gain the empty-content filter; `_notes` gets a lock covering every
  one of them. `Upsert` must decide *and* write inside one critical section, or two saves racing
  on an empty period both create and the defect `OneNotePerPeriod.MD` fixed comes back through
  the write path.
- `Endpoints/Notes/` — `UpsertNoteRequest` / `UpsertNoteValidator` / `UpsertNoteEndpoint` and
  `DeleteNoteRequest` / `DeleteNoteEndpoint`, one type per file beside the existing
  `GetNotesBySchedule*`. Both take `ScheduleShortName`, `Day` and `Ordinal` from the route; the
  upsert's body is `{ content }` and reuses `NoteResponse`, and delete has no body either way.
- `Program.cs` — `builder.Services.AddSingleton(TimeProvider.System)`.
- `TimelyNotes.API.Tests` — `Microsoft.Extensions.TimeProvider.Testing` for `FakeTimeProvider`.

### Frontend — `timely-notes-ui/src`

- `api/notesApi.ts` — `saveNote(shortName, day, ordinal, content, signal)` and
  `deleteNote(shortName, day, ordinal, signal?)`, both building the path from the `DayKey` as
  given and `p${ordinal}`. Nothing is converted and nothing is encoded — a `DayKey` is already
  the wire form and `p4` is path-safe as written, neither of which the instant-addressed draft
  could say. One save function, no create-or-update branch anywhere in the client. `saveNote` takes a required
  `AbortSignal` as everything else in this file does; **delete is the exception**, because its
  whole job is to happen as its caller is being torn down — its signal is optional, and the
  unmount path passes none.
- `domain/notes.ts` — `isBlank(markdown)`, the single definition of "there is nothing to save":
  MDXEditor emits whitespace and stray newlines for an untouched buffer, so a `=== ''` test is
  not it. The same predicate decides *don't create*, *delete on close* and *don't display*, and
  it is the client's mirror of the server's `string.IsNullOrWhiteSpace`.
- `hooks/useNoteAutosave.ts` — the engine, beside `useNow`. Owns the debounce, the ceiling, the
  dirty check, the in-flight guard and the save status; knows nothing about MDXEditor or about
  periods, and — thanks to the upsert — nothing about whether a note exists yet either.
- `components/NoteEditor.tsx` — forwards an `onChange` from MDXEditor. Still the only place the
  plugin list lives.
- `components/NoteDialog.tsx` — drives `useNoteAutosave`, renders the status line, and replaces
  `Save`/`Cancel` with `Done`.
- `hooks/useScheduleNotes.ts` — gains `applyNote(note)` and `removeNote(day, ordinal)`, which edit
  the cached day bucket in place, keyed on the note's period. A day that is not cached is left
  alone: it will be fetched complete when it is next wanted.
- `App.tsx` — passes the period's day and ordinal and the Schedule down, and wires the dialog's outcomes
  into the cache. It stamps nothing and mints nothing: the address is the row.

Flow, and there is only one: the period's note is opened → dialog mounts, **no request** →
first non-empty beat → `PUT` to that period (`201` if it is new, `200` if not) → `App` applies
the note → typing → debounced `PUT`s to the same URL → **Done** flushes and closes. A new note
and an existing one take the same path; the dialog does not know or care which of its saves
created anything. Clearing the buffer is just another change: one `PUT` with empty content on
the next beat, at which point the row's excerpt disappears behind the dialog. Closing then sends
one `DELETE` — from **Done**, from Escape or from the unmount cleanup, whichever gets there
first, and only ever one of them. If nothing was ever typed there is nothing to empty and
nothing to delete. If the `DELETE` never happens — the tab died, the server was down — the
record survives as an empty note that no read route will return, and the user sees exactly what
they left.

The flow worth tracing twice, because it is the reason for the shape: clear a note, leave the
dialog open long enough for the record to be swept, then type again. The next `PUT` lands on a
period holding nothing, so it creates — same address, same dialog, no error and no branch taken
anywhere.

## Checklist

### 1. Server clock seam (prerequisite)

- [ ] Test first: an upsert endpoint test using `FakeTimeProvider` asserts the created note's
      `CreatedAt` is exactly the fake instant — impossible before this item exists.
- [ ] Add `Microsoft.Extensions.TimeProvider.Testing` to `TimelyNotes.API.Tests`.
- [ ] Register `TimeProvider.System` as a singleton in `Program.cs`; endpoints take it by
      constructor injection. No handler calls `DateTimeOffset.Now` directly.

### 2. Repository — reads hide empty notes (`TimelyNotes.API/Repositories`)

- [ ] Test first, on **both** reads: a note whose content is empty, whitespace-only or null is
      absent from `GetBySchedule`; the same note contributes nothing to
      `GetDayCountsBySchedule`, and a day whose *only* note is empty is absent from the counts
      entirely rather than reported as `0`; a note containing just `#` or `-` is **kept** — the
      filter judges emptiness, not whether the writing was worth it.
- [ ] Filter with `string.IsNullOrWhiteSpace` in both repository methods, expressed once as a
      private predicate so the two reads cannot drift apart.
- [ ] Note in the interface docs that an empty note is retained but unreadable, and why: the
      client's delete is best-effort, and this is what keeps a stray one invisible.

### 3. Repository — writes (`TimelyNotes.API/Repositories`)

- [ ] Test first, covering: upserting into an empty period **creates**, and the note is returned
      by a later `GetBySchedule` whose window contains it, without disturbing the seed;
      upserting the same period again **replaces the content** and `ModifiedAt`, leaving
      `Day`, `Ordinal`, `CreatedAt` and `ScheduleShortName` untouched; the same upsert sent twice
      leaves exactly one note; the same period under a *different* Schedule is a different note
      and neither touches the other; `Delete` removes a note from both reads and reports `false`
      for a period holding none.
- [ ] Test first on the address itself: the same `(Schedule, Day, Ordinal)` always reaches the
      same note, and changing any one of the three reaches a different one. Under the instant key
      this item had to prove that two spellings of one instant matched; there is only one
      spelling now, so what is worth asserting is that all three parts of the key are compared.
- [ ] `Task<UpsertResult> Upsert(Note note, CancellationToken ct)` on `INoteRepository` — `ct`
      with no default, per `CLAUDE.md`. The result carries the stored note and says whether it
      *created* or *replaced*, so the endpoint can pick its status code without a second query.
      Document that the caller supplies a fully-stamped note, that `CreatedAt` is honoured only
      on the create path, and that replacement is last-write-wins by design.
- [ ] `Task<bool> Delete(string scheduleShortName, DateOnly day, int ordinal, CancellationToken
      ct)` — `false` when that period held nothing.
- [ ] Implement both in `InMemoryNoteRepository`; the replace path writes an explicit copy, so
      `Note` keeps its `init`-only members.
- [ ] Guard `_notes` with a lock across every read and write — the store is a singleton and,
      from this feature on, concurrently mutated. **The upsert's decide-then-write must be one
      critical section**, or two saves racing on an empty period both create and one period ends
      up with two notes again. Add a test firing concurrent upserts at the same period asserting
      exactly one note results, and another that concurrent upserts at *different* periods all
      land.

### 4. Upsert endpoint (`TimelyNotes.API/Endpoints/Notes`)

- [ ] Test first, on the create path: `201` with the note in the body; the response `day` and
      `ordinal` are the ones from the route; `createdAt` and `modifiedAt` are the
      `FakeTimeProvider` instant and equal to each other; the note then appears in a `GET` for
      a window containing it.
- [ ] Test first, on the replace path: `200` with the new content; `modifiedAt` advances to the
      fake instant while `createdAt`, `day` and `ordinal` do not move; two writes in a row both apply
      (last-write-wins).
- [ ] Test first, on idempotency: the identical request sent twice yields `201` then `200` and
      leaves exactly one note. This is the property the whole design rests on, so it is asserted
      directly rather than inferred from the two paths above.
- [ ] Test first, on rejection: `400` for an ordinal the named Schedule does not have (`p9` on
      `s3`, and `p0`), for an unknown Schedule, for an unparseable day, for null content and for
      over-long content; **empty content is accepted**, because
      create-on-first-content and save-the-clearing both depend on it.
- [ ] `UpsertNoteRequest`: `ScheduleShortName`, `Day` and `Ordinal` from the route — `Day` as
      `DateOnly?` and `Ordinal` as `int?`, nullable so a value that does not bind fails
      `NotNull()` and names itself, the lesson recorded in `NotesDateRange.MD` — and `Content`
      (`string?`) from the body. **No day or ordinal in the body**: the slot is the address, and
      the request type is again where that is enforced. Stripping the route's `p` prefix happens
      in one place.
- [ ] `UpsertNoteValidator`: `Day` and `Ordinal` required, the Schedule known and the ordinal in
      range via `Schedules.IsValidOrdinal` from `OneNotePerPeriod.MD`; `Content` not null;
      content no longer than a stated maximum, expressed as one constant shared with nothing yet
      but named anyway.
- [ ] `UpsertNoteEndpoint` — `Put("api/schedules/{scheduleShortName}/notes/{day}/p{ordinal}")`,
      builds the `Note` from the route and `TimeProvider.GetUtcNow()`, calls `Upsert`, and sends
      `201` or `200` from the result. Thread `ct` through every call including the send.
- [ ] `Summary` and `Description` covering what the caller cannot guess: that the URL's period
      **is** the note's identity; that the ordinal is 1-based and bounded by the Schedule's
      period count; that the day is the caller's own calendar date; that
      `createdAt`/`modifiedAt` are server-set and ignored if sent; and that repeating the
      request is safe.

### 5. Delete endpoint (`TimelyNotes.API/Endpoints/Notes`)

- [ ] Test first: `204` and the note is gone from both read routes; `404` for a period holding
      none; the same period under another Schedule is untouched; deleting twice gives `204` then
      `404`.
- [ ] `DeleteNoteRequest` (route only) and `DeleteNoteEndpoint` —
      `Delete("api/schedules/{scheduleShortName}/notes/{day}/p{ordinal}")`, `204` or `404`,
      `ct` threaded.
- [ ] Add upsert and delete requests to `TimelyNotes.API.http`, including an empty-content
      write, a repeat of the same write, and an out-of-range ordinal, so the rules are
      exercisable by hand.

### 6. API client (`src/api/notesApi.ts`)

- [ ] Test first for each: the method, the URL, the JSON body, the parsed result, a non-2xx
      throw, and abort behaviour — matching how `getNotesBySchedule` is already tested.
- [ ] `saveNote(shortName, day, ordinal, content, signal)` — `PUT` to
      `/api/schedules/{shortName}/notes/{date}/p{ordinal}`, body `{ content }`, returns the
      parsed `Note`. Assert the path **structurally** (split it, compare the segments to the
      `DayKey` and ordinal passed in) and assert it under a non-UK timezone: the URL must be
      *identical*, since nothing in it depends on an offset. A `Date` creeping back into this
      path is what that second assertion catches.
- [ ] A test asserts the path needs no encoding and gets none — a date and `p4` are path-safe as
      written. Stated rather than assumed, because the encoding trap `notesApi` documents for
      query strings is exactly one segment away.
- [ ] A test asserts the body carries **only** `content` — no day, ordinal, `createdAt` or
      `modifiedAt` — and that both a `201` and a `200` response parse the same way, so the
      client does not branch on which happened.
- [ ] `deleteNote(shortName, day, ordinal, signal?)` — `DELETE`, no body, resolves on `204`, treats a
      `404` as success (it is already gone, which is the outcome asked for) and throws on any
      other failure. A test covers the optional signal, and a comment records why this one call
      may be made without one.

### 7. `isBlank` (`src/domain/notes.ts`)

- [ ] Test first: `''`, `'\n'`, `'   '`, `'\n\n'` and MDXEditor's untouched-buffer output are
      blank; `'a'`, `'#'` and `'- '` are not. Fix the fixture for the editor's actual output by
      reading it in the Playwright lane rather than guessing.
- [ ] `isBlank(markdown)` exported from `domain/notes.ts` and used by nothing else — one
      definition of "nothing to save", shared by the don't-create rule and the delete-on-close
      rule.

### 8. The autosave engine (`src/hooks/useNoteAutosave.ts`)

- [ ] Test first throughout, with `vi.useFakeTimers()` and stubbed `save`/`remove`.
- [ ] `useNoteAutosave({ save, remove, initialContent })` returns
      `{ status, savedAt, onChange, flush, finish }`, where `status` is
      `'idle' | 'saving' | 'saved' | 'failed'` and `savedAt` is the instant of the last
      successful write. **No `create` and no `update`** — the hook has one write, and holds no
      "does this exist yet" state at all. That absence is the design, so a test asserting the
      first and second saves are the same call is worth its place.
- [ ] **Nothing on mount.** A new note issues no request at all; assert zero calls under React
      19 StrictMode's double-mount, and after minutes of fake time with no change.
- [ ] The first non-empty beat calls `save` once. Under StrictMode's double-mount, assert that
      even if it were called twice the address is identical — the property that makes a
      duplicate harmless, rather than a count that happens to be 1 today.
- [ ] Changes that leave the buffer blank never save: type, clear, wait, and assert no call.
- [ ] A change schedules a save 2 seconds later; further changes inside that window reset the
      timer; the save carries the **latest** content, not the content at the first change.
- [ ] Continuous changes force a save every 10 seconds regardless of the debounce — assert with
      a change every second for 25 seconds that saves land at ~10s and ~20s.
- [ ] An unchanged buffer never saves, and a buffer that returns to its last-saved content is
      not dirty: no request, however long the dialog stays open.
- [ ] **Blanking an existing note is a save like any other**: clearing the buffer schedules one
      `save` with empty content on the normal beat — not a `remove`, and not nothing. Assert
      the call fires, carries the empty string, and that waiting through several more ceilings
      produces no further calls, since the buffer is then clean.
- [ ] Blanking a note that was **never written** writes nothing. There is no resource to make
      empty, and nothing has been sent, so there is nothing to say.
- [ ] **Typing after the note has been swept just works.** With `save` stubbed to behave like an
      upsert against an emptied store, assert the next change saves normally to the same
      address, the status goes to `'saved'` and nothing is reported to the user — no recovery
      branch, because there is nothing to recover from.
- [ ] `flush()` writes immediately when dirty, resolves when the write settles, is a no-op when
      clean, and **never deletes** — it is the tab-hidden path. A test asserts a blank dirty
      buffer flushed this way is *written empty* and the note is not removed.
- [ ] `finish()` is the close path: it flushes first — so a blank buffer is saved empty before
      anything else — and then, if the buffer is blank and anything was ever written, issues one
      `remove`. Blank with nothing ever written is nothing at all. A test pins the order: the
      `save` settles before the `remove` is sent, so a failed delete still leaves the emptiness
      saved.
- [ ] **`finish()` runs on every close, not just the button.** The hook's own unmount cleanup
      calls it, so a dialog torn down by anything above it still deletes a blank note. Tests:
      unmounting with a blank buffer issues the `remove`; unmounting with a dirty non-blank
      buffer issues the write.
- [ ] The teardown delete is **not** abortable and is not awaited: it is issued outside the
      controller the writes use, so the cleanup that triggered it cannot cancel it. A test
      asserts the request still goes when the hook's controller is aborted in the same tick.
- [ ] **One delete per note, ever.** A guard makes **Done** followed by unmount issue exactly
      one request. Assert the count is 1, and that the hook does not then `save` the period it
      just deleted.
- [ ] Only one request is in flight at a time; a change arriving mid-save schedules the next one
      rather than racing it, and the last content always wins.
- [ ] A failed write sets `'failed'`, keeps the content dirty, and retries on the next debounce
      or flush — nothing is dropped; a subsequent success clears the state. A failed **delete**
      does not retry and does not block: it resolves `finish()` and leaves the note for the
      prune.
- [ ] Unmount clears timers and aborts the in-flight *write*; no state update after unmount.
      The closing delete is the deliberate exception and survives it.

### 9. The dialog (`src/components/NoteDialog.tsx`, `NoteEditor.tsx`)

- [ ] Test first in `NoteDialog.test.tsx`; the existing tests move from Save-button assertions
      to autosave assertions.
- [ ] `NoteEditor` forwards an `onChange` to MDXEditor, keeping its `MDXEditorMethods` ref.
- [ ] Opening on a **new** note issues no request; typing writes it after the debounce, and the
      row's note appears in the view without a refetch.
- [ ] Opening on an **existing** note issues no request; the first change writes it. The dialog
      does not distinguish the two cases anywhere in its code, and the tests should read the
      same for both.
- [ ] The status line reads `Saving…`, then `Saved HH:MM` using `formatTimeOfDay` and the
      instant from `readNow()` — the **client's** clock, saying when this browser last succeeded,
      never the response's `modifiedAt`, which is a server-zone audit stamp and would read as the
      wrong time of day. A failure reads `Not saved — retrying` and is announced with
      `role="status"`. A note that has never been written shows no status at all.
- [ ] `Save`/`Cancel` are replaced by a single **Done** that calls `finish()` and closes;
      Escape (`onCancel`) does the same.
- [ ] Clearing the content removes the row while the dialog is still open — the empty `PUT`
      is what does it — and pressing **Done** then deletes the note. So does clearing and
      pressing Escape, and so does clearing and changing Schedule, where the dialog is
      unmounted rather than closed. Assert each, and assert the row stays gone when the
      `remove` is made to fail.
- [ ] If the final *write* fails, the dialog stays open with the failure visible rather than
      closing over unsaved text; a second **Done** closes anyway, and a test pins that the text
      is lost in that case so the behaviour is deliberate rather than discovered. A failed
      *delete* closes the first time.
- [ ] `visibilitychange` → hidden and `pagehide` both call `flush()`. A test asserts a blank
      buffer under either is **written empty but not deleted**: one is not a close, the other
      is one we cannot serve reliably, and both leave a record the read filter hides.
- [ ] Remove the `console.log` placeholder from `App.handleSave` and, with it, the last
      pretend-persistence in the app.

### 10. `App` and the note cache

- [ ] Test first in `App.test.tsx` and `useScheduleNotes.test.tsx`.
- [ ] `useScheduleNotes` gains `applyNote(note)` and `removeNote(day, ordinal)`: a saved note
      appears in its day's bucket, a re-saved one replaces the old in place with no duplicate
      (matched on `(day, ordinal)`, which *is* its identity), a deleted one disappears — none of
      them triggering a `GET`.
- [ ] **A blank note is never rendered, wherever it came from.** `notesFor` filters with
      `isBlank`, so a note this session emptied disappears from its row as soon as the empty
      `PUT` is applied to the cache — with the dialog still open, and independent of whether
      the `DELETE` ever fires. Test it with a blank note placed directly in the cache, not only
      via the dialog.
- [ ] A note whose `day` is **not cached** is ignored by both, leaving
      the uncached day to be fetched complete. State the invariant; nothing exercises it from
      the three-day view yet.
- [ ] `App` passes `save`/`remove` down to the dialog, wired to the API client and to the cache,
      bound to the opened period's day and ordinal. Nothing is stamped and nothing is minted: the
      address is the row the user pressed, and it is the same address before the note exists,
      while it exists, and after it has been swept away.
- [ ] The `LiveClock.MD` rules still hold: opening the dialog pins the view, and a midnight
      rollover with a dialog open leaves the dialog, its period and the view alone.
- [ ] A clock tick still causes no refetch — the existing assertion must stay green.

### 11. Acceptance specs (`e2e/`)

Only after the Vitest slices above are green, per `CLAUDE.md`.

- [ ] The stubbed lane's `api` fixture gains `PUT` and `DELETE` routes for
      `**/api/schedules/*/notes/*`, recording method, URL and body, and behaving like a real
      upsert — a tiny map keyed by the URL's day and ordinal, answering `201` or `200`
      accordingly, so a
      spec can assert on what the store *became* rather than only on what was sent.
- [ ] `note-dialog.spec.ts`: opening and closing without typing issues **no** write request at
      all; typing a sentence issues exactly one `PUT` after the debounce; typing more issues
      further `PUT`s **to the same URL**, and the stub's map still holds exactly one note;
      clearing the content issues a `PUT` with an empty body and the row goes at that moment,
      and pressing **Done** then issues one `DELETE`. Use `page.clock` to run the debounce
      forward rather than waiting in real time.
- [ ] `note-dialog.spec.ts`: clear a note, let the empty `PUT` land, then reload the page with
      the stub serving what it was last sent — the slot is empty and the old paragraph does not
      return. This is the journey the extra write exists for, so it is asserted end to end.
- [ ] `note-dialog.spec.ts`: type a note, have the stub **drop it from its map** as a prune
      would, then type again — the next `PUT` re-creates it at the same address, the text is
      intact and nothing surfaces to the user. The upsert's whole justification, asserted once
      at the level where it is visible.
- [ ] `note-dialog.spec.ts`: open a period's note, type, close, and open it again — the same
      note comes back with its content, and the row still shows exactly one entry. This is the
      journey `OneNotePerPeriod.MD` had to defer for want of a write path; it lands here.
- [ ] `note-dialog.spec.ts`: clearing a note and dismissing with **Escape** deletes it too, and
      a reload confirms the row is gone. This is the path a unit test can only simulate — the
      native `<dialog>`'s Escape is one of the three things the acceptance lane exists for.
- [ ] `api-contract.spec.ts`: the `PUT` URL is the opened period's day and ordinal
      (`/notes/2026-08-25/p4`), and is **identical** under `Pacific/Auckland` and
      `Europe/London` for the same displayed row — the existing timezone-honesty check, extended
      to the write path, where the address now decides *which note* rather than only which
      window.
- [ ] `note-dialog.spec.ts`: a fixture note with empty content is **not rendered** in its
      period row — the read filter's client-visible consequence, and the one thing that makes a
      floating record acceptable.
- [ ] `backend.spec.ts` (`@integrated`): one journey creating a real note through the real API
      and reading it back in the day view, and one deleting it again — the assertions that are
      *about* the two projects agreeing. Keep the lane small.

### 12. Docs

- [ ] Update `DESIGN DOCUMENT.MD`: **Delete** joins the backend endpoint list with the reason
      (autosave needs a way to undo itself, restricted to nothing — the client decides when),
      replacing *"No delete for now"*, which was a statement of the state at the time rather
      than a requirement; record that **an empty note is never returned by a read route**, so
      the store and the readable set are deliberately not the same thing; add the product
      principle above to the frontend goals — *an accidental note leaves no trace, and the user
      never tidies up after the app* — since it outlives this feature and should constrain the
      next one; and record
      last-write-wins with server-set `ModifiedAt` alongside the timestamp rules, naming
      optimistic concurrency as the thing to revisit with auth.
- [ ] Update `CLAUDE.md` **Backend**: the two new endpoints, **why the write is an idempotent
      `PUT` upsert addressed by the period** and what that buys, that the address has one
      spelling, the out-of-range-ordinal `400`, the empty-note read filter on both read routes,
      the `TimeProvider` registration and the rule that handlers never read the clock directly,
      and the lock — with the note that the upsert's decide-and-write is one critical section.
- [ ] Update `CLAUDE.md` **Frontend**: `useNoteAutosave` and its single `save`,
      save-on-first-content, that the opened period's day and ordinal *are* the address so
      nothing is stamped or minted, the debounce/ceiling numbers, the flush points, `isBlank` as the one
      definition of empty on both sides of the wire, best-effort delete-on-close and what
      happens when it misses, and that the dialog has no discard button because clearing *is*
      the discard.
- [ ] Update `CLAUDE.md` **Current state** once the feature is green.
- [ ] Amend `feature-docs/done/PlaywrightE2E.MD` where it says Save "still only reaches the
      console": those become persistence assertions.

## Verify

- [ ] `dotnet test` and `dotnet build` from `TimelyNotes.Backend/` — green, no new warnings.
- [ ] `npm test`, `npm run build`, `npm run lint` and `npm run test:e2e` from
      `timely-notes-ui/` — all green.
- [ ] `./run-dev.ps1`, then in the browser with the network tab open:
  - [ ] Open an empty period's note, look at it, press **Done**: **no** requests at all, and no
        new excerpt on the row.
  - [ ] Open it again, type a sentence and stop: one `PUT` about two seconds later, returning
        `201` and carrying the whole sentence — not one per keystroke, and nothing before the
        first character. The URL is that period's day and ordinal.
  - [ ] Keep typing: more `PUT`s **to the same URL**, all returning `200`, and only ever one
        row in the slot.
  - [ ] Type continuously for half a minute: saves land roughly every ten seconds.
  - [ ] Stop typing and wait a few minutes: **no** further requests at all.
  - [ ] Press **Done**, then reload: the note is in its period row with its content.
  - [ ] Reopen it, edit, close, reload: the edit survived and its slot did not move — and the
        row still holds exactly one entry, opened by the one button.
  - [ ] Switch to a coarser Schedule and back: the note is in the block containing its period,
        and there is still one of it.
  - [ ] Reopen it, select all, delete, and wait: one `PUT` carrying empty content about two
        seconds later, and the row vanishes from the slot behind the dialog straight away.
        Press **Done**: one `DELETE`, and a reload confirms it.
  - [ ] Same again but dismiss with **Escape** instead: `PUT` then `DELETE`, same outcome.
  - [ ] Same again but change Schedule with the dialog open and the buffer cleared: the delete
        still fires, and switching back shows no row.
  - [ ] **The one that justifies the extra `PUT`:** clear a note, wait for the write, then kill
        the browser tab before pressing anything. Reopen the app — the slot is empty. The old
        paragraph must **not** come back.
  - [ ] **The one that justifies the upsert:** with a note open and typed into, restart the API
        (which empties the in-memory store), then type again. The next `PUT` returns `201`
        instead of `200`, the note is back in its slot with the full text, and nothing about
        the dialog changed — no error, no lost paragraph.
  - [ ] Same again but stop the API before pressing **Done**: the `DELETE` fails, the dialog
        closes anyway, and a restart of the UI still shows no note in the slot.
  - [ ] Switch tabs mid-sentence: one write fires. Switch tabs with the buffer cleared: nothing
        fires, and the note is still there when you come back.
  - [ ] Stop the API, type, and watch the status go to `Not saved — retrying`; restart the API,
        type again, and watch it recover without losing the text.
  - [ ] Kill the browser tab mid-sentence, reopen: everything up to the last save is there.
- [ ] By hand through `TimelyNotes.API.http`: a `PUT` to an empty period with empty content
      returns `201` **and the note does not appear in the list or the counts**; the same `PUT`
      with content returns `200` and it appears in both; back to whitespace and it vanishes from
      both again; the identical request sent twice leaves one note, not two; a `PUT` to
      `s3/…/p9` returns `400`, as does `p0`; the same day and ordinal under `s1` and under `s3`
      are two independent notes; delete twice gives `204` then `404`.

## Deferred

- **Pruning empty notes** — `EmptyNotePruning.MD`, specified but **not scheduled**. Two things
  make it optional rather than owed: the read filter, so a record the delete could not reach is
  already invisible to every client; and the upsert, so a record the prune *does* reach cannot
  break an open dialog. What is left is a storage question. Build it when the store is real and
  a floating record costs something.
- **A user-facing delete.** The `DELETE` endpoint this feature adds is deliberately general —
  it deletes a note, not just an empty one — because *delete this note* is a feature the user
  will want and this is the verb it needs. No UI for it here; clearing the content is the only
  way to reach it from the app today.
- **Get-one-note.** `GET /notes/{day}/p{ordinal}` would be trivial now that the address exists, and
  nothing needs it: the day view already has every note it renders.
- **Guarding who may write to a period.** The server accepts any well-formed address it is
  given. Harmless single-user with no auth; the moment there are two users, "whose 09:00 is
  this" is the question, and the answer is a user in the key — which is exactly the shape a
  natural key extends to cleanly.
- **Reintroducing a surrogate id.** If a period ever needs to hold more than one note again,
  this is the decision to unpick — noted so a later reader knows the natural key was chosen,
  not inherited.
- **Optimistic concurrency** (an ETag or a `ModifiedAt` precondition). Decided against above,
  for now; revisit with auth and multi-user.
- **Offline queueing.** A failed write retries while the dialog is open and gives up when it
  closes. Surviving a closed tab needs a durable outbox and is a feature of its own.
- **Conflict detection between two open tabs.** Last-write-wins means the second tab silently
  wins; nothing warns anyone.
- **Undo of a delete.** Clearing and pressing **Done** is final. A trash or an undo toast is a
  different feature, and would need the delete to be soft.
- **Refreshing the calendar's markers after a write.** `useNoteDays` still does not revalidate,
  so a note created this session does not move a month marker until a fresh mount.
- **Real persistence.** Everything here still lands in `InMemoryNoteRepository`, so a restart
  loses every note written — including, now, real ones. The repository interface is the seam.
- **Editing anything but content.** The day, the ordinal and the Schedule stay immutable; there is no
  move-a-note story and this feature does not start one.

## Implementation notes

_Left empty at specification time — the implementing agent fills this in._
