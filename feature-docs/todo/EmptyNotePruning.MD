# Empty note pruning

> **Status: specified, not scheduled.** `NoteAutosave.MD` deletes an empty note on every close
> it can see, and hides any it cannot from both read routes — so a floating record is already
> invisible to every client. What remains is a storage question, and the store is still a
> `List<Note>` in memory. Build this when persistence is real, or when an empty record starts
> costing something. It is written down now so the decision is deliberate rather than forgotten.

## Goal

**An empty note does not survive.** A note whose content is blank and which nothing is
currently editing is removed by the server, without anyone asking.

`NoteAutosave.MD` avoids creating empty notes, saves an emptied one *as* empty so the deletion
is durable immediately, and deletes the record when the dialog closes. That last step covers
every ending the client can see reliably, and none of the ones it cannot: a `DELETE` that
failed is deliberately not retried, a killed tab or a `pagehide` sends nothing at all, and a
hand-written request can leave one behind. Every such record is already invisible — both read
routes omit empty notes — so this is about the store, not the screen: it makes "the store
contains an empty note" a temporary condition rather than a permanent one.

It is **backend-only**, and — unusually — it has **no user-visible effect at all**. The rows it
concerns are already hidden by the read filter. If building it changes what anyone sees,
something else is wrong.

**Depends on `NoteAutosave.MD`** — it needs `INoteRepository.Delete`, the lock on the store and
the `TimeProvider` registration, all of which that feature introduces. Do not start this
before it is in `done/`. The running order is `OneNotePerPeriod.MD` → `NoteAutosave.MD` → this.

Following TDD (per `CLAUDE.md`): a failing test before each piece of code, xUnit v3.

## Scope decisions

- **A background sweep on a timer, not deletion from the read path.** `NoteAutosave.MD` already
  put a *filter* on the reads, which is the cheap half; deleting from inside a `GET` is the
  expensive half and buys nothing. It would hide write work inside a read, do nothing at all
  for a Schedule nobody happens to open, and put a mutation on the path a user is waiting on.
  A `BackgroundService` is honest about being a maintenance job, and its interval is one number
  to reason about.
- **"What the store holds" and "what a caller sees" already diverge, deliberately.** That was
  settled by the read filter, and it is what lets this job be unhurried. This feature does not
  reopen it; it just stops the divergence accumulating.
- **A grace period, but it is a courtesy — the upsert is the safety mechanism.** A note is only
  pruned once its `ModifiedAt` is older than the grace period. An open dialog *can* be holding
  the id of a note this job considers a candidate — `NoteAutosave.MD` writes an emptied buffer
  through as a `PUT` with empty content, so clear a note, leave the dialog open, come back and
  type. Pruning it out from under that dialog is nonetheless harmless: the save is an idempotent
  upsert addressed by the *period*, which exists whether or not a note is in it, so the next
  write simply re-creates the note there. Nothing `404`s and nothing is lost. **5 minutes**,
  one constant, so the ordinary case never even reaches that path — but if the constant were
  wrong, the cost would be a reset `createdAt`, not a broken editor.
- **That is worth being explicit about, because it inverts the usual reasoning.** This job is
  allowed to be careless in a way most cleanup jobs are not, and the reason lives in the *other*
  feature. If `NoteAutosave.MD`'s write ever stops being an upsert, this grace period becomes
  load-bearing overnight and the constant has to be re-argued.
- **The sweep runs every minute.** Cheap — one pass over the store — and the worst case for an
  empty record is then about six minutes. It is a hygiene job, not something a user is waiting
  on, but there is no reason to make it lazy either.
- **"Empty" is the same definition on both sides, and the server owns the strict one.** Blank
  means null, empty, or whitespace-only after trimming — `string.IsNullOrWhiteSpace` — which
  matches what the UI's `isBlank` calls nothing to save. A note containing only a markdown
  marker (`#`, `-`) is **not** empty: it is a caller's content, and the prune is not a judge of
  whether writing is worth keeping.
- **Deletion is real, not soft.** There is no trash and no undo, per `NoteAutosave.MD`'s own
  deferral. A note that contained nothing has nothing to restore.
- **The clock comes from `TimeProvider`, and so does the timer.** `TimeProvider.CreateTimer`
  is what makes the interval testable with `FakeTimeProvider` instead of a `Thread.Sleep` in a
  test — this is the reason the seam was introduced, and this feature is where it pays off.
- **One prune method on the repository, not a query plus N deletes.** `PruneEmptyNotes(olderThan,
  ct)` returns how many it removed. Finding and deleting must happen under the store's single
  lock, or a note can be written between the find and the delete and lost.
- **It logs what it did, at information level when it removed anything and not at all when it
  did not.** A maintenance job that says nothing has no way to be trusted; one that says
  "removed 0" every minute forever is noise.
- **No configuration, no endpoint, no admin trigger.** Two constants in the service. If the
  numbers turn out wrong, that is a code change and a test change, which is the right amount of
  ceremony for a store that does not persist yet.

## Architecture

### `TimelyNotes.Backend/TimelyNotes.API`

- `Repositories/INoteRepository.cs` / `InMemoryNoteRepository.cs` —
  `Task<int> PruneEmptyNotes(DateTimeOffset modifiedBefore, CancellationToken ct)`, implemented
  under the same lock as the other operations.
- `Services/EmptyNotePruner.cs` — a `BackgroundService` holding the interval and the grace
  period, taking `IServiceProvider` (the repository is a singleton today, but a scoped one
  later must not force a rewrite), `TimeProvider` and `ILogger`. New folder; `CLAUDE.md`'s
  layout section gains it.
