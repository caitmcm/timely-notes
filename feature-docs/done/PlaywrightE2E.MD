# Playwright end-to-end testing

## Goal

Give `timely-notes-ui` a browser-driven **acceptance** test layer so an agent can prove a finished
UI feature actually works — not merely that its components call the right callbacks — and can do so
unattended, from a single command, without a human watching a browser.

This layer sits after implementation, not inside it. TDD stays the implementation loop and Vitest
stays its tool; Playwright is what confirms the assembled app does what the specification promised
once the loop is done.

Today the frontend has 221 Vitest tests running in jsdom. They are good tests, and they stay. But
jsdom is a simulation, and three things the app genuinely depends on are simulated away:

- **The native `<dialog>`.** `src/test/setup.ts` stubs `showModal`/`close` because jsdom has
  neither. So `NoteDialog`'s modality, its focus behaviour and its `onCancel` (Escape) path have
  never been executed — the Escape-to-close wiring is untested code.
- **Layout.** `App.css` makes the day column a fixed-height flex stack so that a 6h row is exactly
  six times a 1h row, `DaySection` scrolls the selected row into view on mount, and the three-day
  column is scrolled end to end beneath a navigation toolbar that stays put. jsdom has no layout
  engine: every box is 0×0 and `scrollIntoView` is a no-op. All of it is asserted only by eye.
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
    │   ├── ScheduleView.ts       # page object — locators by accessible role/name, scoped per day
    │   └── app.ts                # extended `test`: clock, API stubbing, ScheduleView
    ├── day-view.spec.ts          # §3
    ├── selection.spec.ts         # §4
    ├── schedule.spec.ts          # §5
    ├── api-contract.spec.ts      # §5
    ├── calendar.spec.ts          # §5b
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
- **`api`** — a small controller over **two** routes, not one, that records every intercepted
  request (so specs can assert *what was asked for* and *how many times*) and lets a spec choose the
  reply: notes or day counts per short name, an HTTP status, or a delay. Registered before
  navigation; the default reply is the standard fixture set.
  - `**/api/schedules/*/notes*` — the list route.
  - `**/api/schedules/*/note-days*` — the counts route. **A separate pattern is required**:
    `notes*` does not match `note-days`, so a single route leaves the calendar's requests
    unintercepted, escaping to a backend the stubbed lane does not run.
- **`scheduleView`** — the page object.

`e2e/fixtures/ScheduleView.ts` exposes locators, not assertions. Since `CalendarNavigation.MD`
**three days render at once**, so every per-day handle is reached through a day scope and a
page-wide `rows` would match 24 / 12 / 72 rows rather than 24 / 8 / 4:

- **Per day** — `day('25/08/2026')` returns the `DaySection` scope, and from it `rows`,
  `row('18:00 – 21:00')`, `selectedRow`, `currentRow`, `noteButton`,
  `note('09:00 Morning block')`, `status`.
- **Page-wide** — `days` (the day headings in order), `schedule('6h')`, `calendarButton`,
  `goToTodayButton`, `rolloverNotice`, `dialog`, `editor`, `save`, `cancel`, `error`, `scroller`,
  and the calendar's own `month`, `previousMonth`, `nextMonth`, `gridDay(17)`.

Every one resolves by ARIA role and accessible name — the same handles `App.test.tsx` uses — so a
change that breaks the accessibility of a row breaks both suites, which is the point. The one
exception is the scroll container, which has no role and is reached by its `data-testid`.

**Row counts in §3–§7 are per day, not per page.** "8 rows at `3h`" means eight inside
`day('25/08/2026')`. An unscoped count is a bug in the spec, not a change in the app.

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
| `App` → refetches with the new short name | `6h` re-chunks each day to 4 rows and asks for `s6` | — |
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
| `ScheduleView` → heads the day with its date | `24/08/2026`, `25/08/2026` and `26/08/2026` head their sections, in order | — |
| `ScheduleView` → one row per period | 24 / 8 / 4 rows **per day** at `1h` / `3h` / `6h` | Through a real schedule switch, not a prop |
| `ScheduleView` → exactly one row current | Exactly one `aria-current` row, named `18:00 – 21:00` | — |
| `ScheduleView` → one row selected, holding Note | Exactly one Note button on the page, inside the selected row | — |
| `ScheduleView` → three days, bounded | `24/08/2026`, `25/08/2026` and `26/08/2026` render; scrolling to either end adds no day and issues no request | Real layout: the container's height never changes mid-scroll |
| `App` → the calendar navigates | The `Calendar` button opens the month grid, a month back and a seeded day picked re-points the view at that day and its neighbours | Real `<dialog>` modality, and one window per jump |
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

