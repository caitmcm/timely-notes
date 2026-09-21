import { expect, test } from './fixtures/app'

const FOCUS = '25/08/2026'
const NEXT = '26/08/2026'
const FOUR_HOURS = 4 * 60 * 60 * 1000

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('selects the period holding the current time, and only it holds Note', async ({
  page,
  scheduleView,
}) => {
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
  await expect(page.getByRole('button', { name: 'Note', exact: true })).toHaveCount(1)
  await expect(scheduleView.day(FOCUS).row('18:00 – 21:00').getByRole('button', { name: 'Note' })).toBeVisible()
})

test('moves the selection and the Note button on a click, opening nothing', async ({
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)
  await day.row('06:00 – 09:00').click()

  await expect(day.selectedRow).toHaveAttribute('aria-label', '06:00 – 09:00')
  await expect(day.row('06:00 – 09:00').getByRole('button', { name: 'Note' })).toBeVisible()
  await expect(scheduleView.dialog).toHaveCount(0)
})

test('leaves the current-period marker where it is when the selection moves', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).row('06:00 – 09:00').click()

  await expect(scheduleView.day(FOCUS).currentRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

test('carries the selection onto another day — it is page-wide, not per day', async ({
  scheduleView,
}) => {
  await scheduleView.day(NEXT).row('12:00 – 15:00').click()

  await expect(scheduleView.day(NEXT).selectedRow).toHaveAttribute('aria-label', '12:00 – 15:00')
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveCount(0)
})

// The defect this closes: a filled row used to carry its own way in, addressing a different slot.
test('offers no way into a row that is not selected, filled or empty', async ({ scheduleView }) => {
  const filled = scheduleView.day(FOCUS).row('09:00 – 12:00')

  await expect(filled).toContainText('Morning block')
  await expect(filled.getByRole('button')).toHaveCount(0)
  await expect(scheduleView.day(FOCUS).row('00:00 – 03:00').getByRole('button')).toHaveCount(0)
})

test('opens the selected period’s own note, not an empty editor', async ({ scheduleView }) => {
  await scheduleView.day(FOCUS).row('09:00 – 12:00').click()
  await scheduleView.day(FOCUS).noteButton.click()

  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('09:00 – 12:00')
  await expect(scheduleView.editor).toContainText('Morning block: drafted the TDD plan.')
  await expect(scheduleView.day(FOCUS).noteText('Morning block')).toHaveCount(1)
})

test('opens the dialog from Note without changing the selection', async ({ scheduleView }) => {
  await scheduleView.day(FOCUS).noteButton.click()

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

test('selects a focused row on Enter', async ({ scheduleView }) => {
  const row = scheduleView.day(FOCUS).row('03:00 – 06:00')
  await row.focus()
  await row.press('Enter')

  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '03:00 – 06:00')
})

test('selects a focused row on Space without scrolling the page', async ({ page, scheduleView }) => {
  const row = scheduleView.day(FOCUS).row('03:00 – 06:00')
  await row.focus()
  const before = await page.evaluate(() => window.scrollY)
  await row.press(' ')

  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '03:00 – 06:00')
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
})

test('opens rather than re-selects when Enter lands on the row’s button', async ({
  scheduleView,
}) => {
  const open = scheduleView.day(FOCUS).noteButton
  await open.focus()
  await open.press('Enter')

  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('18:00 – 21:00')
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

test('rolls an untouched view over at midnight, asking only for the day it gained', async ({
  api,
  page,
  scheduleView,
}) => {
  await expect(scheduleView.day(FOCUS).selectedRow).toBeVisible()
  expect(api.notesWindows).toHaveLength(1)

  await page.clock.fastForward(FOUR_HOURS)

  await expect
    .poll(async () => await scheduleView.dayHeadings())
    .toEqual([FOCUS, NEXT, '27/08/2026'])
  await expect(scheduleView.day(NEXT).selectedRow).toHaveAttribute('aria-label', '00:00 – 03:00')
  await expect(scheduleView.rolloverNotice).toHaveCount(0)

  expect(api.notesWindows).toEqual([
    's3 2026-08-24 2026-08-27',
    's3 2026-08-27 2026-08-28',
  ])
})

// The press committed the selection, not the window: the window was never following the selection.
test('carries the window over midnight while the selected row stays behind', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).row('06:00 – 09:00').click()

  await page.clock.fastForward(FOUR_HOURS)

  await expect
    .poll(async () => await scheduleView.dayHeadings())
    .toEqual([FOCUS, NEXT, '27/08/2026'])
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '06:00 – 09:00')
  // The marker follows the clock onto the day it is now on; the selection stays where it was put.
  await expect(scheduleView.day(NEXT).currentRow).toHaveAttribute('aria-label', '00:00 – 03:00')
  await expect(scheduleView.rolloverNotice).toHaveCount(0)
})

// The bug this feature closes: a press on a neighbouring day rebuilt the column under the reader.
test('redraws nothing when a period on a neighbouring day is selected', async ({
  scheduleView,
}) => {
  const before = await scheduleView.dayHeadings()
  const row = scheduleView.day(NEXT).row('12:00 – 15:00')
  // Scrolled to first, so what is measured afterwards is the app moving the view and not the
  // browser bringing the newly focused row into it.
  await row.scrollIntoViewIfNeeded()
  const scrollTop = await scheduleView.scroller.evaluate((element) => element.scrollTop)

  await row.click()

  await expect(scheduleView.day(NEXT).selectedRow).toHaveAttribute('aria-label', '12:00 – 15:00')
  expect(await scheduleView.dayHeadings()).toEqual(before)
  expect(await scheduleView.scroller.evaluate((element) => element.scrollTop)).toBe(scrollTop)
})

test('keeps an open dialog open across midnight, on its own period', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).noteButton.click()
  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('18:00 – 21:00')

  await page.clock.fastForward(FOUR_HOURS)

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('18:00 – 21:00')
})