- `Program.cs` — `builder.Services.AddHostedService<EmptyNotePruner>()`.
- `TimelyNotes.API.Tests/Services/EmptyNotePrunerTests.cs`, mirroring the API layout as the
  existing test folders do.

Flow: the timer fires → `now - GracePeriod` → `PruneEmptyNotes` → log if anything went.

## Checklist

### 1. Repository

- [ ] Test first: a blank note older than the cutoff is removed and no longer appears in either
      read route; a blank note *newer* than the cutoff survives; a non-blank note of any age
      survives; a whitespace-only note counts as blank; a note containing `#` alone does not;
      the return value is the number actually removed; pruning an empty store returns `0`.
- [ ] `Task<int> PruneEmptyNotes(DateTimeOffset modifiedBefore, CancellationToken ct)` on
      `INoteRepository` — `ct` with no default. Document that `modifiedBefore` is exclusive and
      that the caller, not the repository, decides the grace period.
- [ ] Implement it in `InMemoryNoteRepository`, entirely inside the lock — find and remove in
      one critical section, so a concurrent write cannot be lost between the two.
- [ ] A test that a prune running concurrently with `Upsert` neither loses a written note nor
      throws — including an upsert that *creates* while the prune is deciding.

### 2. The background service

- [ ] Test first with `FakeTimeProvider`, driving the clock forward rather than waiting: nothing
      is pruned before the first interval elapses; a blank note older than the grace period is
      gone after one interval; a blank note written moments ago is still there after that same
      interval and gone after enough of them; the service keeps running after a prune throws.
- [ ] `EmptyNotePruner : BackgroundService` with `PruneInterval` (1 minute) and `GracePeriod`
      (5 minutes) as named constants, each with a one-line comment saying what it protects.
- [ ] The timer comes from `TimeProvider`, never `Task.Delay` on the ambient clock, so the test
      above is possible at all.
- [ ] Thread the `stoppingToken` into every call, and stop promptly when the host shuts down —
      a test asserts the service completes on cancellation rather than hanging the shutdown.
- [ ] A failed prune is logged as a warning and the loop continues; one bad pass must not end
      the service for the life of the process.
- [ ] Log at information level only when the count is non-zero, naming the count.
- [ ] Register with `AddHostedService<EmptyNotePruner>()` in `Program.cs`.

### 3. Guarding the autosave contract

- [ ] A test that states the interaction plainly: a note **emptied** while its dialog is open —
      `ModifiedAt` inside the grace period, content blank, exactly the state `NoteAutosave.MD`'s
      empty `PUT` leaves behind — is **not** pruned.
- [ ] The counterpart, and the more important one: the same note, once past the grace period,
      **is** pruned even with a dialog open on it, and a subsequent upsert at that period
      **re-creates** it rather than failing. Assert the round trip through the endpoint —
      prune, then `PUT`, then read it back — so the claim that this job cannot break an editor
      is a test rather than a paragraph. A later reader who "fixes" the prune to skip open notes
      should have to delete this test to do it.

### 4. Docs

- [ ] Update `CLAUDE.md` **Backend**: the pruner, the two constants and why the grace period
      exists, and the new `Services/` folder in the layout section.
- [ ] Update `CLAUDE.md` **Current state** once the feature is green.
- [ ] Update `DESIGN DOCUMENT.MD` to record that empty notes are swept server-side, so the read
      filter is a courtesy rather than the only thing keeping stray records out of sight.
- [ ] Add a line to `NoteAutosave.MD` in `done/` pointing at this feature as the sweep its
      best-effort `DELETE` leans on.

## Verify

- [ ] `dotnet test` and `dotnet build` from `TimelyNotes.Backend/` — green, no new warnings.
- [ ] `npm test` and `npm run test:e2e` from `timely-notes-ui/` — unchanged and still green;
      this feature touches no frontend code, and proving that is the point.
- [ ] By hand, with the constants temporarily shortened (and put back afterwards):
  - [ ] Create an empty note through `TimelyNotes.API.http`, wait past the grace period and one
        interval, and confirm it has gone from the list route.
  - [ ] Create a non-empty note, wait the same, and confirm it is still there.
  - [ ] With `./run-dev.ps1`, open a note in the browser, clear it, and leave the dialog open
        past an *interval* but inside the grace period: typing again still saves, no `404`.
  - [ ] The same but past the *grace period*: the note is pruned, and typing again re-creates it
        in the same period — a `201` where a `200` would have been, the text intact, nothing
        shown to the user. If that is not what happens, the bug is in `NoteAutosave.MD`, not
        here.
  - [ ] Watch the log: a line when something was removed, silence when nothing was.

## Deferred

- **Configuration of the interval and grace period.** Two constants until there is a reason.
- **Pruning anything but empties** — no age-based archiving, no retention policy. This job has
  exactly one rule.
- **A soft delete or an undo.** An empty note has nothing to restore; if that changes, it
  changes for the user-facing `DELETE` first.
- **Telling the client.** The UI is not notified, so a browser left open can still hold the id
  of a note this job removed. Already handled from the other side, structurally: the next save
  is an upsert, so it re-creates the note rather than failing. Genuine revalidation belongs with
  whatever feature introduces it.
- **Running the prune anywhere but in-process.** With a real store this may want to be a
  database job or a scheduled task instead of a hosted service in the API. Revisit when the
  persistence question is answered.

## Implementation notes

_Left empty at specification time — the implementing agent fills this in._
