# Menu and Note now

## Goal

**Collapse the app's chrome into one header row of three icon buttons: `Menu`, `Calendar` and
`Note now`, with the title between them.**

The page currently spends two fixed rows above the scroller on chrome. The first holds the title and
`SchedulePicker` — a segmented control of three buttons for a decision that `s3` already made and
most sessions never revisit. The second is `ScheduleView`'s toolbar, `Calendar` and `Go to today`.
Both rows are permanent; neither earns its keep.

They become one. The Schedule moves into a slide-out menu: reasonably hidden, one tap away.
`Go to today` moves into the calendar, where choosing a day already lives. `Calendar` stays, as an
icon. And the space that buys is spent on the other half of the feature.

`Note now` opens the note dialog on **the current period of the current day**, from anywhere — the
one action the app exists for, currently reachable only by selecting the right row and pressing its
`Note` button, and not reachable at all while the view is pinned to another day.

So the header becomes: `Menu` at the left, the title centred, `Calendar` and `Note now` at the
right, and nothing else above the schedule.

No backend work. This is a frontend feature end to end.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

### The header

- **One row, a three-column grid, `1fr auto 1fr`.** Left cell: `Menu`, hugging the left edge. Centre
  cell: the `h1`. Right cell: `Calendar` then `Note now`, hugging the right. The title is centred in
  the header, not equidistant from the buttons — the left cell holds one control and the right two.
  That is the usual compromise and it reads correctly.
- **The split is by kind, not by count.** `Menu` is where the app is configured and is on its own;
  `Calendar` and `Note now` are the two things a reader does with a note — go to another day, or
  write one now — and they sit together. `Note now` is outermost, at the thumb.
- **No `role="toolbar"` on the header.** A toolbar with an `h1` between its controls is not a
  toolbar. The header is a `<header>` with buttons in it. The E2E assertions that the chrome sits
  outside the scroll container and never moves are unchanged in substance; they change subject from
  the toolbar to `.app__header`.
- **All three controls are icon buttons**, inline SVG, no icon dependency. Each carries an
  `aria-label` **and** a `title` — the label for assistive technology and the tests, the tooltip
  because a glyph with no words is the only affordance a first-time user gets on the desktop.
- **The accessible names are fixed: `Menu`, `Calendar`, `Note now`.** `Calendar` is the name the
  existing specs already use, and it does not change. Note the row control is named `Note` exactly —
  RTL's string matcher and Playwright's `exact: true` keep `Note` and `Note now` apart, but only
  because the names differ in full; do not rename either to a prefix of the other.
- **`Note now` carries the accent fill**; `Menu` and `Calendar` do not. With the words gone, weight
  is the only thing left to say which of the three is the action the app exists for.

### The menu drawer

- **The menu is a modal `<dialog>`, anchored to the left edge.** The same shape as `CalendarDialog`
  and `NoteDialog` — Escape and the backdrop close it, focus is contained by the browser, and the
  `showModal`/`close` stubs already in `src/test/setup.ts` cover it. CSS anchors it left and
  full-height (`margin: 0 auto 0 0; height: 100%`) rather than centred. It is a drawer in
  appearance, a dialog in mechanism; it is not a second top-level mode of the app.
- **It holds the Schedule and nothing else, today.** The heading is `Menu`; the picker sits under it
  with no visible label of its own. The drawer is the place future settings land — that is why it is
  called *Menu* and not *Schedule* — but this feature adds no setting that does not exist.
- **No visible `Schedule` label.** The group keeps its `aria-label`, which is what names it for
  assistive technology and for every test that reaches for it, but nothing on screen explains the
  concept. *Schedule* is the app's word, not the user's: `1h`/`3h`/`6h` are self-describing, and
  labelling them teaches a term nobody needs in order to press one. A second setting is what would
  make labels necessary, and that is when they arrive.
- **`SchedulePicker` is relocated, not rewritten.** Its markup, roles and its own unit tests are
  unchanged; only its parent changes. The picker's `role="group"`/`aria-pressed` shape is what every
  existing Schedule test reaches for, and it keeps working once the drawer is open.
