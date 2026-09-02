# Playwright end-to-end testing

## Goal

Give `timely-notes-ui` a browser-driven **acceptance** test layer so an agent can prove a finished
UI feature actually works — not merely that its components call the right callbacks — and can do so
unattended, from a single command, without a human watching a browser.

This layer sits after implementation, not inside it. TDD stays the implementation loop and Vitest
stays its tool; Playwright is what confirms the assembled app does what the specification promised
once the loop is done.

Today the frontend has 176 Vitest tests running in jsdom. They are good tests, and they stay. But
jsdom is a simulation, and three things the app genuinely depends on are simulated away:

- **The native `<dialog>`.** `src/test/setup.ts` stubs `showModal`/`close` because jsdom has
  neither. So `NoteDialog`'s modality, its focus behaviour and its `onCancel` (Escape) path have
  never been executed — the Escape-to-close wiring is untested code.
- **Layout.** `App.css` makes the day column a fixed-height flex stack so that a 6h row is exactly
  six times a 1h row, `DaySection` scrolls the selected row into view on mount, and the schedule
  grows a day at a time as its scroll container reaches an edge — an IntersectionObserver against
  real layout. jsdom has no layout engine: every box is 0×0, `scrollIntoView` is a no-op and the
  observer is a stub driven by hand. All of it is asserted only by eye.
- **MDXEditor.** The dialog tests mount the real editor, but only ever read text out of it. Typing,
  the toolbar and the markdown shortcuts — the whole reason the editor is there — are unexercised.

This feature adds Playwright to `timely-notes-ui`, a deterministic harness (frozen clock, pinned
timezone, stubbed network), a page object speaking the same accessible-role vocabulary the unit
tests already use, and a suite of **behaviour** specs derived from the existing unit tests: each one
a user-visible journey rather than a prop contract. It also adds a small second lane that runs the
same app against the real API, so the two projects are proven to agree on the wire format.

Done means: `npm run test:e2e` from `timely-notes-ui/` starts a dev server, runs the suite headless
in Chromium, and prints a plain-text pass/fail list — with no browser window, no report server left
listening, and no dependency on the .NET SDK. `npm run test:e2e:integrated` additionally starts the
API and runs the handful of specs that need it.

## Scope decisions

- **Playwright, not Cypress.** Node-native, no separate runner daemon, first-class `page.clock` and
  `page.route`, and a headless-by-default CLI whose output an agent can read. It also ships the
  `getByRole` locator family, so the E2E specs can address the UI through the same accessible names
  (`option` named `18:00 – 21:00`, `button` named `Note`) the Vitest suite already asserts on.
- **Playwright lives in `timely-notes-ui/`, not at the repo root.** It tests the frontend, its
  config needs `vite.config.ts`'s proxy, and it installs as a dev dependency of that package. The
  repo has no root `package.json` and this feature does not add one.
- **Two lanes, and the default lane is hermetic.**
  - **Stubbed** (default, the large majority): every `/api/**` request is fulfilled by `page.route`
    from a fixture. No backend, no .NET SDK, no seeded data to drift. This is the lane an agent runs
    while iterating on a UI change.
  - **Integrated** (`@integrated` tag, opt-in): the real API on 5186 through the real Vite proxy.
    Only the assertions that are *about* the two projects agreeing — the query string is accepted,
    the seeded notes render, the response shape parses. Kept deliberately small, because it is the
    slow and flaky lane.
- **Chromium only.** Firefox and WebKit are deferred; the app has no browser-specific code, and each
  extra engine is another multi-hundred-megabyte download in an agent's environment.
- **Time is frozen and the timezone is pinned.** Since `LiveClock.MD` the app reads the clock
  continuously — `useNow` ticks on the minute and resyncs on visibility and focus — and does all its
  bucketing in local time, so an E2E run is only reproducible if the clock is both fixed and held
  fixed, and the timezone pinned.
  `playwright.config.ts` pins `timezoneId: 'Europe/London'` and `locale: 'en-GB'`; the harness fixes
  the clock at **20:20 on 25/08/2026** — the instant the `FrontendSkeleton` mockup is drawn at — so
  the E2E specs and the unit tests describe the same screen.
  - Frontend unit tests assert URLs *structurally* because they must pass in any timezone
    (`CLAUDE.md`). Playwright pins the timezone instead, so an E2E spec may assert the literal
    `2026-08-24T00:00:00+01:00`. One spec deliberately re-runs under a second timezone to keep the
    offset logic honest, which is the assertion the structural unit test is standing in for.
