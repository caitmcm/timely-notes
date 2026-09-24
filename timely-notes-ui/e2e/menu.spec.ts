import { expect, test } from './fixtures/app'

const FOCUS = '25/08/2026'

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('opens a modal drawer that takes focus, and hands it back to Menu on Escape', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.menuButton.click()

  await expect(scheduleView.menu).toBeVisible()
  expect(await scheduleView.isDialogModal()).toBe(true)
  expect(await scheduleView.isFocusInsideDialog()).toBe(true)

  // Modal in the browser's own terms: a click aimed at the day behind never reaches it.
  await expect(
    scheduleView.day(FOCUS).row('06:00 – 09:00').click({ timeout: 250 }),
  ).rejects.toThrow(/intercepts pointer events/)

  await page.keyboard.press('Escape')

  await expect(scheduleView.menu).toHaveCount(0)
  await expect(scheduleView.menuButton).toBeFocused()
  await expect(scheduleView.menuButton).toHaveAttribute('aria-expanded', 'false')
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

test('closes on a press outside the drawer', async ({ page, scheduleView }) => {
  await scheduleView.openMenu()

  // Far to the right of an 18rem drawer: the backdrop, not the schedule behind it.
  await page.mouse.click(900, 400)

  await expect(scheduleView.menu).toHaveCount(0)
  await expect(scheduleView.menuButton).toBeFocused()
})
