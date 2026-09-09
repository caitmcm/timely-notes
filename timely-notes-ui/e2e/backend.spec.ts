import { expect, integratedTest as test } from './fixtures/app'

/**
 * The real API through the real Vite proxy — nothing stubbed. Small on purpose: only the
 * assertions that are *about* the two projects agreeing.
 *
 * The seed is anchored to the API process's `DateTime.Today`, so the clock is frozen at a fixed
 * time of day on *today's* date and never fast-forwarded across midnight — a rollover would land
 * on a day whose notes exist only because the seed happens to span ± 3 days.
 */

const NOTES_ROUTE = /\/api\/schedules\/\w+\/notes\?/
const NOTE_DAYS_ROUTE = /\/api\/schedules\/\w+\/note-days\?/
/** A write, which is addressed by the period rather than by a query. */
const WRITE_ROUTE = /\/api\/schedules\/\w+\/notes\/[\d-]+\/p\d+$/

/** `formatDayHeading`'s `dd/mm/yyyy`, for the day the seed and the frozen clock share. */
const headingFor = (at: Date) =>
  `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')}/${at.getFullYear()}`

test.describe('@integrated', () => {
  test('loads against the real API with nothing broken on either side', async ({
    page,
    scheduleView,
  }) => {
    const problems: string[] = []
    page.on('console', (message) => message.type() === 'error' && problems.push(message.text()))
    page.on('pageerror', (error) => problems.push(error.message))

    const notes = page.waitForResponse((response) => NOTES_ROUTE.test(response.url()))
    await scheduleView.open()

    // 200, not the 400 `GetNotesByScheduleValidator` answers when the window format disagrees.
    expect((await notes).status()).toBe(200)
    await expect(scheduleView.error).toHaveCount(0)
    expect(problems).toEqual([])
  })

  test('renders each schedule’s seeded notes in their own periods', async ({
    frozenAt,
    scheduleView,
  }) => {
    await scheduleView.open()
    const day = scheduleView.day(headingFor(frozenAt))

    await expect(day.row('09:00 – 12:00')).toContainText('Morning block: drafted the TDD plan.')
    await expect(day.row('15:00 – 18:00')).toContainText(
      'Afternoon block: wired up FastEndpoints.',
    )

    await scheduleView.schedule('1h').click()
    await expect(day.row('09:00 – 10:00')).toContainText('Stand-up')
    await expect(day.row('14:00 – 15:00')).toContainText('Afternoon')

    await scheduleView.schedule('6h').click()
    await expect(day.row('06:00 – 12:00')).toContainText('First half of the day, in one go.')
    await expect(day.row('18:00 – 00:00')).toContainText('Evening wrap-up: slice one is close.')
  })

  test('opens a seeded note with its content in the editor', async ({
    frozenAt,
    scheduleView,
  }) => {
    await scheduleView.open()

    const day = scheduleView.day(headingFor(frozenAt))
    await day.row('09:00 – 12:00').click()
    await day.noteButton.click()

    await expect(scheduleView.editor).toContainText('Morning block: drafted the TDD plan.')
  })

  /**
   * The only integrated cover for the counts route, and it earns its place: how a day is spelled on
   * the wire is exactly what the two projects can silently disagree about. The seed moves with the API
   * process's own `DateTime.Today` and the grid's edges move with the month, so this asserts that
   * *some* day is marked and that today is one — never an exact set.
   */
  test('marks the seeded days in the calendar', async ({ frozenAt, page, scheduleView }) => {
    await scheduleView.open()

    const counts = page.waitForResponse((response) => NOTE_DAYS_ROUTE.test(response.url()))
    await scheduleView.calendarButton.click()

    expect((await counts).status()).toBe(200)

    await expect(scheduleView.gridToday).toHaveAttribute(
      'aria-label',
      new RegExp(`^${frozenAt.getDate()}, \\d+ notes?$`),
    )
    expect(await scheduleView.dialog.locator('.month-grid__marker').count()).toBeGreaterThan(0)
  })

  /**
   * The two projects agreeing about a *write*: the address the client builds is one the server
   * accepts, and what comes back reads on the row the user pressed. A period the seed leaves empty,
   * so a rerun against a still-running API starts from nothing either way — and the note is deleted
   * again at the end, which is the second half of what is being asserted.
   */
  test('writes a real note through the real API, reads it back, and deletes it', async ({
    frozenAt,
    page,
    scheduleView,
  }) => {
    await scheduleView.open()

    const day = scheduleView.day(headingFor(frozenAt))
    await day.row('21:00 – 00:00').click()
    await day.noteButton.click()

    const written = page.waitForResponse(
      (response) => WRITE_ROUTE.test(response.url()) && response.request().method() === 'PUT',
    )
    await scheduleView.editor.click()
    await scheduleView.editor.pressSequentially('Written against the real API.')
    await page.clock.runFor(2_500)

    expect([200, 201]).toContain((await written).status())
    await expect(scheduleView.saveStatus).toHaveText(/^Saved /)

    await scheduleView.done.click()
    await expect(day.row('21:00 – 00:00')).toContainText('Written against the real API.')

    // And back out again: clearing it writes it empty, and closing deletes the record.
    await day.noteButton.click()
    const deleted = page.waitForResponse(
      (response) => WRITE_ROUTE.test(response.url()) && response.request().method() === 'DELETE',
    )
    await scheduleView.editor.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.clock.runFor(2_500)
    await scheduleView.done.click()

    expect((await deleted).status()).toBe(204)
    await expect(day.row('21:00 – 00:00')).not.toContainText('Written against the real API.')
  })
})