- **Pressing a Schedule closes the drawer** — including a press on the one already selected. One tap
  in, one tap done, and the re-chunked grid is revealed rather than covered. `handleScheduleChange`
  keeps its early return for an unchanged Schedule; the close is on the press, not on the change.
- **No separate indicator of the current Schedule.** The idea left this open. The answer is no.
  Once someone is up and running they are not thinking *I am on `s3`*, they are thinking about
  taking a note: the Schedule is the shape of the grid, not a mode to be reminded of. The row
  heights and the gutter times say which Schedule is on, and the drawer is one tap from confirming
  it by name. A permanent `3h` badge in the header would restore exactly the clutter this feature
  removes — and would put the concept back in front of someone who has stopped needing it.

### `Go to today`

- **It becomes a `Today` button in the calendar, beside the month arrows.** Choosing a day already
  lives in the calendar, and `handlePickDay` already special-cases the current day by calling
  `goToToday()`. What is missing is reaching today's cell once the grid has been paged to another
  month. The button is that: it calls `onPickDay(currentDay)` and so un-pins, closes and re-selects
  by exactly the path the cell takes. It is not a "show this month" control — the name says go.
- **The rollover notice becomes the one-tap way back.** Losing the toolbar costs the cheap return
  from a pinned day; without it, getting back is Calendar → Today, or `Note now` and a dialog you
  may not want. The notice already renders only while `awayFromToday`, so it is the perfect place:
  the text stays, and a button inside it un-pins. Zero permanent chrome, and it appears exactly when
  it is useful.
- **The notice keeps its `role="status"` wrapper, with the button inside it.** A button is not
  announced; the status region is what tells a screen-reader user the day has rolled over while they
  were reading another one. The region announces, the button acts, and neither job moves.

### `Note now`

- **`Note now` returns the view to today, then opens.** Pressing it un-pins the view — precisely
  what the calendar's `Today` does — and opens the dialog on the current day's current period once
  that day's notes have landed. One behaviour from everywhere: the note being edited is always on
  screen behind the dialog, and the dialog can never open an empty editor over a note that has not
  been fetched yet, which a save would then overwrite.
- **`Note now` does not pin.** `handleOpenNote` pins the row it opens, because choosing a row is a
  commitment. Choosing *now* is the opposite: `pinned` becomes `null` and the view follows the
  clock, so the selected row is the current period by derivation and a rollover moves it.
- **The open is deferred, not conditional.** There is one path: the press sets a pending flag, and an
  effect opens the dialog when the current day is rendered and loaded. When the view is already on
  today — the common case — that resolves in the same commit and the dialog appears at once. There
  is no second, faster branch to keep in step with the first.
- **A failed window request abandons a pending open.** If the fetch errors the day never loads;
  clearing the flag stops a dialog appearing minutes later, when a retry lands under a view the user
  has since moved.
- **`Note now` is never disabled.** A pending open that has not resolved is invisible; a greyed-out
  button in the header is a permanent piece of noise for a state that lasts one request.

### Everywhere

- **No header control is reachable while a dialog is open**, by the same mechanism as the picker
  today: a modal `<dialog>` swallows the click. No close-the-other-dialog guard is written, and an
  E2E spec records why it is not needed.
- **No animation and no swipe.** A drawer that slides is a CSS pass, not a behaviour.
- **~~No focus-restore work beyond the browser's own.~~** *Revised during implementation — see
  Implementation notes.* `<dialog>` restores focus when it **closes**; `MenuDrawer` returns `null`,
  so it unmounts instead and nothing is restored. `App` does it explicitly, from an effect.

## Architecture

Frontend only, `timely-notes-ui`. One new component; the rest is `App` wiring, CSS, and test
updates.

- **`src/components/MenuDrawer.tsx`** (new) — the drawer shell, modelled on `CalendarDialog`:
  returns `null` when closed, calls `showModal()` from an effect when opened, and forwards
  `onCancel`/`onClose` to `onClose`. Props: `isOpen`, `selected: ScheduleShortName`,
  `onChangeSchedule(shortName)`, `onClose()`. Renders an `h2` `Menu`, a labelled `Schedule` group
  containing `SchedulePicker`, and a `Close` button. It decides nothing — every press goes to `App`.
