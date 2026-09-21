import { expect, test } from './fixtures/app'

/**
 * The window, and the two arrows that page it. The clock is frozen at 20:20 on 25/08/2026, so the
 * window starts on 24–26 and each step is a whole three days.
 */

const START = ['24/08/2026', '25/08/2026', '26/08/2026']
const LATER = ['27/08/2026', '28/08/2026', '29/08/2026']
const EARLIER = ['21/08/2026', '22/08/2026', '23/08/2026']

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('puts an arrow at either end of the scroller, inside it rather than in the header', async ({
  scheduleView,
}) => {
  await expect(scheduleView.scroller.getByRole('button', { name: 'Earlier days' })).toBeVisible()
  await expect(scheduleView.scroller.getByRole('button', { name: 'Later days' })).toHaveCount(1)
  await expect(scheduleView.header.getByRole('button')).toHaveCount(3)
})

// The gesture the feature is for: read to the end of the last day, then carry on.
test('steps a whole window on from the end of the last day, without repeating or skipping', async ({
  scheduleView,
}) => {
  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await scheduleView.laterDaysButton.click()

  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(LATER)
})

test('comes back to the three it started on', async ({ scheduleView }) => {
  await scheduleView.laterDaysButton.click()
  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(LATER)

  await scheduleView.earlierDaysButton.click()
  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(START)

  await scheduleView.earlierDaysButton.click()
  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(EARLIER)
})

test('leaves the selection where it was put, and finds it again on the way back', async ({
  scheduleView,
}) => {
  await scheduleView.day('25/08/2026').row('06:00 – 09:00').click()

  await scheduleView.laterDaysButton.click()
  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(LATER)
  await expect(scheduleView.days.first().getByRole('option', { selected: true })).toHaveCount(0)

  await scheduleView.earlierDaysButton.click()

  await expect(scheduleView.day('25/08/2026').selectedRow).toHaveAttribute(
    'aria-label',
    '06:00 – 09:00',
  )
})

test('says what is being viewed once today has been stepped off screen', async ({
  scheduleView,
}) => {
  await expect(scheduleView.rolloverNotice).toHaveCount(0)

  await scheduleView.laterDaysButton.click()
  await expect(scheduleView.rolloverNotice).toContainText('Viewing 27/08/2026 – 29/08/2026.')

  await scheduleView.laterDaysButton.click()
  await expect(scheduleView.rolloverNotice).toContainText('Viewing 30/08/2026 – 01/09/2026.')

  await scheduleView.goToTodayButton.click()

  await expect(scheduleView.rolloverNotice).toHaveCount(0)
  expect(await scheduleView.dayHeadings()).toEqual(START)
})

test('brings the reader to the day adjacent to the one they left, in either direction', async ({
  scheduleView,
}) => {
  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await scheduleView.laterDaysButton.click()
  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(LATER)

  // Forwards: the first of the new three, at the top of the scroller.
  await expect(scheduleView.day('27/08/2026').periodList).toBeInViewport()

  await scheduleView.earlierDaysButton.click()
  await expect.poll(async () => await scheduleView.dayHeadings()).toEqual(START)

  // Backwards: the last of the new three, at the end of the scroller.
  await expect(scheduleView.day('26/08/2026').periodList).toBeInViewport()
})