- **The stubbed lane asserts on requests as well as responses.** `page.route` sees the real URL the
  real browser built, which is a stronger statement about `notesApi.ts` than a `fetch` mock is.
- **These are acceptance tests, and they are not part of the TDD loop.** TDD is the inner loop of
  implementation: a failing **unit** test, then the feature code that satisfies it, then a refactor.
  That loop stays exactly as `CLAUDE.md` and `WORKFLOW.MD` describe it, and Vitest remains the tool
  for it. Playwright sits **after** implementation, asserting that the finished feature behaves
  correctly in a real browser end to end. It never drives the design of the code, and no unit test
  is skipped on the grounds that a Playwright spec covers the same ground.
  - This feature is therefore not itself a TDD exercise. The UI it covers is already built, so §1
    and §2 are **setup steps** (as `WORKFLOW.MD` allows) and §3–§8 are acceptance specs written
    against behaviour that already exists.
- **No visual regression snapshots.** Screenshot diffing is deferred: the styling is plain CSS with
  `light-dark()` and no design system, so a snapshot would break on every colour tweak and teach an
  agent to run `--update-snapshots` reflexively. The layout facts that matter — row proportionality,
  scroll-into-view — are asserted numerically from `boundingBox()` instead.
- **The existing Vitest suite is not reduced.** Nothing is deleted or ported. The unit tests keep
  covering pure functions and prop/callback contracts, which is where they are cheapest; Playwright
  covers journeys and everything jsdom cannot reach. Where a behaviour is worth having in both, it
  is in both — the mapping in **Architecture** says which, and why.

## Architecture

### Where the two suites sit in the feature loop

This is the convention the `CLAUDE.md` update in §9 has to write down, because it decides when an
agent reaches for which tool:

1. **Specify** the feature — `WORKFLOW.MD` step 1.
2. **Implement it under TDD** — failing Vitest test, minimum code, refactor, repeat, until every
   checklist box is ticked. Playwright is not involved and is not run. A behaviour that can be
   pinned down by a unit test is pinned down by a unit test; the acceptance layer is not an excuse
   to skip one.
3. **Then write or extend the acceptance specs** for the journeys the feature added, and run them
   against the finished implementation.
4. **Verify** — `WORKFLOW.MD` step 3: unit suite, build, lint, then the acceptance suite.

So the two suites answer different questions. Vitest answers *is this unit correct*, during
construction. Playwright answers *does the assembled app do what the specification promised the
user*, once it is built. When an acceptance spec fails, the fix normally starts with a new failing
unit test — the acceptance spec reports the symptom, the TDD loop deals with the cause.

### Files

```
timely-notes-ui/
├── playwright.config.ts          # projects, webServer, timezone, reporters
├── package.json                  # + @playwright/test, + test:e2e scripts
├── .gitignore                    # + test-results/, playwright-report/, blob-report/
└── e2e/
    ├── fixtures/
    │   ├── notes.ts              # wire-shaped fixtures, mirroring the Vitest ones
    │   ├── DayView.ts            # page object — locators by accessible role/name
    │   └── app.ts                # extended `test`: clock, API stubbing, DayView
    ├── day-view.spec.ts          # §3
    ├── selection.spec.ts         # §4
    ├── schedule.spec.ts          # §5
    ├── api-contract.spec.ts      # §5
    ├── note-dialog.spec.ts       # §6
    ├── layout.spec.ts            # §7
    └── backend.spec.ts           # §8, tagged @integrated
```

### The harness

`e2e/fixtures/app.ts` extends Playwright's `test` with three fixtures, so a spec body contains only
its behaviour:

- **`page`** (overridden) — installs the fixed clock *before* the first navigation, since `App`
  captures `new Date()` in a lazy `useState` initialiser on mount. A clock installed after `goto` is
  too late, and the spec silently becomes wall-clock-dependent.
- **`api`** — a small controller over `page.route('**/api/schedules/*/notes*')` that records every
  intercepted request (so specs can assert *what was asked for* and *how many times*) and lets a
  spec choose the reply: notes per short name, an HTTP status, or a delay. Registered before
  navigation; the default reply is the standard fixture set.
- **`dayView`** — the page object.