> **Amended after `CalendarNavigation.MD` shipped.** This specification was written against a
> single-day view with an unbounded scroll. The app now renders **three days at once** under a fixed
> navigation toolbar, and has a second read route. What changed here, so a reader who knew the old
> version can spot it: every row count is **per day** and every row locator is scoped through
> `day(heading)`; the page object is `ScheduleView.ts`, not `DayView.ts`; the `api` fixture needs a
> **second** route for `note-days`; the clock must be `install()` + `pauseAt()` rather than
> `setFixedTime`, because §4 fast-forwards; `Go to today` is always in the toolbar, so §4 and §5b
> assert on the *notice* appearing, never the button; §5b is new; and the mount scroll belongs to
> `DaySection`, not `ScheduleView`. Nothing about the two lanes, the harness shape or the ordering
> rule changed.

### 1. Tooling and configuration (prerequisite)

- [x] Add `@playwright/test` as a dev dependency of `timely-notes-ui`.
- [x] Install the Chromium browser (`npx playwright install chromium`) and record in the
      implementation notes that this is a one-off, out-of-tree download an agent needs before the
      first run — and what the failure looks like when it is missing.
- [x] Add `playwright.config.ts`: `testDir: './e2e'`, Chromium only, `timezoneId: 'Europe/London'`,
      `locale: 'en-GB'`, `reporter: [['list']]`, `forbidOnly: !!process.env.CI`,
      `retries: process.env.CI ? 2 : 0`, and `trace`/`screenshot` on first retry only.
- [x] `webServer` starts the Vite dev server on **5174** with `--strictPort`, with
      `reuseExistingServer: !process.env.CI`. Confirm a run passes while a developer's own 5173
      server is up, so the two never fight over a port. *(Serves a **build** on
      `127.0.0.1:5174` rather than the dev server, and the address is the literal IPv4 loopback —
      both changes are load-bearing; see the notes. Confirmed green with a developer's 5173 server
      running.)*
- [x] Two projects: `stubbed` (default, excludes `@integrated`) and `integrated`
      (`grep: /@integrated/`) — see §8 for the latter's server wiring.
- [x] `package.json` scripts: `test:e2e` (stubbed only, headless), `test:e2e:ui` (`--ui`, for a
      human), `test:e2e:integrated`, `test:e2e:debug`.
- [x] Add `test-results/`, `playwright-report/` and `blob-report/` to `timely-notes-ui/.gitignore`.
- [x] Keep `tsc -b` and `npm run lint` clean over `e2e/` — extend the `tsconfig`/ESLint coverage to
      the folder rather than excluding it, so the specs are type-checked like the rest of the app.
- [x] Sanity spec: load the app and assert the `Timely Notes` heading. Confirm `npm run test:e2e`
      goes green from a cold start and exits without leaving a server or a report listening.

### 2. Harness — fixtures, clock, network (prerequisite)

- [x] `e2e/fixtures/notes.ts`: wire-shaped fixtures per short name, mirroring `App.test.tsx` —
      `occursAt` on 25/08/2026, `createdAt` on 28/08/2026, ISO strings with an offset. Include a
      note whose content is markdown (`# Stand-up\n\nBlocked.`) so the excerpt and the rendered
      heading can both be asserted, and two notes in one period so ordering can be.
- [x] `e2e/fixtures/app.ts`: extend `test` with a `page` that fixes the clock at 20:20 on
      25/08/2026 **before** the first navigation.
  - Since `LiveClock.MD`, the app has no single mount-time `new Date()`: `useNow` ticks on the
    minute and resyncs on visibility and focus. The requirement is therefore that the clock is
    installed **before** `goto` and then **stays fixed**. Use `page.clock.install()` plus
    `pauseAt()` — **not** `setFixedTime`: §4's rollover journey calls `clock.fastForward`, which
    needs an installed clock, so the choice is already forced. Prove the freeze with a spec that
    would fail on a wall-clock read. Under a paused clock the app never ticks, so the stubbed lane's
    behaviour table is otherwise unchanged.
