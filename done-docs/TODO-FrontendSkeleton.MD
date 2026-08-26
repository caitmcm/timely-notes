# TODO

Actionable steps derived from `DESIGN DOCUMENT.MD`. Updated as work progresses.

## Current goal

Frontend: first vertical slice — **the day schedule view**.

Land on the app, pick a Schedule (default 3-hourly), and see today split into periods like a calendar day view. A **period** is the span between two hour points that divides evenly into the Schedule: on the 3h Schedule, 15:00–18:00 is one period, 18:00–21:00 the next.

The period containing the current time starts out selected and highlighted, and the selected period is the one showing a **Note** button. Clicking any other row moves the selection — and the button — there. Notes already recorded for the selected Schedule are fetched from the backend, listed in their period in chronological order, and open in the same dialog with their content loaded.

Save closes the dialog and `console.log`s the markdown — there is no create or update endpoint yet (see **Deferred**).

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below. The frontend has no test framework, so section 1 is a hard prerequisite for everything after it.

## Reference layout

From the agreed mockup, at 20:20 on 25/08/2026 with the 3h Schedule selected:

```
┌─────────────────────────────────┐
│   [ 1h ]   [ 3h ]*  [ 6h ]      │   * active Schedule
├─────────────────────────────────┤
│ 25/08/2026                      │   day heading
│ 00:00                           │
│ 03:00                           │
│ 06:00                           │
│ 09:00                           │
│ 12:00                           │
│ 15:00                           │
│ 18:00              [ Note ]     │   <- selected + current, highlighted
│ 21:00                           │
├─────────────────────────────────┤
│ 26/08/2026                      │   closing boundary
│  00:00                          │
└─────────────────────────────────┘
```

Points the mockup settles:

- The gutter shows each period's **start time only** (`18:00`), not the full range. The range (`18:00 – 21:00`) is the dialog title and the row's accessible name.
- The Schedule picker is a segmented control of three buttons labelled `1h` / `3h` / `6h`.
- The button reads **Note**, and only the selected period has one.
- The day is closed off by a boundary row showing the next day's date at `00:00`.
- The whole day fits the column at every Schedule, so total height is fixed and each row is proportional to its span: a 6h row is six times a 1h row.

## Scope decisions

- **Today only.** No previous/next day navigation in this slice.
- **Every period is selectable**, past and future alike — not just the current one. Selection starts on the current period.
- **Selection, not ubiquity, drives the Note button.** One button on screen at a time, on the selected row.
- **Taking a note is two interactions: select, then Note.** Clicking an unselected row selects it and does nothing else — it never opens the editor directly. A stray click on the wrong row costs nothing, and the button always names the period it will write to.
- **Real API, via a Vite dev proxy.** `GET /api/schedules/{shortName}/notes` is the one endpoint that exists; the UI calls it for real rather than mocking data locally.
- **Existing notes open from the list payload.** That endpoint already returns each note's full `content`, so opening one needs no Get-by-Id call — the day view already has the text in hand and passes it straight to the dialog.
- **One editor view, not two.** New and existing notes both use the current `NoteEditor`, editable in both cases. Notes are write-once per the design doc, but a read-only view only matters once Save actually persists — handle it in the create/update slice.
- **No router.** The app is a single view; the selected Schedule is React state, not a URL segment. Revisit when day navigation or deep links arrive.
- **Schedules are hardcoded** as `s1` / `s3` / `s6` in the UI. There are no Schedule endpoints yet, and per the design doc the short name *is* the spanning-period identifier, so the three options are known statically. The first-run "create a Schedule" flow is deferred.

## Architecture

Inside `timely-notes-ui/src`:

- `api/` — `notesApi.ts`: thin `fetch` wrapper over the backend. Returns typed DTOs; no React in here.
- `domain/` — pure, framework-free time logic (`schedules.ts`, `periods.ts`). Easiest thing to TDD and the part most likely to be wrong, so it gets the most tests.
- `types/` — shared `Note`, `Schedule`, `Period`, `SpanHours` types.
- `components/` — `ScheduleView`, `PeriodRow`, `SchedulePicker`, `NoteDialog`, plus the existing `NoteEditor` (unchanged).
- `App.tsx` — shell: owns selected Schedule, fetched notes, the selected period, and dialog state.

