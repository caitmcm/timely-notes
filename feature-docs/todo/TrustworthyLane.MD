# Trustworthy Lane

## Goal

**The `stubbed` Playwright lane passes every time, or fails for a reason.**

Three specs in that lane fail intermittently at a rate of roughly one run in fifty. Two are still
outstanding and are the subject of this document; the third is fixed and is here only as evidence
of the pattern. Until they are closed, a red lane means nothing — which is worse than a slow one,
because the cost lands on whoever next changes the code and has to decide whether they broke it.

The three:

| Spec | What it asserts | What was seen |
| --- | --- | --- |
| `calendar.spec.ts:120` *re-points the view at a day picked from the grid, in one request* | `api.notesWindows` is exactly `[MOUNT_WINDOW, JUMP_WINDOW]` | Not equal. **The actual value was not captured.** |
| `note-dialog.spec.ts:166` *clearing and pressing Escape deletes the note too* | `api.writeSummary` is `PUT` then `DELETE` | A second `PUT` before the `DELETE`. Fixed — unmount aborted the write `finish` was waiting on |
| `note-dialog.spec.ts:234` *says so when a write fails, and keeps the dialog open* | the dialog is still open | The dialog had closed. Fixed — see `LocalPostgres.MD` §8 |

The first two are **request-count** assertions, and both stand on invariants in `CLAUDE.md`: *a
tick must never cause a refetch*, and the upsert being idempotent so a double-invoke cannot matter.
Either the app is breaking one of those under load, or the specs are asserting counts at a moment
the app has not reached yet. Which of those it is decides whether this feature changes `src/` or
`e2e/`, and **that is the question this document exists to answer first.**

Following TDD per `CLAUDE.md`: if the app is at fault, the fix starts with a failing Vitest spec,
never with an edit to the Playwright spec. If the lane is at fault, the fix is in the lane and the
app is not touched. Deciding which without evidence is how a real bug gets papered over with a
`waitFor`.

## Scope decisions

1. **Diagnose before fixing, and capture the evidence.** The first failure is a reproduction with
   its actual values recorded — for `calendar.spec.ts:120` that means knowing whether the extra
   window is a *third distinct* one or a missing second one, which the assertion's diff shows and
   nobody has yet read. Every hypothesis below is written as a hypothesis for that reason.

2. **A flake is a defect, not a retry setting.** Neither `retries` nor a `test.fixme` is an
   outcome here. The lane already runs with `retries: 0` locally and `2` in CI; nothing about
   that changes.

3. **The lane's determinism is the product.** If the finding is that a spec asserts a count before
   the app could have reached it, the fix is to make the spec wait for the app's *state*, not to
   loosen what it asserts. `api.writeSummary` staying an exact sequence is the point of it.

4. **Do not widen `settle()` into a general sleep.** It advances the page clock and polls a request
   count, and its weakness — below — is specific. Replace the guarantee it is missing, do not add
   slack to it.

5. **One document for all of the remaining flakes**, because the two outstanding ones are both
   request-count assertions and may share a cause. If the diagnosis shows they do not, the second
   is split out rather than carried along.

6. **No change to the worker count, the preview server or the fixture's routing** as a way of
   making failures go away. They are the conditions the lane runs in; a flake that only hides at
   one worker is not fixed.

## Hypotheses

Written down so they can be killed. Each names what would confirm or refute it.

### A. `settle()` waits for the request, not for the app to have processed the reply

```ts
const settle = async (page: Page, api: ApiStub, expected: number) => {
  await page.clock.runFor(PAST_THE_DEBOUNCE_MS)
  await expect.poll(() => api.writes.length).toBe(expected)
}
```

`api.writes` is pushed **in the route handler**, when the request arrives. `useNoteAutosave` only
marks the buffer clean (`written.current = sending`) when the *response* resolves. Between those
two moments the buffer is still dirty, so anything that flushes — `Escape`, which tears the body
down and runs `finish()` — issues a **second, identical `PUT`**.

That is exactly the extra write in `note-dialog.spec.ts:166`, it is harmless in production (the
upsert is idempotent, which is the whole reason it is one), and it is load-sensitive because the
gap between request and response widens under contention.

- **Confirms it:** a reproduction where the second `PUT` carries the same content as the first, and
  the trace shows it issued after `Escape`.
- **Refutes it:** the two `PUT`s differ, or the second precedes the `Escape`.
- **If confirmed** the defect is in the lane: `settle` should wait on the app's own signal — the
  `Saved HH:MM` status line, which only appears once the response has been applied — rather than on
  a request count.

### B. The calendar jump asks for a third window

`useScheduleNotes`'s effect depends on `[schedule, wantFrom, wantTo]`, and `wantFrom`/`wantTo` are
derived from `focusDay = pinned?.day ?? currentDay`. A render where `focusDay` is briefly neither
the mount day nor the jump day would ask for a window that is neither, and `notesWindows`
**deduplicates**, so a failure there means a genuinely different window, not a repeat.

`handlePickDay` sets `isCalendarOpen` and `pinned` in the same handler, so React batches them and
no intermediate `focusDay` should exist. `useNow` cannot supply one either: the clock is paused, so
its tick never fires, and its visibility resync reads the same frozen instant.

- **Confirms it:** the captured value has three entries.
- **Refutes it:** the captured value has *two* entries, or one — in which case this is hypothesis C.

### C. The calendar spec reads the window list before the request is recorded

The final assertion is a bare `expect`, not a poll. The assertions before it wait for the day
headings and for the jumped-to notes to be visible, and those notes can only come from the jump
response — which would mean the request was recorded first. That reasoning is why this is the
weaker hypothesis, and it is also worth checking rather than trusting: the day headings poll can
pass on a render before the notes arrive.