`e2e/fixtures/DayView.ts` exposes locators, not assertions: `rows`, `row('18:00 – 21:00')`,
`selectedRow`, `currentRow`, `noteButton`, `note('09:00 Morning block')`, `schedule('6h')`,
`dialog`, `editor`, `save`, `cancel`, `status`, `error`, `dayBoundary`. Every one resolves by ARIA
role and accessible name — the same handles `App.test.tsx` uses — so a change that breaks the
accessibility of a row breaks both suites, which is the point.

`e2e/fixtures/notes.ts` holds notes in **wire shape** (ISO strings with an offset, exactly as
`NoteResponse` serialises), because they are fed to `route.fulfill`, not to a component. They mirror
the Vitest fixtures deliberately: `occursAt` on 25/08/2026, `createdAt` on 28/08/2026, so the
"placed by `occursAt`, never `createdAt`" rule is asserted in the browser too.

### Config

Two Playwright projects over one `webServer`:

- `stubbed` — excludes anything tagged `@integrated`. `webServer` runs
  `npm run dev -- --port 5174 --strictPort` with `reuseExistingServer: !process.env.CI`. **Port 5174,
  not 5173**, so a run never collides with a dev server the developer already has open and never
  picks up whatever that server happens to be serving.
- `integrated` — `grep: /@integrated/`, and its `webServer` additionally starts the API. It has to
  use the default ports (5186 for the API, and a Vite server whose `/api` proxy points there),
  because `vite.config.ts` hardcodes the proxy target.

Reporter is `[['list']]` — never the HTML reporter as a default. `playwright show-report` starts a
web server and blocks the terminal, which strands an agent mid-task; `open: 'never'` is the
mitigation if the HTML reporter is ever added.

### Derived behaviour tests

The heart of the feature. Every existing frontend unit test was read and placed in one of three
buckets; the E2E column is what §3–§8 implement.

**Promoted — the behaviour is a user journey, and the browser proves more than jsdom did**

| Unit test (file → name) | Derived Playwright behaviour | What the browser adds |
| --- | --- | --- |
| `App` → fetches the default schedule on mount | Landing on `/` shows the day under `3h`, pressed | Real network stack, real request path |
| `App` → asks for a three-day window, half-open | The intercepted request carries `searchFrom` = 24/08 00:00+01:00 and `searchTo` = 27/08 00:00+01:00 | The URL the browser actually built, `+` percent-encoded on the wire |
| `App` → fetches once per schedule change | Switching `3h`→`6h` produces exactly two requests, in order | Real effect scheduling, no `act()` shimming |
| `App` → places notes by `occursAt` … another day | The 09:00 row holds "09:00 Morning block…" though it was written on 28/08 | Same assertion, end to end through parse → bucket → render |
| `App` → refetches with the new short name | `6h` re-chunks the day to 4 rows and asks for `s6` | — |
| `App` → shows an error instead of a blank page | A 500 shows the alert *and* the 8 empty rows stay | Real fetch rejection, not a resolved mock |
| `App` → selects the period holding the current time | On load, `18:00 – 21:00` is selected, is `aria-current="time"`, and holds Note | Clock frozen in the browser, not injected as a prop |
| `App` → moves selection and the Note button | Clicking `06:00 – 09:00` moves selection and the button; `aria-current` stays at 18:00 | Real click, real bubbling |
| `App` → does not open the editor when merely selected | Clicking a row leaves no dialog open | — |
| `App` → opens a blank dialog titled with the period | Note opens a modal headed `18:00 – 21:00` with an empty editor | Real `showModal()`, not the jsdom stub |
| `App` → lists fetched notes against their periods | Notes render in their rows, oldest-first | — |
| `App` → opens an existing note with its content | Clicking a note opens the dialog with its markdown **rendered** — `# Stand-up` as an `<h1>` | jsdom only ever compared flattened text |
| `App` → opens blank after closing an existing one | Open, Cancel, Note → empty editor | Exercises the real remount-by-`key` |
| `App` → logs the markdown and closes on save | Save closes the dialog and emits the markdown on the console | Console captured from a real page |
| `App` → keeps selection on the current period after switching | `1h` re-anchors selection to `20:00 – 21:00` | — |
| `ScheduleView` → heads the day with its date | `25/08/2026` heads the column | — |
| `ScheduleView` → one row per period | 24 / 8 / 4 rows at `1h` / `3h` / `6h` | Through a real schedule switch, not a prop |
| `ScheduleView` → exactly one row current | Exactly one `aria-current` row, named `18:00 – 21:00` | — |
| `ScheduleView` → one row selected, holding Note | Exactly one Note button on the page, inside the selected row | — |
| `ScheduleView` → grows as the container is scrolled | Scrolling to the bottom appends `26/08/2026`; scrolling to the top prepends `24/08/2026` | Real layout and a real IntersectionObserver |
| `PeriodRow` → start time in the gutter | The gutter reads `00:00` … `21:00` in order at `3h` | Real DOM order |
| `PeriodRow` → note labelled with time and excerpt | A note button reads `19:30 Stand-up`, excerpted from markdown | — |
| `PeriodRow` → opens a note without re-selecting | Clicking a note in an **unselected** row opens it titled with that row's range and leaves the selection where it was | `stopPropagation` against a real event path |
| `PeriodRow` → nothing note-shaped in an empty period | An empty row contains no buttons | — |
| `SchedulePicker` → presses only the selected schedule | After clicking `6h`, `6h` is pressed and `3h` is not | Round-trips through `App`, not a fixed prop |
| `NoteDialog` → titles with the period range | (folded into the `App` dialog journeys) | — |
| `NoteDialog` → Cancel closes without saving | Cancel closes and emits nothing on the console | Real dialog close event |
| `NoteDialog` → Save reports markdown then closes | Save emits the editor's markdown | Real `getMarkdown()` after real typing |
| `notesApi` → renders bounds with the UTC offset | The wire URL matches `…T00:00:00%2B01:00`, and again as `+12:00` under `Pacific/Auckland` | The browser's own timezone database |