- [x] `api` fixture over **both** `page.route('**/api/schedules/*/notes*')` and
      `page.route('**/api/schedules/*/note-days*')`: records intercepted requests, replies from the
      fixtures by short name, and can be told to reply with a given status or after a delay.
      Register both routes before `goto`, so the mount-time fetch is caught. The second pattern is
      not optional — `notes*` does not match `note-days`, and §5b cannot assert on counts without
      it.
- [x] Day-count fixtures in `{ day, count }` wire shape (`day` an offset-carrying instant at local
      midnight, as `NoteDayResponse` serialises), covering the August 2026 grid: a marked day, a day
      with two notes, and an unmarked day, so §5b can assert markers and their absence.
- [x] `e2e/fixtures/ScheduleView.ts`: locators only, all by ARIA role and accessible name (bar the
      scroll container's `data-testid`), matching the handles the Vitest suite uses, and scoped per
      day via `day(heading)` as **The harness** describes.
- [x] All three fixtures are exercised by at least one spec in §3 before this section is ticked.

### 3. Day view — `e2e/day-view.spec.ts`

Every row assertion here is scoped to `day('25/08/2026')` unless it says otherwise.

- [x] Three days render — `24/08/2026`, `25/08/2026` and `26/08/2026`, in that order — with the
      focus day in view.
- [x] `3h` renders 8 rows **in each day**, and the focus day's gutter reads `00:00` … `21:00` in
      order. (24 rows on the page; assert per day, not per page.)
- [x] Exactly one row **on the page** carries `aria-current="time"`, it is `18:00 – 21:00`, and it
      is inside `25/08/2026` — the neighbouring days hold no current row.
- [x] Seeded notes render in the row their `occursAt` falls in, though their `createdAt` is 28/08.
- [x] A note whose `occursAt` is on 26/08 renders in *that* day's section, not the focus day's —
      the three-day equivalent of the unit suite's "day it occurs on, not the day in view".
- [x] Two notes in one period list oldest-first.
- [x] A note button is labelled with its time and a one-line excerpt (`19:30 Stand-up`).
- [x] A period with no notes contains no buttons.
- [x] `Loading notes…` is shown while a delayed reply is in flight, and is gone once it lands. It
      appears in **each** of the three day sections, since one request covers them all.
- [x] A 500 shows the error alert and still renders the 8 rows per day.

### 4. Selection and keyboard — `e2e/selection.spec.ts`

Rows exist on all three days, so every click here names the day as well as the range —
`day('25/08/2026').row('06:00 – 09:00')`. An unscoped `getByRole('option', { name })` is ambiguous
and will fail with a strict-mode violation.

- [x] On load, `18:00 – 21:00` on 25/08 is the selected row and holds the only `Note` button on the
      page — the neighbouring days hold none.
- [x] Clicking `06:00 – 09:00` on 25/08 moves both the selection and the button there, and opens no
      dialog.
- [x] `aria-current="time"` stays on `18:00 – 21:00` after the selection moves.
- [x] Clicking a row on **26/08** moves the selection onto that day, and 25/08 then holds no
      selected row — the selection is page-wide, not per day.
- [x] Clicking a note inside an **unselected** row opens that note without moving the selection.
- [x] Pressing `Note` opens the dialog without changing which row is selected.
- [x] Tabbing to a row and pressing `Enter` selects it. **New coverage** — `PeriodRow`'s key handler
      has no unit test.
- [x] Pressing `Space` on a focused row selects it and does not scroll the page — assert
      `window.scrollY` is unchanged, which is what the handler's `preventDefault` is for.
- [x] Pressing `Enter` while focus is on a button inside a row does not re-select it (the
      `event.target === event.currentTarget` guard).
- [x] **Midnight rollover** (`page.clock.fastForward` past 00:00, stubbed lane only, so the fixture
      window can move with the view). An untouched view follows: the three days become
      `25`–`27/08/2026`, the selection lands on `00:00 – 03:00` on 26/08, and **one** further
      request is made — for the single new day `[27/08, 28/08)`, since the other two are cached. A
      view the user has committed to does not move: the days stay `24`–`26/08/2026`, the selection
      stays where it was put, and the `role="status"` notice appears reading `It is now
      26/08/2026.` — the `Go to today` button is in the toolbar throughout and does not appear or
      disappear; pressing it moves the view. A note dialog open across the rollover stays open on
      its own period. Note that the current-period marker does **not** vanish: 26/08 is one of the
      three days on show, so `aria-current="time"` moves on to it while the selection stays behind.
      This journey cannot be written before `LiveClock.MD` and is the clearest case for a browser
      lane — jsdom and fake timers can only approximate it.

### 5. Schedule switching and the API contract — `e2e/schedule.spec.ts`, `e2e/api-contract.spec.ts`

- [x] Switching to `6h` leaves `6h` pressed, `3h` not, and 4 rows **per day**; `1h` gives 24 per day
      (12 and 72 on the page).
- [x] Switching schedule issues exactly one further request, for the new short name — two requests
      in total after one switch, not one per render.
- [x] After switching to `1h`, the selection re-anchors to `20:00 – 21:00`.
- [x] Switching schedule while a dialog is open closes it. *(Unreachable from a browser: the modal
      `<dialog>` swallows the click at the picker. Asserted as that modality instead — see the notes.)*
- [x] The mount request asks for `searchFrom=2026-08-24T00:00:00+01:00` and
      `searchTo=2026-08-27T00:00:00+01:00` — a three-day, half-open window around the frozen day.
- [x] The raw query string carries the offset percent-encoded (`%2B01:00`), so the `+` cannot be
      read as a space.
- [x] The same spec under a UTC+12 timezone override sends `+12:00` and that zone's *local*
      midnights — the browser-level stand-in for the structural assertions the unit tests make.
- [x] The path is `/api/schedules/{shortName}/notes`, same-origin.

### 5b. Calendar navigation — `e2e/calendar.spec.ts`

Replaces the scroll-growth journey `ScrollingSchedule.MD` asked for: the view is bounded now, and
the calendar is how the user goes anywhere else (`CalendarNavigation.MD`).

- [x] The navigation toolbar — `Calendar` then `Go to today` — is above the scroll container and
      outside it, and both buttons stay visible while the days are scrolled end to end.
- [x] Scrolling the container to either end adds no fourth day and issues no request; the
      container's `scrollHeight` is unchanged after the scroll.
- [x] `Calendar` opens a modal month grid headed `August 2026`, and it is genuinely modal.
- [x] The grid is Monday-first whole weeks, the days outside August are dimmed but still enabled,
      and 25/08 carries `aria-current="date"`.
- [x] The grid asks `/api/schedules/s3/note-days` exactly once, for the whole grid, and not at all
      before it is opened.
- [x] Seeded days carry a marker; days with no notes do not.
- [x] `Previous month` shows `July 2026` and issues exactly one further count request; going back
      to August issues none.
- [x] Picking a seeded day closes the calendar, renders that day and its two neighbours with their
      notes, selects that day's **first** period, and issues exactly **one** notes request, with
      nothing asked for in between. Choose a target far enough from 25/08 that the window shares no
      day with the one already cached, so the request really is the whole three days — the cache
      legitimately trims a window that overlaps what it holds, which would make a "three days
      exactly" assertion wrong rather than the app.
- [x] The jump raises the `It is now 25/08/2026.` notice; pressing `Go to today` in the toolbar
      returns to the current three days and the notice goes. The button itself is present
      throughout — assert the *notice* appearing, never the button.
- [x] Picking the current day from the grid is `Go to today`: the view returns to the current three
      days and the selection lands on the current period, not on `00:00`.
- [x] `Escape` closes the calendar and leaves the view where it was.

### 6. The note dialog and the editor — `e2e/note-dialog.spec.ts`

- [x] `Note` opens a modal headed with the selected period's range, with an empty editor.
- [x] Clicking an existing note opens the dialog headed with **that** period's range, with the
      note's markdown **rendered** — `# Stand-up` present as a heading element, not just as text.
- [x] The dialog is genuinely modal: focus is inside it, and a row behind it cannot be clicked.
      **New coverage** — jsdom stubs `showModal`, so modality has never been executed.
- [x] `Escape` closes the dialog. **New coverage** — `NoteDialog`'s `onCancel` path is dead code as
      far as the current suite knows.
- [x] `Cancel` closes the dialog and emits nothing on the console.
- [x] `Save` closes the dialog and emits the editor's markdown on the console.
- [x] Typing into a blank editor and pressing `Save` emits what was typed. **New coverage.**
- [x] Selecting text and pressing the `Bold` toolbar button emits `**…**`. **New coverage.**
- [x] Typing `# ` at the start of a line makes a heading, and `Save` emits `# …`
      (`markdownShortcutPlugin`). **New coverage.**
- [x] Opening an existing note, cancelling, then pressing `Note` gives an empty editor — the
      remount-per-note `key`, proven against a real editor instance.

### 7. Layout — `e2e/layout.spec.ts`

Everything here is unreachable in jsdom; none of it is derived from a unit test.

- [x] At `1h`, all 24 rows of a day fit inside that day's period list — none overflows past the day
      boundary. Measure one day section, not the scroll container, which holds three.
- [x] A `6h` row's height is six times a `1h` row's, within a pixel of tolerance, and the period
      list's total height is the same under both — the proportionality `App.css` is built around.
      `--day-height` is per day, so this holds for each of the three.
- [x] At `1h`, the selected row is inside the viewport after load, from a viewport short enough that
      it would otherwise be below the fold. This is the only test `DaySection`'s mount-time
      `scrollIntoView` will ever have — the mount scroll belongs to `DaySection` and the selected
      row; `ScheduleView`'s own effect fires only when the **focus day changes**, and is covered by
      §5b's calendar jump.
- [x] The navigation toolbar does not move when the days are scrolled — its `boundingBox()` is
      unchanged before and after, which is what putting it outside the scroll container buys.
- [x] The selected row is distinguishable by more than colour — assert the accessible marker
      (`aria-selected`) and read the computed border to confirm the non-colour cue is present.
      *(The border is **not** a non-colour cue: `.period-row` reserves the same 3px left border on
      every row and only recolours it. The `Note` button is the cue that survives, and is what the
      spec asserts — see the notes.)*

### 8. The integrated lane — `e2e/backend.spec.ts` (`@integrated`)

Small on purpose. These specs use the **real** seeded data, which is anchored to the API process's
`DateTime.Today`, so they must not freeze the clock on 25/08/2026 — they freeze it at a fixed
*time of day* on *today's* date, which keeps period assertions deterministic while staying in step
with the seed.

`LiveClock.MD` deliberately left that seed frozen, so the coupling **stands**. This lane must also
never fast-forward across midnight: the UI would roll to a day whose seeded notes exist only because
the seed happens to span ± 3 days, making the assertion accidental. The rollover journey belongs to
the stubbed lane (§4).

- [x] Confirm a readiness URL for the API's `webServer` (`/swagger/index.html` under the `http`
      launch profile) and record what was used. The notes route needs query parameters, so it is not
      usable as a health check; if nothing suitable answers a bare GET, say so in the notes.