- **Confirms it:** the captured value is `[MOUNT_WINDOW]` alone.
- **If confirmed** the fix is `expect.poll`, and the same review applies to every bare `expect` on
  an `api.*` accessor in the lane.

## Architecture

Where the work lands depends on the diagnosis, and both directions are cheap:

| Where | If |
| --- | --- |
| `timely-notes-ui/e2e/note-dialog.spec.ts` | Hypothesis A — `settle` gains the guarantee it is missing. One helper, used by every write spec. |
| `timely-notes-ui/e2e/fixtures/app.ts` | If the stub needs to expose when a reply has been *delivered*, rather than only when a request arrived. |
| `timely-notes-ui/e2e/calendar.spec.ts` | Hypothesis C — a bare `expect` on an async accessor becomes a poll. |
| `timely-notes-ui/src/hooks/useScheduleNotes.ts` | Hypothesis B — and then a failing Vitest spec comes first, per `CLAUDE.md`. |

**Nothing in `TimelyNotes.Backend` is touched.** The lane stubs every `/api/**` call, so the
backend is a fixture here whatever the finding.

### Measuring anything at all

Two traps cost most of a session before this document existed. Both are now checklist items rather
than folklore:

- **`reuseExistingServer` is `!CI`.** A preview server left listening on `5174` is reused and
  `npm run build` never runs, so a run can serve a bundle from before the change under test. Kill
  every `node` process and delete `dist/` before measuring.
- **`test-results/` is cleared at the start of each run.** A failure's `error-context.md` and trace
  are gone the moment the next run starts. Capture them from the failing run itself.

At roughly a 2% rate, **a single green run proves nothing**. Forty repeats of one spec take about
thirty seconds (`--repeat-each=40`); that is the unit of evidence here.

## Checklist

### 1. Reproduce and capture — before any fix

- [ ] Kill every `node` process, delete `dist/` and `test-results/`, and rebuild, so the bundle
      under test is the current source.
- [ ] Reproduce `calendar.spec.ts:120` with `--repeat-each` and `--trace on-first-retry`, and
      **record the actual `notesWindows` value** in the implementation notes. Forty repeats did not
      reproduce it; the full lane did, so the reproduction may need the whole lane's load.
- [ ] From that value, mark hypothesis B or C confirmed and the other dead. Write down which.
- [ ] Reproduce `note-dialog.spec.ts:166` the same way and record the two `PUT`s' contents and
      their order against the `Escape`.
- [ ] Record the failure rate of each, out of a stated number of attempts. A fix's evidence is a
      comparison against this number.

### 2. Close the write-count flake (hypothesis A, if confirmed)

- [ ] Test first, Vitest: pin whatever the diagnosis says the app should do — if the second `PUT`
      is correct behaviour, a spec saying so; if it is not, a failing spec for the hook.
- [ ] Give `settle()` the guarantee it lacks: wait on the state the app reaches when a write has
      been *applied*, not on the count of requests that have arrived.
- [ ] Every other use of `settle()` in the lane still passes unchanged — it is used by most of the
      write specs, and a change to it is a change to all of them.
- [ ] Forty repeats of `note-dialog.spec.ts:166` green.

### 3. Close the window-count flake (hypothesis B or C)

- [ ] **If B:** a failing Vitest spec for `useScheduleNotes` first, reproducing the extra window
      from the render sequence the trace shows. Then the fix, then the spec.
- [ ] **If C:** the bare `expect` becomes `expect.poll`, and every other bare `expect` on an
      `api.*` accessor in the lane is reviewed for the same fault.
- [ ] Forty repeats of `calendar.spec.ts:120` green.

### 4. Prove the lane, not the spec

- [ ] Ten consecutive full-lane runs, all 73 green. The failures only ever appeared in full-lane
      runs, so a repeat of one spec is not the evidence that closes this.
- [ ] Record the count in the implementation notes, so the next person inherits a number rather
      than a claim.

### 5. Leave the traps written down

- [ ] `CLAUDE.md`: the `reuseExistingServer` trap and the "forty repeats, not one run" rule, beside
      the existing Playwright guidance.
- [ ] Any invariant the diagnosis turns out to have proved or broken, in its own words.

## Verify

- [ ] `npm test` and `npm run lint` from `timely-notes-ui/` — green.
- [ ] `npm run test:e2e` ten times consecutively — 73 green each time, on a bundle built after the
      last source change.
- [ ] `dotnet build` and `dotnet test` from `TimelyNotes.Backend/` — untouched and green, proving
      this stayed on one side of the repo.
- [ ] The failure rate recorded in section 1 is stated against the runs since the fix, so "fixed"
      is a comparison and not an assertion.

## Deferred

- **The `integrated` lane.** Five specs, and none of them has flaked. It stays small and stays out
  of this.
- **Anything about CI's timing.** CI runs one worker with two retries and has not shown these
  failures. If the diagnosis turns out to be load-shaped, whether CI should keep its retries is a
  separate question.
- **A general "wait for idle" helper for the lane.** Tempting once `settle` is being touched, and
  it is how a lane stops asserting anything: a spec that waits for quiet no longer says *when* the
  app should have been quiet. Each spec keeps waiting on the state it is about.
- **The flake rate of the whole suite.** This document covers the three known specs. If a fourth
  appears, it is evidence for the same investigation, not a reason to widen the scope to "make the
  suite fast and reliable".

## Implementation notes

*Filled in as the work lands. Section 1's captured values are the first entry, and nothing in
sections 2 or 3 starts before they are written down.*
