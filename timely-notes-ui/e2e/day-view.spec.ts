import { expect, test } from './fixtures/app'

/** Row assertions are scoped to a day: the same slot exists on all three. */
const FOCUS = '25/08/2026'

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('lands on the app', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Timely Notes' })).toBeVisible()
})

test('renders the focus day and its two neighbours, in order', async ({ scheduleView }) => {
  await expect(scheduleView.days).toHaveCount(3)
  expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', FOCUS, '26/08/2026'])
  await expect(scheduleView.day(FOCUS).root).toBeVisible()
})

test('divides every day into eight rows at 3h, the focus day reading 00:00 to 21:00', async ({
  scheduleView,
}) => {
  for (const heading of ['24/08/2026', FOCUS, '26/08/2026']) {
    await expect(scheduleView.day(heading).rows).toHaveCount(8)
  }

  expect(await scheduleView.day(FOCUS).startTimes()).toEqual([
    '00:00',
    '03:00',
    '06:00',
    '09:00',
    '12:00',
    '15:00',
    '18:00',
    '21:00',
  ])
})

test('marks exactly one row as current, on the focus day', async ({ page, scheduleView }) => {
  await expect(page.locator('[aria-current="time"]')).toHaveCount(1)
  await expect(scheduleView.day(FOCUS).currentRow).toHaveAttribute(
    'aria-label',
    '18:00 – 21:00',
  )
  await expect(scheduleView.day('24/08/2026').currentRow).toHaveCount(0)
  await expect(scheduleView.day('26/08/2026').currentRow).toHaveCount(0)
})

test('places a note by its period, though it was written on another day', async ({
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)

  await expect(day.row('09:00 – 12:00')).toContainText('Morning block: drafted the TDD plan.')
  await expect(day.row('15:00 – 18:00')).toContainText('Afternoon block: wired up FastEndpoints.')
})

test('places a note on the day it is addressed to, not the focus day', async ({ scheduleView }) => {
  await expect(scheduleView.day('26/08/2026').noteText('Tomorrow: review the schedule.')).toBeVisible()
  await expect(scheduleView.day(FOCUS).noteText('Tomorrow: review the schedule.')).toHaveCount(0)
})

test('holds one entry in a filled row, as text, with no time of day and nothing to press', async ({
  scheduleView,
}) => {
  const row = scheduleView.day(FOCUS).row('09:00 – 12:00')

  await expect(scheduleView.day(FOCUS).noteText('Morning block')).toHaveCount(1)
  await expect(row.getByRole('button')).toHaveCount(0)
  await expect(row).not.toContainText(/d{2}:d{2}s+Morning block/)
})

test('shows a one-line excerpt of markdown content', async ({ scheduleView }) => {
  await expect(scheduleView.day(FOCUS).noteText('Stand-up')).toBeVisible()
})

test('puts nothing note-shaped in an empty period', async ({ scheduleView }) => {
  await expect(scheduleView.day(FOCUS).row('00:00 – 03:00').getByRole('button')).toHaveCount(0)
})

test('shows the loading marker in each day while the reply is in flight', async ({
  api,
  page,
  scheduleView,
}) => {
  api.delayBy(1500)
  await scheduleView.open()

  await expect(page.getByRole('status')).toHaveCount(3)
  await expect(scheduleView.day(FOCUS).noteText('Stand-up')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('shows the error alert and still renders the rows', async ({ api, scheduleView }) => {
  api.failWith(500)
  await scheduleView.open()

  await expect(scheduleView.error).toBeVisible()
  await expect(scheduleView.day(FOCUS).rows).toHaveCount(8)
})
