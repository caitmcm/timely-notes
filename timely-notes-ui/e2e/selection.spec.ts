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

test('opens a note in an unselected row without moving the selection', async ({ scheduleView }) => {
  await scheduleView.day(FOCUS).note('09:00 Morning block: drafted the TDD plan.').click()

  await expect(scheduleView.dialog.getByRole('heading')).toHaveText('09:00 – 12:00')
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
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

test('does not re-select the row when Enter lands on a button inside it', async ({
  scheduleView,
}) => {
  const note = scheduleView.day(FOCUS).note('09:00 Morning block: drafted the TDD plan.')
  await note.focus()
  await note.press('Enter')

  await expect(scheduleView.dialog.getByRole('heading')).toHaveText('09:00 – 12:00')
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
    's3 2026-08-24T00:00:00+01:00 2026-08-27T00:00:00+01:00',
    's3 2026-08-27T00:00:00+01:00 2026-08-28T00:00:00+01:00',
  ])
})

test('leaves a committed view where it is at midnight, and says what day it now is', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).row('06:00 – 09:00').click()

  await page.clock.fastForward(FOUR_HOURS)

  await expect(scheduleView.rolloverNotice).toHaveText(`It is now ${NEXT}.`)
  expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', FOCUS, NEXT])
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '06:00 – 09:00')
  // The marker follows the clock onto a day still on show; the selection stays behind.
  await expect(scheduleView.day(NEXT).currentRow).toHaveAttribute('aria-label', '00:00 – 03:00')

  await scheduleView.goToTodayButton.click()
  expect(await scheduleView.dayHeadings()).toEqual([FOCUS, NEXT, '27/08/2026'])
  await expect(scheduleView.rolloverNotice).toHaveCount(0)
})

test('keeps an open dialog open across midnight, on its own period', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).noteButton.click()
  await expect(scheduleView.dialog.getByRole('heading')).toHaveText('18:00 – 21:00')

  await page.clock.fastForward(FOUR_HOURS)

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.dialog.getByRole('heading')).toHaveText('18:00 – 21:00')
})
