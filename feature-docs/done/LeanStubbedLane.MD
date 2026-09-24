# Lean Stubbed Lane

## Goal

**The `stubbed` Playwright lane only checks what jsdom cannot.**

The lane has 89 tests, and most of them repeat a Vitest test that already exists. That second copy
costs a build, a browser and a real-time wait for each assertion, and it slows the lane down on a
developer machine. This feature puts every stubbed spec into one of three groups:

- **Keep.** Only a browser can show it.
- **Move.** jsdom can show it, but no Vitest test does yet. Write that test first, then delete the
  spec.
- **Delete.** A named Vitest test already asserts it.

Done means the lane has 22 tests, each kept for a reason stated below. *(Finished at 15: the kept
tests that shared a page load were merged. See Implementation notes.)* Every moved behaviour has a
Vitest test that has been seen to fail. `CLAUDE.md` says what a Playwright spec is for, so the lane
does not grow back.

These are the only things a real browser can show here:

1. **Layout and scrolling.** In jsdom every box is 0×0 and `scrollIntoView` does nothing.
2. **The native `<dialog>`.** `showModal`, `inert`, the backdrop, and the browser's own close
   sequence on Escape. The focus-restore invariant in `CLAUDE.md` depends on that sequence.
3. **The real MDXEditor.** The unit suites mock `NoteEditor`.
4. **A pinned timezone.** Only E2E asserts a literal URL.

A spec that tests none of these four is duplicating a unit test.

## Scope decisions

1. **The integrated lane stays as it is.** It has five specs, it is not the slow one, and
   `UserNotes.MD` §9 changes it anyway.
2. **Nothing is deleted before its replacement is green.** A spec in the "Move" group goes only
   after its Vitest test exists and has failed against broken code. These are tests for code that
   already exists, so they pass straight away. To make TDD mean something, break the line the test
   covers, watch the test fail, then restore the line.
3. **Two specs are merged into one test.** Under UTC+12, `api-contract.spec.ts:70` checks the
   request and `:79` checks what is rendered, for the same page load. They become one test with
   both sets of assertions.
4. **The two known flakes get no special treatment.** `calendar.spec.ts:121` and
   `note-dialog.spec.ts:166` have each failed about once in fifty full-lane runs, and neither has
   been diagnosed. `TrustworthyLane.MD`, which was specified to diagnose them, is withdrawn.
   `calendar.spec.ts:121` is deleted like any other duplicate, and `note-dialog.spec.ts:166` is
   kept on its merits. A flake in the smaller lane is diagnosed from scratch.
5. **The lane's configuration stays as it is.** No changes to the workers, the `webServer` command
   or `reuseExistingServer`. See Deferred.

## The audit

References are `file:line` in `timely-notes-ui/e2e/`. Vitest references are test titles; the
unmarked ones are in `App.test.tsx`.

### `api-contract.spec.ts` — 9 → 2

| Spec | Verdict | Why |
| --- | --- | --- |
| `:10` three-day, half-open window · `:19` nothing to escape · `:25` same-origin under the short name | Delete | The UTC+12 test asserts the same path and query literally, and it is the zone where they can go wrong. `notesApi` *calls the same origin when no API origin is configured*. |
| `:46`, `:52` under UTC−7 | Delete | `notesApi` *asks for the same URL in %s* and `days` *reads local fields, not UTC ones, in %s* already run in `America/Los_Angeles`. At that instant UTC−7 is on the same calendar day as London, so the test cannot catch a `Date` in the day path. |
| `:70` UTC+12 asks for its own day · `:79` renders that zone's days | **Keep, merged into one test** | The only zone where a stray `toISOString` would request the wrong day. |
| `:106` the write address in London | Delete | `notesApi` *PUTs to the period the note is addressed by*, and *writes the note to the period it was opened on*. |
| `:119` the write address under UTC+12 | **Keep** | The literal write URL, in the zone where the calendar day differs. |

### `calendar.spec.ts` — 11 → 2