**New — a gap the unit suite cannot reach, so there is no unit test to derive from**

| Behaviour | Why it has no unit test |
| --- | --- |
| Escape closes the dialog | `onCancel` needs a real `<dialog>`; jsdom stubs `showModal`, so the cancel event never fires |
| The dialog is modal — the day behind it is not clickable, focus is inside it | Same |
| Typing in the editor, then Save, emits what was typed | Requires real contenteditable and selection |
| The Bold toolbar button wraps the selection in `**` | Requires real selection and pointer events |
| The `# ` markdown shortcut makes a heading | Requires real key handling by the shortcut plugin |
| Enter and Space on a focused row select it; Space does not scroll the page | `PeriodRow`'s `onKeyDown` handler and its `preventDefault` are entirely untested today |
| A 6h row is six times the height of a 1h row | jsdom has no layout; every box is 0×0 |
| At `1h`, the selected row is scrolled into view on load | `scrollIntoView` is a no-op in jsdom |
| "Loading notes…" appears before the notes and then goes | The unit suite never asserts the loading state |

**Stays unit-only — promoting it would buy nothing**

- All of `domain/periods.test.ts`, `domain/schedules.test.ts` and `domain/notes.test.ts`. Pure
  functions with boundary cases (half-open ranges, DST-safe day building, the immutability of
  `assignNotes`). A browser adds nothing and each case would cost a page load.
- `notesApi`'s abort-signal forwarding and its non-2xx rejection: the unit test asserts the contract
  at the seam, which is where it lives.
- `PeriodRow`'s callback contracts (`onSelect` called with the period and `onTakeNote` not, and the
  converse). E2E can only see the *consequence*; the callback identity is a unit concern.
- `NoteDialog` → renders nothing when `period` is `null`, and `ScheduleView` → no Note button when
  nothing is selected: neither state is reachable from `App`.
- `ScheduleView` → no current row when `now` is on another day. Reachable with `page.clock`, but it
  is a `findCurrentPeriod` boundary case already covered twice over.

## Checklist

### 1. Tooling and configuration (prerequisite)

- [ ] Add `@playwright/test` as a dev dependency of `timely-notes-ui`.
- [ ] Install the Chromium browser (`npx playwright install chromium`) and record in the
      implementation notes that this is a one-off, out-of-tree download an agent needs before the
      first run — and what the failure looks like when it is missing.
- [ ] Add `playwright.config.ts`: `testDir: './e2e'`, Chromium only, `timezoneId: 'Europe/London'`,
      `locale: 'en-GB'`, `reporter: [['list']]`, `forbidOnly: !!process.env.CI`,
      `retries: process.env.CI ? 2 : 0`, and `trace`/`screenshot` on first retry only.