Data flow is one-way, and **`App` computes the periods**: it calls `buildPeriods` then `assignNotes` in a `useMemo` and hands `ScheduleView` a finished `Period[]`. `ScheduleView` renders rows, `PeriodRow` raises select / take-note / open-note, `App` updates state and opens `NoteDialog`. No component calls the domain functions itself, so every component test can pass in fixed periods.

### 0. Backend prerequisite — seed against today

`InMemoryNoteRepository.SeedNotes()` currently anchors every note to a hardcoded `new DateTimeOffset(2026, 8, 24, ...)`, so on any other date the day view is correctly empty and looks like broken wiring. The seed exists only to give the UI something to render — its accuracy doesn't matter, only that data shows up today.

- [x] Test first: construct a repository and assert every seeded note's `CreatedAt` falls on the current date, so the seed can't silently drift back to a fixed day. (Both the seed and the assertion read the clock, so the only flake window is a run that straddles midnight — acceptable.)
- [x] Change the seed anchor to local midnight today — `new DateTimeOffset(DateTime.Today, DateTimeOffset.Now.Offset)` — keeping the existing hour offsets and content.
- [x] Anchor in **local** time, not UTC: a `09:00Z` note renders in a different period for anyone not on UTC, which muddies manual verification of the period buckets.
- [x] The repository is a singleton built at startup, so "today" is frozen when the process starts. Fine for dev; a long-running server crossing midnight would go stale. Note it in the class summary rather than solving it.
- [x] Existing repository and endpoint tests assert only "not empty" and newest-first ordering, so they should stay green. Confirm with `dotnet test` before moving on.

### 1. Test setup (prerequisite)