| Spec | Verdict | Why |
| --- | --- | --- |
| `:17` header outside the scroll | Delete | `layout.spec.ts:64` measures the same geometry. The header's buttons are covered by *offers Menu, Calendar and Note now*. |
| `:33` scrolls to either end without gaining a day | Delete | This guarded the infinite scroll that was removed. `ScheduleView` *carries no navigation of its own but the two arrows*. |
| `:47` modal month grid | **Keep** | Native `<dialog>`: `showModal`, focus and pointer interception. |
| `:63` Monday-first whole weeks | Delete | `MonthGrid` *renders a weekday header starting on Monday*, *dims the days outside the month but leaves them selectable*, and the `months` grid tests. |
| `:80` counts once per grid, none before open | Delete | *requests no counts until the calendar is opened*, and `useNoteDays` *requests the whole grid once*. |
| `:93` marks the seeded days | Delete | `MonthGrid` *marks a day that has notes and says how many* and *leaves a day with no notes unmarked*. |
| `:104` a new month asked for once | Delete | *asks for a month grid once, however often it is paged back to*, and `useNoteDays` *requests only the new grid…*. |
| `:121` re-points the view, in one request | Delete | *re-points the view at a day picked in another month, in one request*, and *selects the first period of a day picked in the past*. Also a known flake, per scope decision 4. |
| `:141` notice on a jump, dropped on Go to today | Delete | *notices a calendar jump*, *offers the way back…* and *goes back to the current three days from a jump*. |
| `:155` picking today is Go to today | Delete | *picking the current day is Go to today*. |
| `:170` closes on Escape | **Keep** | The browser's own close sequence. Vitest only dispatches `cancel`. |

### `day-view.spec.ts` — 11 → 0, file deleted

| Spec | Covered by |
| --- | --- |
| `:10` lands on the app | Every kept spec loads the app. |
| `:14` focus day and its neighbours | *renders the focus day and its two neighbours, and nothing more* |
| `:20` eight rows at 3h, 00:00–21:00 | `DaySection` *renders one row per period it is given*, `PeriodRow` *shows the period start time*, and `periods` `buildPeriods` |
| `:39` exactly one current row | `DaySection` *marks exactly one row as current* |
| `:49` a note placed by its period | *places a note by its period, not by the day it was written on* |
| `:58` a note on the day it is addressed to | *puts a note on the day it is addressed to, not on the day in view* |
| `:63` one entry, as text, nothing to press | `PeriodRow` *shows its note as text, with no time of day and nothing to press* |
| `:73` a one-line excerpt | `notes` `noteExcerpt` |
| `:77` nothing in an empty period | `PeriodRow` *renders nothing note-shaped for an empty period* |
| `:81` loading marker | *says a day is loading until its notes land*, and `DaySection` *says so while its notes are still in flight* |
| `:94` error alert, rows still rendered | *shows an error instead of a blank page when the fetch fails* |

### `layout.spec.ts` — 5 → 5

All five stay. They measure real geometry, scrolling and computed style, and none of that exists
in jsdom.

### `menu.spec.ts` — 5 → 3

| Spec | Verdict | Why |
| --- | --- | --- |
| `:9` modal drawer, takes focus | **Keep** | Native `<dialog>`. |
| `:24` Escape returns focus to Menu | **Keep** | The focus-restore invariant depends on the browser's close order. |
| `:34` a press outside closes it | **Keep** | Hit-testing. Only the real layout puts that point on the backdrop. `MenuDrawer` clicks the element directly. |
| `:44` a Schedule press closes and re-chunks | Delete | *re-chunks the days and closes the drawer on a Schedule press* |
| `:56` pressing the chosen Schedule closes it | Delete | *closes the drawer on a press of the Schedule already chosen* |

### `note-dialog.spec.ts` — 23 → 9

