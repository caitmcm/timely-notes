import { expect, test } from './fixtures/app'

/** The clock is frozen at 20:20 on 25/08/2026, so the window starts on 24–26. */
const START = ['24/08/2026', '25/08/2026', '26/08/2026']
const LATER = ['27/08/2026', '28/08/2026', '29/08/2026']

test('brings the reader to the day adjacent to the one they left, in either direction', async ({
  scheduleView,
}) => {
  await scheduleView.open()
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
