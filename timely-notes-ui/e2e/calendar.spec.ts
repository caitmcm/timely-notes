import { expect, test } from './fixtures/app'

const FOCUS = '25/08/2026'

test('opens the month grid as a modal, and closes it on Escape with the view unmoved', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.open()
  await scheduleView.calendarButton.click()

  await expect(scheduleView.month).toHaveText('August 2026')
  expect(await scheduleView.isDialogModal()).toBe(true)
  expect(await scheduleView.isFocusInsideDialog()).toBe(true)

  // Modal in the browser's own terms: a click aimed at the day behind never reaches it.
  await expect(
    scheduleView.day(FOCUS).row('06:00 – 09:00').click({ timeout: 250 }),
  ).rejects.toThrow(/intercepts pointer events/)

  await page.keyboard.press('Escape')

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', FOCUS, '26/08/2026'])
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})
