# Menu and Note now

## Goal

**Give the page a header of two controls: a slide-out `Menu` on the left, and `Note now` on the
right.**

`SchedulePicker` currently sits in the open, under the title. The Schedule is chosen rarely — `s3`
is the default and most sessions never change it — so a segmented control of three buttons spends
its life occupying the top of the page for a decision already made. It moves into a slide-out menu:
reasonably hidden, one tap away.

The space that buys is spent on the other half of the feature. `Note now` opens the note dialog on
**the current period of the current day**, from anywhere — the one action the app exists for,
currently reachable only by selecting the right row and pressing its `Note` button, and not
reachable at all while the view is pinned to another day.

So the header becomes three slots: `Menu` at the left, the title in the middle, `Note now` at the
right. Both buttons keep text labels for now; icons are a later pass, and the specification below
fixes the *accessible names* precisely so that pass changes nothing but the visuals.

The scrolling toolbar underneath is untouched: `Calendar` and `Go to today` stay exactly where they
are. Nothing moves into the menu except the Schedule.

No backend work. This is a frontend feature end to end.

Following TDD (per `CLAUDE.md`): write a failing test before each piece of code below.

## Scope decisions

- **The menu is a modal `<dialog>`, anchored to the left edge.** The same shape as `CalendarDialog`
  and `NoteDialog` — Escape and the backdrop close it, focus is contained by the browser, and the
  `showModal`/`close` stubs already in `src/test/setup.ts` cover it. CSS anchors it left and
  full-height (`margin: 0 auto 0 0; height: 100%`) rather than centred. It is a drawer in
  appearance, a dialog in mechanism; it is not a second top-level mode of the app.
- **It holds the Schedule and nothing else, today.** The heading is `Menu`, and the picker sits
  under a `Schedule` label inside it. The drawer is the place future settings land — that is why it
  is called *Menu* and not *Schedule* — but this feature adds no setting that does not exist.
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
- **`Note now` returns the view to today, then opens.** Pressing it un-pins the view — precisely
  what `Go to today` does — and opens the dialog on the current day's current period once that day's
  notes have landed. One behaviour from everywhere: the note being edited is always on screen behind
  the dialog, and the dialog can never open an empty editor over a note that has not been fetched
  yet, which a save would then overwrite.
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
- **Neither button is reachable while a dialog is open**, by the same mechanism as the picker today:
  a modal `<dialog>` swallows the click. No close-the-other-dialog guard is written, and an E2E spec
  records why it is not needed.
- **`Note now` is never disabled.** A pending open that has not resolved is invisible; a greyed-out
  button in the header is a permanent piece of noise for a state that lasts one request.
- **Accessible names are fixed now: `Menu`, `Note now`.** The icon pass replaces the text with an
  `aria-label` carrying the same string, and no test changes. Note the row control is named `Note`
  exactly — RTL's string matcher and Playwright's `exact: true` both keep `Note` and `Note now`
  apart, but only because the names differ in full; do not rename either to a prefix of the other.
- **No animation, no swipe, and no focus-restore work beyond the browser's own.** A drawer that
  slides is a CSS pass, not a behaviour, and `<dialog>` already returns focus to the invoker.

## Architecture

Frontend only, `timely-notes-ui`. One new component; the rest is `App` wiring, CSS, and test
updates.

- **`src/components/MenuDrawer.tsx`** (new) — the drawer shell, modelled on `CalendarDialog`:
  returns `null` when closed, calls `showModal()` from an effect when opened, and forwards
  `onCancel`/`onClose` to `onClose`. Props: `isOpen`, `selected: ScheduleShortName`,
  `onChangeSchedule(shortName)`, `onClose()`. Renders an `h2` `Menu`, a labelled `Schedule` group
  containing `SchedulePicker`, and a `Close` button. It decides nothing — every press goes to `App`.
- **`src/App.tsx`** — the header becomes three slots: a `Menu` button, the `h1`, and a `Note now`
  button. Both carry `aria-haspopup="dialog"`; the menu button carries `aria-expanded`. New state:
  `isMenuOpen`, `isNoteNowPending`. `SchedulePicker` is no longer rendered here.
- **`src/App.css`** — `.app__header` becomes `grid-template-columns: auto 1fr auto` with the title
  centred; `.app__header-button` for the two controls, sized for a finger and ready to take an icon;
  `.menu-drawer` anchored to the left edge, full height, with its backdrop.
- **`e2e/`** — `fixtures/ScheduleView.ts` gains `menuButton`, `noteNowButton`, `menu`, `openMenu()`
  and `closeMenu()`, and `schedule(label)` is re-scoped to inside the drawer. Existing specs that
  switch Schedule (`schedule.spec.ts`, `layout.spec.ts`) open the menu first. `e2e/menu.spec.ts` is
  new; the `Note now` journeys join `note-dialog.spec.ts`.

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

- [ ] Test first in `src/components/MenuDrawer.test.tsx`: with `isOpen` false it renders nothing —
      no dialog, and no Schedule buttons in the document.
- [ ] With `isOpen` true it renders a dialog headed `Menu`, containing the Schedule group with a
      button per Schedule and the current one pressed.
- [ ] Pressing a Schedule calls `onChangeSchedule` with that short name.
- [ ] Pressing `Close` calls `onClose`; a `cancel` event on the dialog (Escape) calls `onClose`.
- [ ] The component, following `CalendarDialog`'s open/close shape.

### 2. The header and the menu (`src/App.tsx`)

- [ ] Test first in `src/App.test.tsx`: on first render there is a `Menu` button and a `Note now`
      button, and **no** Schedule buttons — the picker is not in the open any more.