- [ ] `webServer` starts the Vite dev server on **5174** with `--strictPort`, with
      `reuseExistingServer: !process.env.CI`. Confirm a run passes while a developer's own 5173
      server is up, so the two never fight over a port.
- [ ] Two projects: `stubbed` (default, excludes `@integrated`) and `integrated`
      (`grep: /@integrated/`) — see §8 for the latter's server wiring.
- [ ] `package.json` scripts: `test:e2e` (stubbed only, headless), `test:e2e:ui` (`--ui`, for a
      human), `test:e2e:integrated`, `test:e2e:debug`.
- [ ] Add `test-results/`, `playwright-report/` and `blob-report/` to `timely-notes-ui/.gitignore`.
- [ ] Keep `tsc -b` and `npm run lint` clean over `e2e/` — extend the `tsconfig`/ESLint coverage to
      the folder rather than excluding it, so the specs are type-checked like the rest of the app.
- [ ] Sanity spec: load the app and assert the `Timely Notes` heading. Confirm `npm run test:e2e`
      goes green from a cold start and exits without leaving a server or a report listening.

### 2. Harness — fixtures, clock, network (prerequisite)

- [ ] `e2e/fixtures/notes.ts`: wire-shaped fixtures per short name, mirroring `App.test.tsx` —
      `occursAt` on 25/08/2026, `createdAt` on 28/08/2026, ISO strings with an offset. Include a
      note whose content is markdown (`# Stand-up\n\nBlocked.`) so the excerpt and the rendered
      heading can both be asserted, and two notes in one period so ordering can be.
- [ ] `e2e/fixtures/app.ts`: extend `test` with a `page` that fixes the clock at 20:20 on
      25/08/2026 **before** the first navigation.
  - Since `LiveClock.MD`, the app has no single mount-time `new Date()`: `useNow` ticks on the
    minute and resyncs on visibility and focus. The requirement is therefore that the clock is
    installed **before** `goto` and then **stays fixed** — `page.clock.install()` plus `pauseAt()`,
    or `setFixedTime`, which never advances. Record the choice and the reason in the implementation
    notes, and prove it with a spec that would fail on a wall-clock read. Under a paused clock the
    app never ticks, so the stubbed lane's behaviour table is otherwise unchanged.
- [ ] `api` fixture over `page.route('**/api/schedules/*/notes*')`: records intercepted requests,
      replies from the fixtures by short name, and can be told to reply with a given status or after
      a delay. Register the route before `goto`, so the mount-time fetch is caught.
- [ ] `e2e/fixtures/DayView.ts`: locators only, all by ARIA role and accessible name, matching the
      handles the Vitest suite uses.
- [ ] All three fixtures are exercised by at least one spec in §3 before this section is ticked.

### 3. Day view — `e2e/day-view.spec.ts`

- [ ] The day is headed `25/08/2026`, and it is the only day rendered until the view is scrolled.
- [ ] `3h` renders 8 rows, and the gutter reads `00:00` … `21:00` in order.
- [ ] Exactly one row carries `aria-current="time"`, and it is `18:00 – 21:00`.
- [ ] Seeded notes render in the row their `occursAt` falls in, though their `createdAt` is 28/08.
- [ ] Two notes in one period list oldest-first.
- [ ] A note button is labelled with its time and a one-line excerpt (`19:30 Stand-up`).
- [ ] A period with no notes contains no buttons.
- [ ] `Loading notes…` is shown while a delayed reply is in flight, and is gone once it lands.
- [ ] A 500 shows the error alert and still renders the 8 rows.

### 4. Selection and keyboard — `e2e/selection.spec.ts`

- [ ] On load, `18:00 – 21:00` is the selected row and holds the only `Note` button on the page.
- [ ] Clicking `06:00 – 09:00` moves both the selection and the button there, and opens no dialog.
- [ ] `aria-current="time"` stays on `18:00 – 21:00` after the selection moves.
- [ ] Clicking a note inside an **unselected** row opens that note without moving the selection.
- [ ] Pressing `Note` opens the dialog without changing which row is selected.
- [ ] Tabbing to a row and pressing `Enter` selects it. **New coverage** — `PeriodRow`'s key handler
      has no unit test.
- [ ] Pressing `Space` on a focused row selects it and does not scroll the page — assert
      `window.scrollY` is unchanged, which is what the handler's `preventDefault` is for.