- [x] `webServer` for this project starts `dotnet run --project TimelyNotes.API --launch-profile http`
      from `TimelyNotes.Backend/` alongside Vite on its default port, mirroring `run-dev.ps1`, with
      `reuseExistingServer` so a developer's running stack is used instead of a second one.
- [x] The app loads against the real API with no console errors and no error alert — the proxy, the
      query string and the response shape all agree.
- [x] The request the UI sends is answered `200`, not `400` by `GetNotesByScheduleValidator` — the
      one assertion that catches the two projects disagreeing about the window format.
- [x] Today's seeded `s3` notes appear in their periods; switching to `s1` and `s6` shows theirs.
      Assert on note **content**, never on ids: the seed mints a fresh `Guid` per process.
- [x] Opening a seeded note shows its content in the editor.
- [x] Opening the calendar marks the seeded days: the real `note-days` route answers `200`, and the
      grid carries markers on today and its neighbours (the seed spans today ± 3). Assert that
      *some* marked day exists and that today is one, never an exact set — the seed is anchored to
      the API process's `DateTime.Today` and the month grid's edges move with the calendar. This is
      the only integrated assertion covering the counts route, and it exists because the offset
      grouping is exactly the kind of thing the two projects can silently disagree about.
- [x] Record in the notes how long this lane takes to start, so its cost against the stubbed lane is
      on the record.