- **`src/App.tsx`** — the header becomes the three-column row described above, and owns the
  `Calendar` button that `ScheduleView` used to hold. All three buttons carry `aria-label` and
  `title`; `Menu` and `Note now` carry `aria-haspopup="dialog"`, and `Menu` carries `aria-expanded`.
  New state: `isMenuOpen`, `isNoteNowPending`. `SchedulePicker` is no longer rendered here. The
  rollover notice gains a button that calls `goToToday`.
- **`src/components/ScheduleView.tsx`** — `.schedule__nav` and its two buttons are deleted, and with
  them the `onOpenCalendar` and `onGoToToday` props. `ScheduleView` becomes the scroller and nothing
  else; the `.schedule` wrapper goes with the toolbar it was there to sit beside.
- **`src/components/CalendarDialog.tsx`** — a `Today` button in the header row beside the month
  arrows, calling `onPickDay(currentDay)`. No new prop: `currentDay` is already there.
- **`src/App.css`** — `.app__header` becomes `grid-template-columns: 1fr auto 1fr`;
  `.app__header-actions` for the two right buttons; `.app__header-button` sized for a finger, with
  `.app__header-button--primary` for the accent fill; focus-visible outlines matching
  `.schedule__nav-button`, whose own rules are deleted with the toolbar. `.menu-drawer` anchored to
  the left edge, full height, with its backdrop. `.app__status-action` for the rollover button.
- **`e2e/`** — `fixtures/ScheduleView.ts`: `toolbar` becomes `header` (`.app__header`), and the
  bounding-box specs follow it; `goToTodayButton` becomes the calendar's `Today`; new
  `rolloverTodayButton`, `menuButton`, `noteNowButton`, `menu`, `openMenu()` and `closeMenu()`;
  `schedule(label)` re-scoped to inside the drawer. `e2e/menu.spec.ts` is new; the `Note now`
  journeys join `note-dialog.spec.ts`.

### How `Note now` resolves

```
handleNoteNow: setPinned(null); setIsNoteNowPending(true)

effect, while isNoteNowPending:
  the current day's DayView is in `days` (guaranteed once pinned is null) and not isLoading
    → clear the flag, setDialogSlot({ day: currentDay, period: <the selectedOrdinal row> })
  the window request has errored
    → clear the flag, open nothing
```

The effect reads the period out of the already-derived `days`, and identifies it by
`selectedOrdinal` — which, with `pinned` null, *is* `ordinalOf(now, spanHours)`. So the effect never
touches `now`, nothing memoises on it, and no tick can cause a refetch. A rollover between press and
open is handled by that same derivation: the dialog opens on whichever period is current when it
opens, and `dialogSlot` then freezes that address for the life of the dialog, per `LiveClock.MD` §4.

## Checklist

### 1. The drawer component (`src/components/MenuDrawer.tsx`)

- [x] Test first in `src/components/MenuDrawer.test.tsx`: with `isOpen` false it renders nothing —
      no dialog, and no Schedule buttons in the document.
- [x] With `isOpen` true it renders a dialog headed `Menu`, containing the Schedule group with a
      button per Schedule and the current one pressed.
- [x] Pressing a Schedule calls `onChangeSchedule` with that short name.
- [x] Pressing `Close` calls `onClose`; a `cancel` event on the dialog (Escape) calls `onClose`.
- [x] The component, following `CalendarDialog`'s open/close shape.

### 2. The toolbar leaves `ScheduleView`

- [x] Test first in `src/components/ScheduleView.test.tsx`: the rendered view contains no `Calendar`
      and no `Go to today` button — the existing toolbar assertions invert.
- [x] Delete `.schedule__nav`, the `onOpenCalendar`/`onGoToToday` props and the `.schedule` wrapper;
      update every call site and the props' TSDoc.

### 3. `Go to today` moves into the calendar