- [ ] Pressing `Enter` while focus is on a button inside a row does not re-select it (the
      `event.target === event.currentTarget` guard).
- [ ] **Midnight rollover** (`page.clock.fastForward` past 00:00, stubbed lane only, so the fixture
      window can move with the view). An untouched view follows: the heading becomes 26/08/2026, the
      selection lands on `00:00 – 03:00` and one further request is made. A view with a note dialog
      open does not: the dialog stays open on its own period, the heading stays on 25/08/2026, no
      row carries `aria-current="time"`, and a `Go to today` notice appears which then moves it.
      This journey cannot be written before `LiveClock.MD` and is the clearest case for a browser
      lane — jsdom and fake timers can only approximate it.

### 5. Schedule switching and the API contract — `e2e/schedule.spec.ts`, `e2e/api-contract.spec.ts`

- [ ] Switching to `6h` leaves `6h` pressed, `3h` not, and 4 rows on screen; `1h` gives 24.
- [ ] Switching schedule issues exactly one further request, for the new short name — two requests
      in total after one switch, not one per render.
- [ ] After switching to `1h`, the selection re-anchors to `20:00 – 21:00`.
- [ ] Switching schedule while a dialog is open closes it.
- [ ] The mount request asks for `searchFrom=2026-08-24T00:00:00+01:00` and
      `searchTo=2026-08-27T00:00:00+01:00` — a three-day, half-open window around the frozen day.
- [ ] The raw query string carries the offset percent-encoded (`%2B01:00`), so the `+` cannot be
      read as a space.
- [ ] The same spec under a UTC+12 timezone override sends `+12:00` and that zone's *local*
      midnights — the browser-level stand-in for the structural assertions the unit tests make.
- [ ] The path is `/api/schedules/{shortName}/notes`, same-origin.

### 6. The note dialog and the editor — `e2e/note-dialog.spec.ts`

- [ ] `Note` opens a modal headed with the selected period's range, with an empty editor.
- [ ] Clicking an existing note opens the dialog headed with **that** period's range, with the
      note's markdown **rendered** — `# Stand-up` present as a heading element, not just as text.
- [ ] The dialog is genuinely modal: focus is inside it, and a row behind it cannot be clicked.
      **New coverage** — jsdom stubs `showModal`, so modality has never been executed.
- [ ] `Escape` closes the dialog. **New coverage** — `NoteDialog`'s `onCancel` path is dead code as
      far as the current suite knows.
- [ ] `Cancel` closes the dialog and emits nothing on the console.
- [ ] `Save` closes the dialog and emits the editor's markdown on the console.
- [ ] Typing into a blank editor and pressing `Save` emits what was typed. **New coverage.**
- [ ] Selecting text and pressing the `Bold` toolbar button emits `**…**`. **New coverage.**
- [ ] Typing `# ` at the start of a line makes a heading, and `Save` emits `# …`
      (`markdownShortcutPlugin`). **New coverage.**
- [ ] Opening an existing note, cancelling, then pressing `Note` gives an empty editor — the
      remount-per-note `key`, proven against a real editor instance.

### 7. Layout — `e2e/layout.spec.ts`

Everything here is unreachable in jsdom; none of it is derived from a unit test.

- [ ] At `1h`, all 24 rows fit inside the period list — none overflows past the day boundary.
- [ ] A `6h` row's height is six times a `1h` row's, within a pixel of tolerance, and the period
      list's total height is the same under both — the proportionality `App.css` is built around.
- [ ] At `1h`, the selected row is inside the viewport after load, from a viewport short enough that
      it would otherwise be below the fold. This is the only test `ScheduleView`'s mount-time
      `scrollIntoView` will ever have.
- [ ] The selected row is distinguishable by more than colour — assert the accessible marker
      (`aria-selected`) and read the computed border to confirm the non-colour cue is present.

### 8. The integrated lane — `e2e/backend.spec.ts` (`@integrated`)

Small on purpose. These specs use the **real** seeded data, which is anchored to the API process's
`DateTime.Today`, so they must not freeze the clock on 25/08/2026 — they freeze it at a fixed
*time of day* on *today's* date, which keeps period assertions deterministic while staying in step
with the seed.

`LiveClock.MD` deliberately left that seed frozen, so the coupling **stands**. This lane must also
never fast-forward across midnight: the UI would roll to a day whose seeded notes exist only because
the seed happens to span ± 3 days, making the assertion accidental. The rollover journey belongs to
the stubbed lane (§4).