### 9. Making the suite usable by an agent

- [x] `npm run test:e2e` is headless, needs no .NET SDK, and prints a plain list an agent can read.
- [x] No command on the default path opens a browser window or leaves a server listening.
- [x] A failure names the spec, the failing assertion and the file/line — check by breaking one
      assertion deliberately and reading the output as an agent would.
- [x] Update the **Frontend** section of `CLAUDE.md`: the `e2e/` layout, the two lanes and when to
      use each, the frozen clock and pinned timezone, the fixture/page-object conventions, and the
      one-off browser install.
- [x] State the ordering rule in `CLAUDE.md` beside the existing TDD paragraph, in the words of
      **Where the two suites sit in the feature loop** above: TDD the feature with Vitest first —
      failing unit test, code, refactor — and only once it is implemented, add or extend the
      Playwright spec covering the journey. Playwright is not a substitute for a unit test and is
      not run during the TDD loop; a failing acceptance spec is normally fixed by starting a new
      unit test, not by patching until the browser goes green.
- [x] Update the **Current state** section of `CLAUDE.md` once the suite is green.

## Verify

- [x] `npm test` — the existing 221 Vitest tests still pass, unchanged.
- [x] `npm run build` and `npm run lint` are clean, with `e2e/` included in both.
- [x] `npm run test:e2e` passes from a cold start with no backend running, and again with a
      developer's own dev server already up on 5173.