| Spec | Verdict | Why |
| --- | --- | --- |
| `:40` opens blank, headed with the period | Delete | *opens a blank dialog titled with the selected period*. `:302` shows a blank real editor. |
| `:47` existing markdown rendered, not flattened | **Keep** | Real editor. |
| `:56` headed with the period it was opened on | Delete | *opens the selected period's own note, with its content* |
| `:63` genuinely modal | **Keep** | Native `<dialog>`. |
| `:80` open and close untyped: no write | **Keep** | Real editor. The test fails if MDXEditor normalises its input and fires a change on mount. The mock never does that. |
| `:93` the same for Escape | Delete | `:80` covers the editor side. `useNoteAutosave` *never writes an unchanged buffer* and *removes nothing when the buffer is blank and nothing was ever written* cover the close. |
| `:101` typing: one PUT after the debounce | **Keep** | Real editor to autosave: the lane's main journey. |
| `:117` typing more writes to the same URL | Delete | `useNoteAutosave` *makes the second write the same call as the first*. The store count comes from the stub. |
| `:133` clearing writes it empty, then deletes on Done | **Keep** | Real editor. What select-all and Backspace leave behind is the editor's behaviour, not the mock's. |
| `:155` a cleared note stays gone on reload | Delete | This tests the stub's read filter. The server's filter is tested in xUnit. |
| `:166` clearing and pressing Escape deletes it | **Keep** | The native close sequence. Also a known flake, per scope decision 4. |
| `:184` typing after the note was swept | Delete | `useNoteAutosave` *just writes again when the note has been swept from under it*. The upsert is the server's. |
| `:204` write, close, reopen | Delete | `useScheduleNotes` *puts a saved note in its day's bucket without a refetch*, and *leaves the row holding one entry after its note has been opened*. `:47` covers re-seeding the real editor. |
| `:223` save status line | Delete | `NoteDialog` *reports the save as it happens, stamped by this browser's clock* |
| `:234` a failed write keeps the dialog open | Delete | `NoteDialog` *stays open on a failed write, and closes on a second Done* and *announces a failure rather than swallowing it* |
| `:253` a blank-content note is not rendered | **Move** | The filter is `useScheduleNotes.ts:123`. Only a cache edit is tested, never a fetched blank note. |
| `:273` Bold wraps in `**` | **Keep** | Real editor. |
| `:288` `#` becomes a heading | **Keep** | Real editor. |
| `:302` blank editor after a filled one closed | **Keep** | Real editor, and the only kept check that it opens blank. |
| `:315` Note now opens the clock's period | Delete | *opens the current period, with that period's own note* |
| `:322` Note now ignores the selection | Delete | *opens the current period even while another row is selected* |
| `:330` Note now comes back from a jump | Delete | *brings the view back to today before opening, from a day jumped to* |
| `:345` Note now after a rollover | **Move** | No Vitest test opens Note now after midnight. |

### `schedule.spec.ts` — 5 → 0, file deleted

| Spec | Covered by |
| --- | --- |
| `:10` only the chosen one pressed, every day re-chunked | `SchedulePicker` *presses only the selected schedule*, and *re-chunks the days and closes the drawer on a Schedule press* |
| `:37` the new short name asked for once | *fetches once per schedule change, not once per render* and *refetches with the new short name when the schedule changes* |
| `:50` a pinned selection re-anchored | *keeps the selection on the current period after switching schedule*, and *leaves the window where it is when the Schedule changes, re-deriving the ordinal from now* |
| `:65` no menu while a dialog is open | The same modality as `note-dialog.spec.ts:63`. Why `App` has no guard is recorded here, not in a spec. |
| `:80` the new schedule's own notes | `useScheduleNotes` *drops the cache and refetches under the new short name when the schedule changes* |

### `selection.spec.ts` — 14 → 0, file deleted

| Spec | Verdict | Covered by / why |
| --- | --- | --- |
| `:11` selects the current period | Delete | *selects the period holding the current time on load, and puts the Note button there* |
| `:20` a click moves the selection, opens nothing | Delete | *moves selection and the Note button when another row is clicked*, *does not open the editor when a row is merely selected* |
| `:31` the marker stays when the selection moves | Delete | `DaySection` *leaves selection and the clock independent* |
| `:39` the selection is page-wide | Delete | *highlights the pressed row, and no row on any other day* |
| `:49` no way into an unselected row | Delete | `PeriodRow` *has no button at all when it is not selected, note or no note* |
| `:57` opens the selected period's own note | Delete | *opens the selected period's own note, with its content* |
| `:66` Note leaves the selection alone | Delete | `PeriodRow` *opens %s without re-selecting* |
| `:73` Enter selects a focused row | **Move** | `PeriodRow` tests only clicks. |
| `:81` Space selects without scrolling the page | **Move** | This test cannot fail. It reads `window.scrollY`, but `body` is `overflow: hidden`, so that value is always 0. The real guarantee is the `preventDefault` in `PeriodRow`'s key handler, and Vitest can check that directly. |
| `:91` Enter on the button opens | **Move** | Covers the `target === currentTarget` guard in the same handler, which is untested. |
| `:102` rolls over at midnight, asking for one day | Delete | *follows the clock over midnight: the window moves on, one more fetch, one new day* |
| `:125` window carried, selection left behind | Delete | *carries the window over midnight while the selected row stays behind* |
| `:143` a neighbouring day's row redraws nothing | Delete | *leaves the three days exactly where they are when a row on the last of them is pressed*, and `ScheduleView` *does not scroll when the window stands still* |
| `:160` an open dialog survives midnight | Delete | *leaves an open dialog alone over midnight* |