- [ ] Confirm a readiness URL for the API's `webServer` (`/swagger/index.html` under the `http`
      launch profile) and record what was used. The notes route needs query parameters, so it is not
      usable as a health check; if nothing suitable answers a bare GET, say so in the notes.
- [ ] `webServer` for this project starts `dotnet run --project TimelyNotes.API --launch-profile http`
      from `TimelyNotes.Backend/` alongside Vite on its default port, mirroring `run-dev.ps1`, with
      `reuseExistingServer` so a developer's running stack is used instead of a second one.
- [ ] The app loads against the real API with no console errors and no error alert — the proxy, the
      query string and the response shape all agree.
- [ ] The request the UI sends is answered `200`, not `400` by `GetNotesByScheduleValidator` — the
      one assertion that catches the two projects disagreeing about the window format.
- [ ] Today's seeded `s3` notes appear in their periods; switching to `s1` and `s6` shows theirs.
      Assert on note **content**, never on ids: the seed mints a fresh `Guid` per process.
- [ ] Opening a seeded note shows its content in the editor.
- [ ] Record in the notes how long this lane takes to start, so its cost against the stubbed lane is
      on the record.

### 9. Making the suite usable by an agent

- [ ] `npm run test:e2e` is headless, needs no .NET SDK, and prints a plain list an agent can read.
- [ ] No command on the default path opens a browser window or leaves a server listening.
- [ ] A failure names the spec, the failing assertion and the file/line — check by breaking one
      assertion deliberately and reading the output as an agent would.
- [ ] Update the **Frontend** section of `CLAUDE.md`: the `e2e/` layout, the two lanes and when to
      use each, the frozen clock and pinned timezone, the fixture/page-object conventions, and the
      one-off browser install.
- [ ] State the ordering rule in `CLAUDE.md` beside the existing TDD paragraph, in the words of
      **Where the two suites sit in the feature loop** above: TDD the feature with Vitest first —
      failing unit test, code, refactor — and only once it is implemented, add or extend the
      Playwright spec covering the journey. Playwright is not a substitute for a unit test and is
      not run during the TDD loop; a failing acceptance spec is normally fixed by starting a new
      unit test, not by patching until the browser goes green.
- [ ] Update the **Current state** section of `CLAUDE.md` once the suite is green.

## Verify

- [ ] `npm test` — the existing 86 Vitest tests still pass, unchanged.
- [ ] `npm run build` and `npm run lint` are clean, with `e2e/` included in both.
- [ ] `npm run test:e2e` passes from a cold start with no backend running, and again with a
      developer's own dev server already up on 5173.
- [ ] Spot-check that the suite can actually fail: break one assertion and one line of app code,
      confirm the relevant specs go red, then restore. Ordinary hygiene for acceptance tests written
      against working code — a suite that has only ever been green proves nothing yet.
- [ ] With the stack up (`./run-dev.ps1`), `npm run test:e2e:integrated` passes.
- [ ] `npm run test:e2e:ui` opens the Playwright UI for a human, and is never on the default path.
- [ ] Record the final counts and the wall-clock time of each lane in the implementation notes.

## Deferred

- **Firefox and WebKit.** Chromium only until there is something browser-specific to test.
- **Visual regression snapshots**, and dark-mode screenshots. Revisit when the styling settles.
- **Accessibility auditing** (`@axe-core/playwright`). The nested-buttons-inside-an-`option`
  compromise recorded in `FrontendSkeleton.MD` deserves a real audit, but that is a finding to act
  on, not a test to add here.
- **CI.** The repo has no CI config; the config is written so it will not need rewriting when one
  arrives (`forbidOnly`, `retries` and `reuseExistingServer` already key off `process.env.CI`).
- **Specs for behaviour that does not exist yet** — creating or updating a note, day navigation,
  auth. `Save` still only reaches the console, and §6 asserts exactly that; it becomes a persistence
  assertion when the create endpoint lands.
- **A backend test-data seam** (a reset endpoint, or a fixed-seed switch). The integrated lane works
  around the live seed by asserting on content rather than ids; if that lane grows, it will need one.
- **Component-level Playwright testing** (`@playwright/experimental-ct-react`). Vitest already owns
  that layer, and there is no reason to run two component runners.

## Implementation notes

_Left empty at specification time — the implementing agent fills this in._