- [x] Test first in `src/components/CalendarDialog.test.tsx`: the dialog header has a `Today`
      button, and pressing it calls `onPickDay` with `currentDay`.
- [x] Pressing it while the grid shows another month still calls `onPickDay` with `currentDay` —
      the button does not depend on today being in view.
- [x] The button, beside the month arrows.
- [x] Test first in `src/App.test.tsx`: from a day reached through the calendar, reopening it and
      pressing `Today` closes the dialog, un-pins the view and clears the rollover notice.

### 4. The rollover notice becomes actionable

- [x] Test first in `src/App.test.tsx`: while away from today the status region contains a button
      that returns the view to today; the region itself keeps `role="status"`.
- [x] It is absent while the view is on today.
- [x] The button inside the existing status paragraph.

### 5. The header and the menu (`src/App.tsx`)

- [x] Test first in `src/App.test.tsx`: on first render the header has buttons named `Menu`,
      `Calendar` and `Note now`, and **no** Schedule buttons — the picker is not in the open any
      more.
- [x] Each of the three carries a `title` matching its `aria-label` — the tooltip is the only word
      an icon button has.
- [x] Pressing `Menu` opens the drawer and reveals the Schedule buttons; the button's
      `aria-expanded` follows.
- [x] Pressing `Calendar` in the header opens the calendar dialog — the route the toolbar used to
      own.
- [x] Choosing `6h` in the drawer re-chunks all three days *and* closes the drawer.
- [x] Choosing the Schedule already selected closes the drawer and changes nothing else.
- [x] Closing the drawer with `Close` leaves the Schedule as it was.
- [x] The header markup, `isMenuOpen` state, and the close-on-press wiring.

### 6. `Note now` (`src/App.tsx`)

- [x] Test first in `src/App.test.tsx`, clock frozen: pressing `Note now` opens the note dialog
      headed with the **current** period's label, with the current day's note for that period
      loaded into the editor.
- [x] It opens the current period even when another row is selected — assert against a fixture note
      belonging to the current period, so an off-by-one lands on the wrong content, not merely the
      wrong heading.
- [x] Pressing it while pinned to another day (jumped to via the calendar) returns the view to today
      — the three rendered day headings are today's window and the rollover notice is gone — and
      then opens the dialog on today's current period.
- [x] While the current day's notes are still in flight, nothing opens; the dialog appears once they
      land. Drive this from a deferred `fetch` stub.
- [x] A window request that errors clears the pending open: the error is shown and no dialog appears
      after it.
- [x] Cancelling the dialog leaves the view un-pinned — the selected row is still the current period
      and the view still follows the clock.
- [x] `isNoteNowPending`, the handler and the effect.

### 7. Layout (`src/App.css`)

- [x] The three-column header: `Menu` left, title centred, `Calendar` then `Note now` right.
      *(Styling; asserted by the E2E layout specs below, not by a unit test.)*
- [x] `Note now` carries the accent fill; the other two do not.
- [x] The drawer anchored to the left edge and full height, with its backdrop.
- [x] Focus-visible outlines on all three header buttons and the rollover button, matching the
      `.schedule__nav-button` rules they replace.
- [x] Delete `.schedule__nav`, `.schedule__nav-button` and `.schedule`, and re-home the comment above
      `.schedule-view` — it describes a scroller between two toolbars that will no longer exist.

### 8. E2E — page object and specs

- [x] `e2e/fixtures/ScheduleView.ts`: `toolbar` becomes `header`; `goToTodayButton` becomes the
      calendar's `Today`; add `rolloverTodayButton`, `menuButton`, `noteNowButton`, `menu`,
      `openMenu()` and `closeMenu()`; re-scope `schedule(label)` to inside the drawer; update the
      `dialog` getter's comment — one dialog at a time is still true, and the menu is now one of the
      three. *(Setup step, no test of its own.)*
- [x] `calendar.spec.ts`: the toolbar spec becomes *the header stays outside the scroll container and
      never moves* — the same bounding-box check with `.app__header` as its subject, and no toolbar
      inside the scroller.