- [x] Spot-check that the suite can actually fail: break one assertion and one line of app code,
      confirm the relevant specs go red, then restore. Ordinary hygiene for acceptance tests written
      against working code — a suite that has only ever been green proves nothing yet.
- [x] With the stack up (`./run-dev.ps1`), `npm run test:e2e:integrated` passes.
- [x] `npm run test:e2e:ui` opens the Playwright UI for a human, and is never on the default path.
      *(Confirmed by hand: `--ui` opens a window and blocks the terminal, so it is the one check an
      agent must not run itself. Nothing in the default path reaches it.)*
- [x] Record the final counts and the wall-clock time of each lane in the implementation notes.

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

### Counts and timings

| Lane | Specs | Wall clock |
| --- | --- | --- |
| Vitest (`npm test`) | 221 in 17 files | ~7.5s |
| Playwright `stubbed` (`npm run test:e2e`) | 59 in 7 files | ~17s, of which ~6s is the build |
| Playwright `integrated` (`npm run test:e2e:integrated`) | 4 in 1 file | ~14s cold (Playwright starts both servers), ~3s against a stack already up |

`npm run build` is ~1s and `npm run lint` under 5s. The whole verification pass is well under a
minute, which is the point: an agent can afford to run it.

### The one-off browser download

`npx playwright install chromium` (~140 MB, into `%LOCALAPPDATA%\ms-playwright`) is needed once per
machine, out of tree, and is **not** done by `npm install`. Without it every spec fails at launch
with `Error: browserType.launch: Executable doesn't exist at …\ms-playwright\chromium_headless_shell-…`,
and the message names the command to run — so the failure is self-explaining, which is why nothing
was added to paper over it.

### Deviations from the specification

- **The stubbed lane serves a build, not the dev server.** §1 asked for `npm run dev -- --port 5174`.
  It runs `npm run build && npm run preview -- --host 127.0.0.1 --port 5174 --strictPort` instead:
  every test gets a fresh browser context with an empty cache, and re-transforming MDXEditor's module
  graph per test made a cold load take about twenty seconds. Nothing in this lane needs the dev proxy
  — every `/api` request is intercepted — so the build costs one ~6s compile per run and saves far
  more. The integrated lane still uses the dev server, because it needs the proxy.
- **`127.0.0.1`, not `localhost`.** Vite binds to `localhost`, which resolves to `::1` on this
  machine; Chromium's IPv4 attempt then stalled the navigation rather than failing fast, and
  `page.goto` timed out at 30s under any parallelism. Binding and addressing the literal IPv4 loopback
  removed it entirely. Worth remembering: the dev server on 5173 listens on `[::1]` only.
- **`workers` is pinned to 2.** The default (one per two cores — ten here) starved the preview server:
  2m20s and mass `goto` timeouts. Two workers finish the same 59 specs in ~9s, and *faster* than one.
  This is the kind of thing a stubbed lane hides until the suite is large enough to notice.