- [x] Install dev deps: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- [x] Configure Vitest inside `vite.config.ts` (`test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts' }`).
- [x] `src/test/setup.ts` importing `@testing-library/jest-dom/vitest`.
- [x] Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`.
- [x] Add `"types": ["vitest/globals"]` (or import explicitly) so `tsc -b` stays clean.
- [x] Sanity test, then confirm `npm test` and `npm run build` both pass before writing any feature code.

### 2. Types (`src/types`)

- [x] `SpanHours = 1 | 3 | 6` — the only spans a Schedule can have. Every function taking a span takes this type, never a bare `number`, so `buildPeriods(day, 5)` is a compile error rather than a runtime surprise.
- [x] `Schedule`: `shortName` (`'s1' | 's3' | 's6'`), `spanHours: SpanHours`, `label` (`"1h"` / `"3h"` / `"6h"`, as shown on the picker).
- [x] `Note`: mirrors `NoteResponse` from the API — `id`, `content`, `createdAt`, `modifiedAt`. ISO strings as received from the wire; parse to `Date` at the API boundary.
- [x] `Period`: `start: Date`, `end: Date`, `notes: Note[]`.

### 3. Domain logic (`src/domain`) — test first

- [x] `SCHEDULES` constant: the three schedules above, ordered `s1`, `s3`, `s6`. `DEFAULT_SCHEDULE` = `s3`.
- [x] `buildPeriods(day: Date, spanHours: SpanHours): Period[]` — splits a local day into `24 / spanHours` consecutive periods starting at local midnight. Each comes back with `notes: []`; this function never sees notes.
  - Tests: 24 periods for `s1`, 8 for `s3`, 4 for `s6`; first starts at 00:00, last ends at the next midnight; periods are contiguous with no gaps; every `notes` array is empty.
- [x] `isCurrentPeriod(period: Period, now: Date): boolean` — `start <= now < end`, so exactly one period matches.
  - Tests: a time inside a period; the exact boundary instant belongs to the *later* period; a time on another day matches nothing.
- [x] `findCurrentPeriod(periods: Period[], now: Date): Period | undefined` — the one period containing `now`. Used for the initial selection.
  - Tests: at 20:20 on `s3` it returns the 18:00–21:00 period; against a day that isn't today it returns `undefined`.
- [x] `assignNotes(periods: Period[], notes: Note[]): Period[]` — **pure**: returns new `Period` objects rather than mutating the input, bucketing each note by `createdAt` into the period whose half-open range contains it.
  - **Order is ascending by `createdAt`**, both across periods (15:00–18:00's notes render above 18:00–21:00's) and within one. The API returns notes *newest-first*, so this function sorts — don't rely on the wire order.
  - Tests: a note lands in the right bucket; two notes in one period come back oldest-first even when supplied newest-first; the input array is not mutated; a note timestamped on another day belongs to none of this day's periods.
  - Watch out: the API returns `DateTimeOffset` with a UTC offset while periods are built in the browser's local time. Parse to `Date` once at the API boundary and compare instants — never compare formatted strings. Add a test with a non-UTC note to pin this down.
- [x] `formatPeriodStart(period: Period): string` producing `"18:00"` — the gutter label (24-hour, zero-padded).
- [x] `formatPeriodLabel(period: Period): string` producing `"18:00 – 21:00"` — the dialog title and the row's accessible name.
- [x] `formatDayHeading(day: Date): string` producing `"25/08/2026"` — the day heading and the closing boundary row.

### 4. API client (`src/api`) — test first

- [x] Vite dev proxy in `vite.config.ts`: `server.proxy['/api'] = 'http://localhost:5186'`, so the UI calls same-origin `/api/...` and no backend CORS config is needed.
- [x] `getNotesBySchedule(shortName: string, signal: AbortSignal): Promise<Note[]>` — `GET /api/schedules/{shortName}/notes`, throws on non-2xx.
  - Tests: stub `fetch` (`vi.stubGlobal`); assert the URL, that the abort signal is forwarded, that JSON maps to `Note[]`, and that a 500 rejects.
- [x] Pass an `AbortSignal` from the calling effect's cleanup — the frontend mirror of the backend's "always pass the cancellation token" rule in `CLAUDE.md`.

### 5. Components (`src/components`) — test first

- [x] `SchedulePicker` — a segmented control of three buttons labelled `1h`, `3h`, `6h`; the active one carries `aria-pressed="true"`; `onChange(shortName)`.
  - Tests: renders all three labels; `s3` is the pressed one by default; clicking `6h` calls `onChange('s6')`.
- [x] `PeriodRow` — props `period`, `isCurrent`, `isSelected`, `onSelect(period)`, `onTakeNote(period)`, `onOpenNote(period, note)`.
  - The whole row is clickable and calls `onSelect(period)`. The **Note** button renders *only* when `isSelected`, and calls `onTakeNote(period)`.
  - **Buttons inside the row don't re-select it.** Note and the note buttons sit inside the row's click target, so their handlers must `stopPropagation` (or the row must ignore events originating from a button). Pressing Note fires `onTakeNote` alone; opening a note fires `onOpenNote` alone. Neither re-fires `onSelect` — the row is already selected, and a redundant state write on every press is noise that will read as a bug later.
  - Existing notes render as their own `<button>`s calling `onOpenNote(period, note)` — real buttons, so keyboard and screen-reader users get them for free. Label each with the note's time plus a short excerpt of its content. **`onOpenNote` passes the period as well as the note**: a `Note` carries no period, and the dialog needs one for its title.
  - `isCurrent` and `isSelected` are independent — they coincide on load and diverge as soon as the user picks another row. The highlight follows **selection** (per the mockup); `aria-current="time"` stays on the real current period, as a fact about the clock rather than about the user.
  - Tests: shows the start-time label; no Note button when not selected, one when selected; clicking the row calls `onSelect` and *not* `onTakeNote`; clicking Note calls `onTakeNote` with the period and *not* `onSelect`; renders nothing note-shaped when the period is empty; clicking a note passes both period and note and doesn't call `onSelect` either; `isCurrent` puts `aria-current="time"` on the row and `isSelected` marks it selected — assert both via accessible markers, not class names.
- [x] `ScheduleView` — props `day`, `periods`, `now`, `selectedPeriod`, plus the three handlers, which it forwards. Renders the day heading, one `PeriodRow` per period, and the closing boundary row with the next day's date at `00:00`.
  - Tests: renders one row per period given (pass 8, get 8 — the "8 periods for `s3`" assertion belongs to `buildPeriods`, not here); exactly one row is `aria-current`; exactly one row is selected and it is the one holding the Note button; notes appear against the right rows; the boundary row shows the next day's date. Inject `now` as a prop (default `new Date()`) so tests are deterministic — do not call `Date.now()` inside the component.
- [x] `NoteDialog` — wraps the existing `NoteEditor` in a native `<dialog>` (`showModal()`), titled with `formatPeriodLabel(period)`, plus Save and Cancel. No new dependency.
  - Takes an optional `note`: absent means a blank editor for a new note; present means seed `NoteEditor` with `note.content`.
  - `NoteEditor` takes its initial markdown as a prop, so remount it per note (`key={note?.id ?? 'new'}`) rather than pushing new content into a live instance — MDXEditor ignores a changed `markdown` prop once mounted.
  - Tests: not rendered when closed; shows the period range when opened blank; shows the existing note's content when opened with a note; Cancel calls `onClose` without saving; Save calls `onSave(markdown)` then closes. `HTMLDialogElement.showModal` is not implemented in jsdom — stub it in `src/test/setup.ts`.
- [x] `NoteEditor` stays as-is. Extend its plugin list if the dialog needs more, per `CLAUDE.md`.

### 6. App shell (`src/App.tsx`) — test first

- [x] State: `selectedSchedule` (default `s3`), `notes`, `loading`, `error`, `selectedStart` (the selected period's start as epoch ms), `dialogPeriod` (non-null means the dialog is open) and `dialogNote` (non-null means it opened on an existing note).
  - **Store the selection as a timestamp, not a `Period` object.** Periods are rebuilt whenever the notes or the Schedule change, so a held object reference goes stale immediately; compare with `period.start.getTime() === selectedStart`.
  - Changing Schedule re-chunks the day, so the old selection may not land on a new boundary. Reset `selectedStart` to the current period whenever `selectedSchedule` changes.
- [x] `periods` via `useMemo`: `assignNotes(buildPeriods(today, schedule.spanHours), notes)`. Nothing below `App` calls the domain functions.
- [x] Effect: fetch notes whenever `selectedSchedule` changes; abort the in-flight request on cleanup/change.
- [x] Render `SchedulePicker` and `ScheduleView`, with a loading state and a visible error message if the fetch fails.
- [x] `handleTakeNote(period)` sets `dialogPeriod` and clears `dialogNote`; `handleOpenNote(period, note)` sets both. Clear both on close, so the next Note press can't reopen the last note.
- [x] `handleSave(markdown)` — `console.log(markdown)`, then close the dialog. Placeholder until the create/update endpoints exist; saving an existing note changes nothing on the server yet.
- [x] Tests: default schedule fetched on mount; switching schedule refetches with the new short name; a failed fetch shows an error rather than a blank page; the current period is selected on load and holds the Note button; clicking another row moves the button to it; Note opens an empty dialog titled with that period's range; clicking an existing note opens the dialog with that note's content; taking a note straight after closing one opens blank.

### 7. Styling (`src/index.css` or co-located CSS)

- [x] Calendar day-view layout: fixed-width time gutter on the left showing each period's start, rows in a single column, the day heading above and the next day's `00:00` boundary below.
- [x] Row height proportional to `spanHours` with the day's total height fixed — so the whole day fits the column on every Schedule, and a 6h block reads as six 1h blocks tall.
- [x] Selected period visually distinct (background tint plus accent border), not colour-only — it also carries the selected marker, and on load the current-period marker too.
- [x] The Note button sits at the right-hand end of the selected row.
- [x] Segmented Schedule picker across the top, active option filled.
- [x] Respect the existing `color-scheme: light dark`; no design system, keep it plain CSS.
- [x] Scroll the selected period into view on load — matters on a short viewport at `s1`, where 24 rows may not fit.

### 8. Verify

- [x] `npm test` passes; `npm run build` and `npm run lint` are clean.
- [x] Backend running (`dotnet run --project TimelyNotes.API` from `TimelyNotes.Backend/`), then `npm run dev`: switching to `3h` shows the two seeded notes against their periods, `1h` shows three, `6h` shows two — all on today's date, per section 0.
- [x] The period containing the current time is highlighted and is the only one with a Note button. Click a different row: the highlight and the button move there.
- [x] Click a seeded note: the dialog opens with its markdown rendered in the editor. Cancel, then press Note on the same row: the editor is empty.
- [x] On `1h`, earlier periods sit above later ones and a period holding more than one note lists them oldest-first.

## Deferred (not in this slice)

- Persisting a note: needs a backend `POST /api/schedules/{shortName}/notes` slice first. Save is a `console.log` until then.
- Browsing to past days, and a date picker. Notes outside today aren't discarded — they simply have no row until the view can scroll to other days.
- A read-only view for existing notes. Notes are write-once, but nothing can be written yet — enforce it alongside the create/update slice.
- A Get-by-Id endpoint. The list response already carries `content`, so nothing in the UI needs it until notes are opened outside a day view.
- Schedule endpoints and the first-run "create a Schedule" flow; schedules stay hardcoded.
- Router, state management library, production API base URL / env config (the proxy is dev-only).
- Auth.

## Implementation notes

Where the finished slice departs from the plan above, and why:

- **`App` takes an optional `now` prop**, captured once with a lazy `useState` initialiser. The plan only asked `ScheduleView` to take an injected `now`; `App` derives *today* and the initial selection from the clock too, so it needed the same seam to be testable. The clock is frozen at mount — the view doesn't tick, which is fine while the slice is today-only.
- **`loading` is derived, not stored.** The fetch result is held as one `{ shortName, notes, error }` object tagged with the Schedule it was for, and loading is `loaded?.shortName !== schedule.shortName`. Setting a `loading` flag in the effect body trips `react-hooks/set-state-in-effect`, and the tag removes the chance of the flag and the request drifting apart.
- **Rows are `option`s of a `listbox`.** Selection is exposed as `aria-selected` and the clock as `aria-current="time"`, so both are assertable without reaching for class names. Note buttons nested inside an option is a known ARIA compromise, taken because the plan wants the whole row clickable *and* buttons inside it; the row carries its own `aria-label` so those buttons stay out of its accessible name.
- **Three domain helpers the plan didn't name:** `nextDay` (the closing boundary row), `formatTimeOfDay` (shared by the gutter and the note buttons), and `noteExcerpt` in `domain/notes.ts` (the one-line label for an existing note's button). All pure and tested alongside the rest.
- **`--day-height: 42rem` is set by the 1h row, not chosen freely.** Rows are `flex: 1 1 0` in a fixed-height column, which is what makes a 6h row exactly six times a 1h row — but it also pins the shortest row at a 24th of the day. A first attempt at 34rem with a per-row `min-height` broke that proportionality *and* let 24 rows overflow the column into the boundary row; sizing the column so a 1h row still fits a note button fixes both.
- **`NoteDialog` tests render the real MDXEditor** rather than a stub — it works in jsdom, so the test exercises the actual `getMarkdown()` round-trip. `HTMLDialogElement.showModal`/`close` are stubbed in `src/test/setup.ts` as planned.

Verified end to end against a running backend at `1h`, `3h` and `6h`, in light and dark, including opening the dialog on the selected period. 86 frontend tests and 16 backend tests pass; `npm run lint` and `npm run build` are clean.