- [x] `calendar.spec.ts`: the `Go to today` journeys go through the calendar's `Today` button; the
      rollover-notice spec presses the notice's own button instead.
- [x] `layout.spec.ts`: the same re-homing of the bounding-box spec, and the Schedule switches in the
      row-height specs go through `openMenu()`.
- [x] `schedule.spec.ts`: every switch goes through `openMenu()`. The assertions are unchanged,
      except that the ones reading `aria-pressed` after a change reopen the menu to read it.
- [x] `schedule.spec.ts`: `cannot change schedule while a dialog is open` becomes *the `Menu` button
      is behind the dialog* — the click is intercepted and the Schedule is unchanged. The reason
      `App` carries no close-the-other-dialog guard is recorded there, as it is today.
- [x] `e2e/menu.spec.ts` (new): the drawer opens from the header button, is modal in the browser's
      own terms, and takes focus.
- [x] `e2e/menu.spec.ts`: Escape closes it, and focus returns to the `Menu` button.
- [x] `e2e/menu.spec.ts`: picking a Schedule closes the drawer, and the day behind it is re-chunked.
- [x] `note-dialog.spec.ts`: `Note now` opens the dialog on the frozen clock's period
      (`18:00 – 21:00` at 20:20, `s3`) with that period's note in the editor.
- [x] `note-dialog.spec.ts`: from a day reached through the calendar, `Note now` brings the view
      back to today and opens today's current period.
- [x] `note-dialog.spec.ts`: after the clock is fast-forwarded across midnight, `Note now` opens the
      **new** day's first period — the rollover journey, through the new button.

### 9. Documentation

- [x] `CLAUDE.md`: add `MenuDrawer` to the components row, and update **Current state** to describe
      the header — one row of three icon buttons, the menu drawer holding the Schedule, `Note now`,
      and `Go to today` inside the calendar.
- [x] `CLAUDE.md` **Invariants**: rewrite the `ScrollingSchedule` entry — `.schedule-view` is still
      the only scroll container, but the chrome that must stay outside it is now `.app__header`, not
      a toolbar inside `ScheduleView`.
- [x] `CLAUDE.md` **Invariants**: add the one this feature creates — *`Note now` un-pins and opens
      on the current period, never on the selection, and it waits for the day rather than opening on
      an unloaded one.*
- [x] `feature-docs/IDEAS.MD`: remove the *Schedule selection behind a burger menu* entry — it has
      left the file by becoming this specification. *(Done at specification time.)*

## Verify

From `timely-notes-ui/`:

- `npm test` — every Vitest spec green, including the new `MenuDrawer` suite and the `App` suites
  for the header and `Note now`.
- `npm run lint`
- `npm run build` — `tsc -b` clean.
- `npm run test:e2e` — the stubbed lane, including `menu.spec.ts` and the amended
  `calendar.spec.ts` / `layout.spec.ts` / `schedule.spec.ts`.
- `npm run test:e2e:integrated` — unchanged and still passing; this feature adds nothing to it.

Manually, with `run-dev.ps1`:

- The header is one row: one icon at the left, the title, two icons at the right of which the
  outermost is accented. No
  Schedule buttons, and no toolbar above the days.
- Hovering each button names it; a screen reader reads `Menu`, `Calendar`, `Note now`.
- `Menu` slides out from the left; `1h` re-chunks every day and the drawer closes behind it.
- `Note now` opens the note for the period the clock is in, with that row selected behind it.
- Jump to a past day with the calendar: the notice appears and its button returns the view to today.
- Jump again, then press `Note now`: the view snaps back to today and the dialog opens on the
  current period.
- Open the calendar, page to another month, press `Today`: it closes and the view is on today.
- Escape closes the drawer and focus lands back on `Menu`.

## Deferred

- **Slide animation** on the drawer, and any swipe-to-open gesture.
- **Anything else in the menu.** No theme, no locale, no default-Schedule persistence — the drawer
  holds the Schedule only. Remembering the chosen Schedule across reloads is a real feature and is
  not this one.
- **A keyboard shortcut for `Note now`.** An obvious next step; it needs a decision about where a
  global key listener lives, which this feature does not have to take.