### `window.spec.ts` — 6 → 1

| Spec | Verdict | Why |
| --- | --- | --- |
| `:16` an arrow at either end | Delete | `ScheduleView` *puts one at either end of the scroll container, named twice over* |
| `:25` steps on from the end of the last day | Delete | *steps the window a whole three days on, abutting the ones left*. `:79` scrolls to the end first too. |
| `:34` comes back to the three it started on | Delete | *returns to the three it started on when stepped forward and back*, and `window` *returns to where it started* |
| `:45` the selection is found again | Delete | *leaves the selection behind when the window steps away, and finds it again on the way back* |
| `:62` says what is being viewed | Delete | *says what is being viewed once today has been stepped off screen, and follows further steps* and *restores both the window and the clock-following selection from Go to today* |
| `:79` lands on the adjacent day either way | **Keep** | Real scroll position. `ScheduleView` only sees a mocked `scrollIntoView`. |

## Architecture

All the work is in `timely-notes-ui/`. `TimelyNotes.Backend` is not touched.

| Where | Change |
| --- | --- |
| `src/components/PeriodRow.test.tsx` | Three keyboard tests: Enter, Space, and Enter on the button. |
| `src/hooks/useScheduleNotes.test.tsx` | A fetched note with blank content is not in its day's list. |
| `src/App.test.tsx` | Note now after a midnight rollover, in `App — live clock`. |
| `e2e/*.spec.ts` | Merges and deletions from the audit. `day-view`, `schedule` and `selection` are deleted. |
| `e2e/fixtures/ScheduleView.ts`, `e2e/fixtures/app.ts` | Members and stub helpers that no kept spec uses are removed. |
| `CLAUDE.md` | The rule for what goes in the lane, and the navigation and test counts. |

## Checklist

### 1. Measure first

- [x] Record the wall-clock time of `npm run test:e2e` in the implementation notes twice. First
      from cold, with `dist/` deleted and nothing on 5174. Then with a preview server already
      running, which is the test time without the build.

### 2. Moves: Vitest first, each one seen to fail

- [x] `PeriodRow`: Enter on a focused row selects it. Seen red with the `Enter` branch removed.
- [x] `PeriodRow`: Space on a focused row selects it, and the keydown is default-prevented. Seen red
      with `preventDefault` removed.
- [x] `PeriodRow`: Enter on the Note button opens the note and does not select. Seen red with the
      `target === currentTarget` guard removed.
- [x] `useScheduleNotes`: a fetched note whose content is blank is not in its day's list. Seen red
      with the `isBlank` filter removed.
- [x] `App — live clock`: after a midnight rollover, Note now opens the new day's first period.
      Seen red by making Note now open the selection instead.

### 3. Prune the lane

- [x] `api-contract.spec.ts`: ~~two tests, as audited~~ one test: the UTC+12 read, render and write.
- [x] `calendar.spec.ts`: ~~two tests, as audited~~ one test: modal, then Escape.
- [x] `menu.spec.ts`: ~~three tests, as audited~~ two: modal then Escape, and the outside press.
- [x] `note-dialog.spec.ts`: ~~nine tests, as audited~~ six, merged as in the notes.
- [x] `window.spec.ts`: one test, as audited.
- [x] `day-view.spec.ts`, `schedule.spec.ts` and `selection.spec.ts` are deleted.
- [x] Remove the `ScheduleView` page-object members and `ApiStub` helpers that nothing uses any
      more. `npm run lint` and `tsc -b` are clean.
- [x] `npx playwright test --list --project=stubbed` reports ~~22~~ 15 tests.

