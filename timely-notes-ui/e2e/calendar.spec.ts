import { expect, test } from './fixtures/app'

const FOCUS = '25/08/2026'

/** August 2026 runs Sat 1 to Mon 31, so its grid is six whole weeks: Mon 27/07 to Sun 06/09. */
const AUGUST_GRID = 's3 2026-07-27 2026-09-07'
const JULY_GRID = 's3 2026-06-29 2026-08-03'

/** Far enough from the frozen day that its three-day window shares nothing with the cached one. */
const JUMP_WINDOW = 's3 2026-08-16 2026-08-19'
const MOUNT_WINDOW = 's3 2026-08-24 2026-08-27'

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('keeps the navigation toolbar outside the scroll and still in place at either end', async ({
  scheduleView,
}) => {
  await expect(scheduleView.toolbar.getByRole('button')).toHaveText(['Calendar', 'Go to today'])
  await expect(scheduleView.scroller.getByRole('toolbar')).toHaveCount(0)

  const before = await scheduleView.toolbar.boundingBox()

  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(scheduleView.calendarButton).toBeVisible()
  await expect(scheduleView.goToTodayButton).toBeVisible()

  expect(await scheduleView.toolbar.boundingBox()).toEqual(before)
})

test('scrolls to either end without gaining a day or asking for one', async ({
  api,
  scheduleView,
}) => {
  const height = await scheduleView.scroller.evaluate((element) => element.scrollHeight)

  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, 0))

  await expect(scheduleView.days).toHaveCount(3)
  expect(await scheduleView.scroller.evaluate((element) => element.scrollHeight)).toBe(height)
  expect(api.notesWindows).toEqual([MOUNT_WINDOW])
})

test('opens a modal month grid headed with the focus day’s month', async ({ scheduleView }) => {
  await scheduleView.calendarButton.click()

  await expect(scheduleView.month).toHaveText('August 2026')
  expect(await scheduleView.isDialogModal()).toBe(true)
  expect(await scheduleView.isFocusInsideDialog()).toBe(true)

  // Modal in the browser's own terms: a click aimed at the day behind never reaches it.
  await expect(
    scheduleView.day(FOCUS).row('06:00 – 09:00').click({ timeout: 2000 }),
  ).rejects.toThrow(/intercepts pointer events/)

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

test('lays the month out as Monday-first whole weeks, the days outside it dimmed but pickable', async ({
  scheduleView,
}) => {
  await scheduleView.calendarButton.click()

  expect(await scheduleView.weekdays()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  await expect(scheduleView.gridCells).toHaveCount(42)

  // 27–31 July and 1–6 September.
  await expect(scheduleView.gridOutsideCells).toHaveCount(11)
  for (const cell of await scheduleView.gridOutsideCells.all()) {
    await expect(cell).toBeEnabled()
  }

  await expect(scheduleView.gridToday).toHaveAttribute('aria-label', /^25/)
})

test('asks for the counts once per grid, and not at all before it is opened', async ({
  api,
  scheduleView,
}) => {
  expect(api.noteDayRequests).toHaveLength(0)

  await scheduleView.calendarButton.click()
  await expect(scheduleView.month).toHaveText('August 2026')

  await expect.poll(() => api.noteDayWindows).toEqual([AUGUST_GRID])
  expect(api.noteDayRequests[0].pathname).toBe('/api/schedules/s3/note-days')
})

test('marks the seeded days, and only those', async ({ scheduleView }) => {
  await scheduleView.calendarButton.click()

  await expect(scheduleView.gridDay(17)).toHaveAttribute('aria-label', '17, 2 notes')
  await expect(scheduleView.gridDay(25)).toHaveAttribute('aria-label', '25, 3 notes')
  await expect(scheduleView.gridDay(26)).toHaveAttribute('aria-label', '26, 1 note')

  await expect(scheduleView.gridDay(24)).toHaveAttribute('aria-label', '24')
  await expect(scheduleView.gridDay(24).locator('.month-grid__marker')).toHaveCount(0)
})

test('asks for a month it has not shown before, and never twice', async ({
  api,
  scheduleView,
}) => {
  await scheduleView.calendarButton.click()
  await expect.poll(() => api.noteDayWindows).toEqual([AUGUST_GRID])

  await scheduleView.previousMonth.click()
  await expect(scheduleView.month).toHaveText('July 2026')
  await expect.poll(() => api.noteDayWindows).toEqual([AUGUST_GRID, JULY_GRID])
  await expect(scheduleView.gridDay(15)).toHaveAttribute('aria-label', '15, 1 note')

  await scheduleView.nextMonth.click()
  await expect(scheduleView.month).toHaveText('August 2026')
  expect(api.noteDayWindows).toEqual([AUGUST_GRID, JULY_GRID])
})

test('re-points the view at a day picked from the grid, in one request', async ({
  api,
  scheduleView,
}) => {
  await scheduleView.calendarButton.click()
  await scheduleView.gridDay(17).click()

  await expect(scheduleView.dialog).toHaveCount(0)
  await expect
    .poll(async () => await scheduleView.dayHeadings())
    .toEqual(['16/08/2026', '17/08/2026', '18/08/2026'])

  const day = scheduleView.day('17/08/2026')
  await expect(day.noteText('Jump target: the week before.')).toBeVisible()
  await expect(day.noteText('Jump target: a second note.')).toBeVisible()
  await expect(day.selectedRow).toHaveAttribute('aria-label', '00:00 – 03:00')

  expect(api.notesWindows).toEqual([MOUNT_WINDOW, JUMP_WINDOW])
})

test('raises the rollover notice on a jump, and drops it on Go to today', async ({
  scheduleView,
}) => {
  await scheduleView.calendarButton.click()
  await scheduleView.gridDay(17).click()

  await expect(scheduleView.rolloverNotice).toHaveText(`It is now ${FOCUS}.`)

  await scheduleView.goToTodayButton.click()

  expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', FOCUS, '26/08/2026'])
  await expect(scheduleView.rolloverNotice).toHaveCount(0)
})

test('treats picking the current day as Go to today, selection and all', async ({
  scheduleView,
}) => {
  await scheduleView.calendarButton.click()
  await scheduleView.gridDay(17).click()
  await expect(scheduleView.day('17/08/2026').selectedRow).toBeVisible()

  await scheduleView.calendarButton.click()
  await scheduleView.gridDay(25).click()

  expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', FOCUS, '26/08/2026'])
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
  await expect(scheduleView.rolloverNotice).toHaveCount(0)
})

test('closes the calendar on Escape, leaving the view where it was', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.calendarButton.click()
  await expect(scheduleView.month).toHaveText('August 2026')

  await page.keyboard.press('Escape')

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', FOCUS, '26/08/2026'])
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})
