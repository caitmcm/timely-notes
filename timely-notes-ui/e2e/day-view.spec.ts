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

test('places notes by occursAt, though they were written on another day', async ({
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)

  await expect(day.row('09:00 – 12:00').getByRole('button')).toHaveCount(2)
  await expect(day.note('15:00 Afternoon block: wired up FastEndpoints.')).toBeVisible()
})

test('places a note on the day it occurs on, not the focus day', async ({ scheduleView }) => {
  await expect(scheduleView.day('26/08/2026').note('09:00 Tomorrow: review the schedule.')).toBeVisible()
  await expect(scheduleView.day(FOCUS).note('09:00 Tomorrow: review the schedule.')).toHaveCount(0)
})

test('lists two notes in one period oldest first', async ({ scheduleView }) => {
  const notes = scheduleView.day(FOCUS).row('09:00 – 12:00').getByRole('button')

  await expect(notes).toHaveText([/^09:00 Morning block/, /^10:30 Second thoughts/])
})

test('labels a note with its time and a one-line excerpt', async ({ scheduleView }) => {
  await expect(scheduleView.day(FOCUS).note('19:30 Stand-up')).toBeVisible()
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
  await expect(scheduleView.day(FOCUS).note('19:30 Stand-up')).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
})

test('shows the error alert and still renders the rows', async ({ api, scheduleView }) => {
  api.failWith(500)
  await scheduleView.open()

  await expect(scheduleView.error).toBeVisible()
  await expect(scheduleView.day(FOCUS).rows).toHaveCount(8)
})