### 4. Keep it lean

- [x] Add a rule to `CLAUDE.md` › Engineering rules: *a stubbed spec checks only what jsdom cannot:
      layout and scrolling, the native `<dialog>`, the real editor, or a pinned zone.*
- [x] Update `CLAUDE.md` › Navigation for the deleted spec files.

## Verify

- [x] `npm run lint`, `npm test` and `npm run build` from `timely-notes-ui/`, all green, with five
      more Vitest tests than before.
- [x] `npm run test:e2e`, with ~~22~~ 15 tests green, timed both ways as in §1. Record both times next to
      the baseline.
- [x] `npm run test:e2e:integrated`: five tests, green and untouched.

## Deferred

- **The lane's own speed.** `webServer` runs `npm run build` on every cold run, and locally there
  are two workers. Both are deliberate, as the comments in `playwright.config.ts` explain. After
  this feature, §1's two timings show whether the build or the tests dominate.
- **The flakes.** If `note-dialog.spec.ts:166`, or anything else in the smaller lane, fails
  intermittently, it gets its own specification. That specification starts by capturing the
  failing values.
- **The E2E work in `UserNotes.MD` §9.** It adds one stubbed spec, for the `Authorization` header
  in the `e2e` build mode. That fits the new rule, because only the built bundle has the mode.
- **Duplication inside Vitest.** `App.test.tsx` repeats some component tests. That makes the unit
  suite slower, not the lane, so it is out of scope here.

## Implementation notes

- **Baseline, 89 tests.** Cold (`dist/` deleted, nothing on 5174): 45 s wall clock, Playwright
  reporting 43.7 s. Warm (preview server already up): 19 s, Playwright reporting 18.3 s. The build
  and server start cost about 26 s of the cold run.
- **Space is checked by `fireEvent.keyDown`'s return value**, which is `false` once the handler
  calls `preventDefault`. `userEvent` hides that.
- **Further merges, 22 → 15.** Each stubbed test pays a browser context and a cold load of the
  editor bundle, so kept tests sharing a page load became one test:
  - `api-contract`: the UTC+12 read, render and write in one load. The same-origin check from the
    deleted `:25` went into it at no cost.
  - `calendar` and `menu`: the modal check and the Escape close are one open-then-close journey.
  - `layout`: the two 1h tests are one. Both switched to 1h first.
  - `note-dialog`: `:47`, `:80` and `:302` are one test. It opens the markdown note, runs the
    clock past the debounce, closes it, opens an empty period, and asserts no write at the end.
    This is stronger than `:80`, which only opened an empty note, because normalising real
    markdown is what would fire a spurious change. `:101` and `:288` are one test: the typed `#`
    becomes a heading and is written in one PUT.
- **`:166` no longer reloads.** The reload after the Escape delete checked the stub's read filter,
  the reason `:155` was deleted.
- **The modal checks wait 250 ms, not 2 s, for the click they expect to fail.** Playwright reports
  "intercepts pointer events" on its first attempt, so the longer timeout was 2 s of idle time in
  each of three tests.
- **The fixtures went too.** `ScheduleView` lost fourteen members. `ApiStub` lost its failure,
  delay, inspection and window-summary helpers, and the `logs` fixture. The seed keeps only the
  three `s3` notes the kept specs read. The `note-days` route is still stubbed, because opening the
  calendar requests it.
- **`NowOnTheGrid.MD` §5 is repointed.** It named `day-view.spec.ts` and `selection.spec.ts`. Its
  geometry checks now go in `layout.spec.ts`. The DOM-only checks were already Vitest items in its
  §2 and §3, except the line crossing midnight, which becomes an `App — live clock` test.
- **The first baseline was an unusually cold machine.** Rerun back to back with the new lane, the
  old 89 tests took 24 s cold (22.6 s reported). `npm run build` alone takes about 3 s.
- **Result.** Stubbed lane: 15 tests. Cold 9 s (8.1 s reported), against 24 s. Warm 5 s (4.3 s
  reported), against 19 s. Ten repeats with `--repeat-each=10`: 150 passed, none flaky. Vitest has
  388 tests, five more than before. Lint, build and `tsc -b` are clean. Integrated lane: 5 passed,
  untouched.