- [ ] Pressing `Menu` opens the drawer and reveals the Schedule buttons; the button's
      `aria-expanded` follows.
- [ ] Choosing `6h` in the drawer re-chunks all three days *and* closes the drawer.
- [ ] Choosing the Schedule already selected closes the drawer and changes nothing else.
- [ ] Closing the drawer with `Close` leaves the Schedule as it was.
- [ ] The header markup, `isMenuOpen` state, and the close-on-press wiring.

### 3. `Note now` (`src/App.tsx`)

- [ ] Test first in `src/App.test.tsx`, clock frozen: pressing `Note now` opens the note dialog
      headed with the **current** period's label, with the current day's note for that period
      loaded into the editor.
- [ ] It opens the current period even when another row is selected — assert against a fixture note
      belonging to the current period, so an off-by-one lands on the wrong content, not merely the
      wrong heading.
- [ ] Pressing it while pinned to another day (jumped to via the calendar) returns the view to today
      — the three rendered day headings are today's window and the rollover notice is gone — and
      then opens the dialog on today's current period.
- [ ] While the current day's notes are still in flight, nothing opens; the dialog appears once they
      land. Drive this from a deferred `fetch` stub.
- [ ] A window request that errors clears the pending open: the error is shown and no dialog appears
      after it.
- [ ] Cancelling the dialog leaves the view un-pinned — the selected row is still the current period
      and the view still follows the clock.
- [ ] `isNoteNowPending`, the handler and the effect.

### 4. Layout (`src/App.css`)

- [ ] The three-slot header grid: `Menu` left, title centred, `Note now` right. *(Styling; asserted
      by the E2E layout specs below, not by a unit test.)*
- [ ] The drawer anchored to the left edge and full height, with its backdrop.
- [ ] Focus-visible outlines on both header buttons, matching `.schedule__nav-button`.

### 5. E2E — page object and specs

- [ ] `e2e/fixtures/ScheduleView.ts`: add `menuButton`, `noteNowButton`, `menu`, `openMenu()` and
      `closeMenu()`; re-scope `schedule(label)` to inside the drawer; update the `dialog` getter's
      comment — one dialog at a time is still true, and the menu is now one of the three.
      *(Setup step, no test of its own.)*
- [ ] `schedule.spec.ts`: every switch goes through `openMenu()`. The assertions are unchanged,
      except that the ones reading `aria-pressed` after a change reopen the menu to read it.
- [ ] `schedule.spec.ts`: `cannot change schedule while a dialog is open` becomes *the `Menu` button
      is behind the dialog* — the click is intercepted and the Schedule is unchanged. The reason
      `App` carries no close-the-other-dialog guard is recorded there, as it is today.
- [ ] `layout.spec.ts`: the Schedule switches in the row-height specs go through `openMenu()`.
- [ ] `e2e/menu.spec.ts` (new): the drawer opens from the header button, is modal in the browser's
      own terms, and takes focus.
- [ ] `e2e/menu.spec.ts`: Escape closes it, and focus returns to the `Menu` button.
- [ ] `e2e/menu.spec.ts`: picking a Schedule closes the drawer, and the day behind it is re-chunked.
- [ ] `e2e/menu.spec.ts`: the header buttons stay put while the days scroll — the same
      bounding-box check `layout.spec.ts` makes of the toolbar.
- [ ] `note-dialog.spec.ts`: `Note now` opens the dialog on the frozen clock's period
      (`18:00 – 21:00` at 20:20, `s3`) with that period's note in the editor.
- [ ] `note-dialog.spec.ts`: from a day reached through the calendar, `Note now` brings the view
      back to today and opens today's current period.
- [ ] `note-dialog.spec.ts`: after the clock is fast-forwarded across midnight, `Note now` opens the
      **new** day's first period — the rollover journey, through the new button.

### 6. Documentation

- [ ] `CLAUDE.md`: add `MenuDrawer` to the components row, and update **Current state** to describe
      the header — the menu drawer holding the Schedule, and `Note now`.
- [ ] `CLAUDE.md` **Invariants**: add the one this feature creates — *`Note now` un-pins and opens
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
  `schedule.spec.ts` / `layout.spec.ts`.
- `npm run test:e2e:integrated` — unchanged and still passing; this feature adds nothing to it.

Manually, with `run-dev.ps1`:

- The header shows `Menu`, the title and `Note now`, and no Schedule buttons.
- `Menu` slides out from the left; `1h` re-chunks every day and the drawer closes behind it.
- `Note now` opens the note for the period the clock is in, with that row selected behind it.
- Jump to a past day with the calendar, then press `Note now`: the view snaps back to today and the
  dialog opens on the current period.
- Escape closes the drawer and focus lands back on `Menu`.

## Deferred

- **Icons.** Both buttons keep text labels; the swap keeps the accessible names as `aria-label`.
- **Slide animation** on the drawer, and any swipe-to-open gesture.
- **Anything else in the menu.** No theme, no locale, no default-Schedule persistence — the drawer
  holds the Schedule only. Remembering the chosen Schedule across reloads is a real feature and is
  not this one.
- **A keyboard shortcut for `Note now`.** An obvious next step; it needs a decision about where a
  global key listener lives, which this feature does not have to take.
- **Moving `Calendar` or `Go to today` into the menu.** They stay in the scroll toolbar.
- **A current-Schedule indicator** in the header, should the drawer prove too well hidden.
- **Small-screen layout** of the header — three slots at a phone width is a question for the mobile
  interface idea, not for this feature.

## Implementation notes

*(Filled in by the implementing agent.)*