- **The clock is installed ten minutes behind the frozen instant**, not one second. The original
  one-second lead meant any page load slower than a second made `clock.pauseAt` throw
  `Cannot fast-forward to the past` — which is what 19 of the first 23 specs were failing on. The
  clock runs at wall speed only between `install()` and the `pauseAt()` that follows `goto`, so the
  lead is margin for the load, never a wait.
- **Vitest's `include` is now scoped to `src/`.** It was collecting `e2e/**` and failing seven files
  with `Playwright Test did not expect test() to be called here` — `npm test` reported
  `7 failed | 17 passed` while still saying `221 passed`, which is exactly the kind of green-looking
  red an agent skims past.
- **`react-hooks/rules-of-hooks` is off for `e2e/`.** A Playwright fixture's `use(value)` handoff is
  not React's `use`, but the rule matches on the name alone and raised six errors.
- **§5's "switching schedule while a dialog is open closes it" is unreachable from a browser.** The
  modal `<dialog>` intercepts the click before it reaches the picker — Playwright reports
  `<dialog open class="note-dialog"> intercepts pointer events` and never lands it.
  `handleScheduleChange`'s `closeDialog()` is a defensive branch only a unit test can drive, so the
  spec asserts the modality that makes it unreachable instead.
- **§7's "distinguishable by more than colour" could not be asserted from the border.** `.period-row`
  gives *every* row the same `3px solid transparent` left border and `.period-row--selected` only
  recolours it; the background change is colour too. The cue that survives a monochrome screen is the
  `Note` button appearing in the selected row, and that is what the spec asserts alongside
  `aria-selected`. **This is a real finding for the deferred `@axe-core` audit**, not a test problem:
  a user who cannot distinguish the accent from the surface has only the button to go on.

### Things worth knowing before extending the suite

- **A 6h row is six times a 1h row only for rows that carry a top border.** `.period-row:first-child`
  drops its, so comparing the *first* row of each schedule is out by 5px. `layout.spec.ts` measures
  `nth(1)`.
- **`DaySection`'s mount-time `scrollIntoView` can only be observed at `3h`.** Day sections are keyed
  by `dayStart`, so a schedule change does not remount them, and the app always loads at the default
  schedule — there is no way to reach a first paint at `1h`. §7's scroll-into-view spec therefore
  runs at `3h` on a 520px-tall viewport, where the selected `18:00 – 21:00` row still sits over a
  thousand pixels down the column. The mechanism under test is identical.
- **Count requests through `notesWindows`/`noteDayWindows`, never `requests.length`.** `StrictMode`
  runs every effect twice, so the same window legitimately arrives twice; what the specs assert is
  that no render and no clock tick asks for a *new* one.
- **Modality is assertable directly.** `expect(locator.click({ timeout })).rejects.toThrow(/intercepts
  pointer events/)` is a stronger statement than a forced click, and `dialog.matches(':modal')` is the
  browser's own answer. Both are used.
- **The integrated lane must not be given a fixed date.** `integratedTest` asks the *browser* (whose
  timezone is the pinned one, unlike Node's) for today, freezes at 14:20 on it, and asserts on note
  **content** rather than ids — the seed mints a fresh `Guid` per process and is anchored to the API
  process's `DateTime.Today`.
- **`/swagger/index.html` is the API's readiness URL**, and the only one usable: the notes routes need
  query parameters, so a bare GET on them is a `400`. It is served only under `ASPNETCORE_ENVIRONMENT=Development`,
  which the `http` launch profile sets.

### Proving the suite can fail

Two deliberate breakages, both reverted:

- Changing one assertion (`18:00 – 21:00` → `19:00 – 21:00`) produced output naming the spec, the
  matcher, expected vs received, and the file and line — readable by an agent without a report server.
- Changing `NEIGHBOUR_DAYS` from 1 to 2 in `App.tsx` — a plausible regression, not a syntax error —
  turned **14 specs red across five files**: the day headings, the request windows, the per-day row
  counts, the calendar jump and both rollover journeys. The suite is load-bearing.

A third attempt (gutting `occursAtFor`) failed the *build* rather than the suite, because the now-unused
parameter tripped `noUnusedParameters` — a reminder that `tsc -b` runs before the stubbed lane's server
starts, so a type error surfaces as `Process from config.webServer was not able to start. Exit code: 2`
rather than as a test failure.