- **A current-Schedule indicator** in the header, should the drawer prove too well hidden.
- **Small-screen layout** of the header — three icons and a title are comfortable at a phone width,
  which is why the icons came forward; anything further is the mobile interface idea, not this.
- **A first-run hint** naming the icon buttons. The `title` tooltips are the whole of the
  introduction this feature ships.

## Implementation notes

**Focus restore is the app's job, not the browser's.** The specification assumed `<dialog>` returns
focus to the invoker. It does — when the dialog *closes*. `MenuDrawer` returns `null` when
`isOpen` is false, so the element is removed from the DOM and the close never happens; Escape left
focus on `<body>`. The E2E spec caught it, and the fix started from a failing `App` unit test as
`CLAUDE.md` requires.

The first fix — focusing the button inside the close handler — passed Vitest and still failed in
Chromium. On Escape the `cancel` handler runs *before* the browser's own close sequence, which then
moves focus itself and wins. It works from an effect on `isMenuOpen`, guarded by a `wasMenuOpen` ref
so it does not steal focus on mount, because that lands after the unmount has committed. This is a
genuine jsdom/browser disagreement: only the Playwright lane could have found it. It is now an
invariant in `CLAUDE.md`, because `CalendarDialog` and `NoteDialog` share the shape and the same gap.

**The `Note now` effect needs a lint suppression.** `react-hooks/set-state-in-effect` rejects it and
advises derivation. Derivation is wrong here: a derived slot recomputes every render, so a rollover
while the dialog is open would move `currentDay` underneath it and re-address the editor — and
because `NoteDialog` keys its body on `${day}:${ordinal}`, that remounts the body mid-edit. Capturing
the ordinal at press time instead is incoherent for the same rollover, pairing the old day's period
number with the new day. The effect is right because of *when* it reads: late enough that a rollover
between press and open moves the target, once only so that nothing moves it afterwards. One
`eslint-disable-next-line` with the reason above it, in `App.tsx`.

**`MenuDrawer` needed no `Schedule` label.** `SchedulePicker` already carries
`role="group" aria-label="Schedule"`, which is what every test reaches for. A visible `<h3>` was
added and then removed — see the scope decision. The picker is the drawer's only content and
`1h`/`3h`/`6h` say what they do.

**A jsdom-only test was deleted, not ported.** `keeps the calendar open across a schedule change`
drove the picker while the calendar dialog was open. jsdom does not enforce `<dialog>` modality, so
that journey existed only in the test — a real browser already swallowed the click. It is replaced
by a version that closes the calendar, switches Schedule and reopens, which still holds the thing
worth holding: the counts are re-asked under the new short name.

**The rollover notice's text changed shape.** With the button inside the status region,
`getByText(/^It is now /)` now resolves an element whose text includes `Go to today`. Two E2E
assertions moved from `toHaveText` to `toContainText`; nothing else reads it.

**`ScheduleView` lost more than the toolbar.** The `.schedule` flex wrapper existed only to sit the
toolbar beside the scroller, so it went too. `.schedule-view` is now `App`'s direct child and the
flex child that grows, which is what keeps the header fixed.

**Verified in a browser**, not only in the lanes: header, drawer, calendar with `Today`, and
`Note now` opening `18:00 – 21:00` with its note already in the editor.

## Change request — dismissing the drawer (2026-09-21)

**The drawer light-dismisses.** A press outside it closes it. The dialog element *is* the backdrop,
so the padding moved off it onto a `.menu-drawer__panel` inside; a click whose `target` is the
dialog itself therefore came from outside the drawer. Without that move a press on the dialog's own
padding — visibly inside the panel — would close it too. `closedby="any"` was not used: jsdom does
not implement it, so the behaviour would have had no unit test.

**`Close` is an × at the top-right.** It sits in a `.menu-drawer__header` flex row beside the
`Menu` heading, an icon button named by `aria-label` and `title` like the three in the app header,
using a new `CloseIcon`. `.menu-drawer__actions` and its rule are gone. The accessible name is
still `Close`, so the page object and every existing test reach it unchanged.
