import type { Locator, Page } from '@playwright/test'

/**
 * Locators, not assertions, resolved by ARIA role and accessible name — the same handles the Vitest
 * suite uses, so a change that breaks a row's accessibility breaks both suites. The scroll
 * container is the one exception and is reached by its `data-testid`.
 *
 * Three days render at once, so every per-day handle goes through `day(heading)`: an unscoped
 * `option` locator matches the same slot on all three and fails strict mode.
 */
export class ScheduleView {
  private readonly page: Page
  private readonly frozenAt: Date

  constructor(page: Page, frozenAt: Date) {
    this.page = page
    this.frozenAt = frozenAt
  }

  /**
   * Loads the app and stops the clock on it. The clock is installed at the frozen instant before
   * this navigation — pausing it before the page loads leaves the load event waiting on timers that
   * can no longer fire, so the pause comes the moment the page is up.
   */
  async open() {
    await this.page.goto('/')
    await this.page.clock.pauseAt(this.frozenAt)
  }


  /**
   * Loads the page again without re-pausing: a spec that has run the clock forward is already past
   * the frozen instant, and pausing back onto it is a fast-forward into the past.
   */
  async reload() {
    await this.page.goto('/')
  }

  /** One day's section, scoped by the heading its period list is labelled with. */
  day(heading: string): DayScope {
    return new DayScope(
      this.page.locator('section').filter({ has: this.page.getByRole('listbox', { name: heading }) }),
    )
  }

  /** The rendered days' period lists, in order; their labels are the day headings. */
  get days(): Locator {
    return this.page.getByRole('listbox')
  }

  async dayHeadings(): Promise<string[]> {
    return this.days.evaluateAll((lists) =>
      lists.map((list) => list.getAttribute('aria-label') ?? ''),
    )
  }

  /** Scoped to the drawer: the picker is only in the document while the menu is open. */
  schedule(label: string): Locator {
    return this.menu.getByRole('button', { name: label, exact: true })
  }

  get menuButton(): Locator {
    return this.page.getByRole('button', { name: 'Menu' })
  }

  get menu(): Locator {
    return this.page.locator('dialog.menu-drawer')
  }

  async openMenu() {
    await this.menuButton.click()
    await this.menu.waitFor()
  }

  async closeMenu() {
    await this.menu.getByRole('button', { name: 'Close' }).click()
  }

  get calendarButton(): Locator {
    return this.page.getByRole('button', { name: 'Calendar' })
  }

  get noteNowButton(): Locator {
    return this.page.getByRole('button', { name: 'Note now' })
  }

  /** Inside the calendar now — `Go to today` is the notice's own button. */
  get todayButton(): Locator {
    return this.page.getByRole('button', { name: 'Today' })
  }

  /** The header, which sits outside the scroll container and must never move. */
  get header(): Locator {
    return this.page.locator('.app__header')
  }

  /** Comes and goes with the window; the header's buttons never do. */
  get rolloverNotice(): Locator {
    return this.page.getByText(/^Viewing /)
  }

  /** The two arrows: content, not chrome — the first and last children of the scroller. */
  get earlierDaysButton(): Locator {
    return this.page.getByRole('button', { name: 'Earlier days' })
  }

  get laterDaysButton(): Locator {
    return this.page.getByRole('button', { name: 'Later days' })
  }

  /** Lives inside the notice, so it exists only while the view is away from today. */
  get goToTodayButton(): Locator {
    return this.page.getByRole('button', { name: 'Go to today' })
  }

  get error(): Locator {
    return this.page.getByRole('alert')
  }

  get scroller(): Locator {
    return this.page.getByTestId('schedule-scroll')
  }

  /** Only ever one dialog is open at a time — the note editor, the calendar, or the menu. */
  get dialog(): Locator {
    return this.page.getByRole('dialog')
  }

  get editor(): Locator {
    return this.dialog.getByRole('textbox')
  }

  /** The dialog's only button: autosave leaves nothing for Save or Cancel to mean. */
  get done(): Locator {
    return this.dialog.getByRole('button', { name: 'Done' })
  }

  /** Saved HH:MM, Saving… or Not saved — retrying; empty until a first write. */
  get saveStatus(): Locator {
    return this.dialog.getByRole('status')
  }

  /**
   * A toolbar toggle in the editor, by its accessible name. MDXEditor labels these with a `title`
   * that flips once the format is on (`Bold` → `Remove bold`), so callers name the state they mean.
   */
  editorToolbarButton(name: string): Locator {
    return this.dialog.getByLabel(name, { exact: true })
  }

  get month(): Locator {
    return this.dialog.getByRole('heading')
  }

  get previousMonth(): Locator {
    return this.dialog.getByRole('button', { name: 'Previous month' })
  }

  get nextMonth(): Locator {
    return this.dialog.getByRole('button', { name: 'Next month' })
  }

  /**
   * Grid cells by day number. A grid shows whole weeks, so a number outside the month can repeat
   * one inside it — callers pick `.first()`/`.last()` where that is so.
   */
  gridDay(dayOfMonth: number): Locator {
    return this.dialog.getByRole('button', { name: new RegExp(`^${dayOfMonth}(,|$)`) })
  }

  /** The grid cell the clock is on. */
  get gridToday(): Locator {
    return this.dialog.locator('[aria-current="date"]')
  }

  /** Every cell of the month grid, in order. */
  get gridCells(): Locator {
    return this.dialog.locator('.month-grid__day')
  }

  /** The days shown from a neighbouring month — dimmed, but still pickable. */
  get gridOutsideCells(): Locator {
    return this.dialog.locator('.month-grid__day[data-outside]')
  }

  /** The weekday headings, which are `aria-hidden` and so have no accessible name. */
  async weekdays(): Promise<string[]> {
    return this.dialog
      .locator('.month-grid__weekday')
      .evaluateAll((cells) => cells.map((cell) => cell.textContent?.trim() ?? ''))
  }

  /** Whether the open dialog is modal in the browser's own terms, not merely visible. */
  async isDialogModal(): Promise<boolean> {
    return this.dialog.evaluate((dialog) => dialog.matches(':modal'))
  }

  /** Where focus sits, as a selector-ish description — enough to say "inside the dialog". */
  async isFocusInsideDialog(): Promise<boolean> {
    return this.dialog.evaluate((dialog) => dialog.contains(document.activeElement))
  }
}

/** Everything inside one rendered day. Row counts are per day, never per page. */
export class DayScope {
  readonly root: Locator

  constructor(root: Locator) {
    this.root = root
  }

  get rows(): Locator {
    return this.root.getByRole('option')
  }

  /** The fixed-height column the rows divide between them. */
  get periodList(): Locator {
    return this.root.getByRole('listbox')
  }

  row(label: string): Locator {
    return this.root.getByRole('option', { name: label })
  }

  get selectedRow(): Locator {
    return this.root.getByRole('option', { selected: true })
  }

  get currentRow(): Locator {
    return this.root.locator('[aria-current="time"]')
  }

  get noteButton(): Locator {
    return this.root.getByRole('button', { name: 'Note', exact: true })
  }

  /** A period's note reads as text, not as a control: there is only ever one way into a row. */
  noteText(excerpt: string | RegExp): Locator {
    return this.root.locator('.period-row__note').filter({ hasText: excerpt })
  }

  /** The `Loading notes…` marker in the day heading. */
  get status(): Locator {
    return this.root.getByRole('status')
  }

  /** The gutter times, in DOM order. */
  async startTimes(): Promise<string[]> {
    return this.root
      .locator('.period-row__time')
      .evaluateAll((times) => times.map((time) => time.textContent?.trim() ?? ''))
  }
}
