import { expect, test } from './fixtures/app'

const FOCUS = '25/08/2026'
const DAYS = ['24/08/2026', FOCUS, '26/08/2026']

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('presses only the schedule chosen, and re-chunks every day', async ({
  page,
  scheduleView,
}) => {
  await scheduleView.openMenu()
  await scheduleView.schedule('6h').click()

  // The press closes the drawer, so reading the pressed state means opening it again.
  await scheduleView.openMenu()
  await expect(scheduleView.schedule('6h')).toHaveAttribute('aria-pressed', 'true')
  await expect(scheduleView.schedule('3h')).toHaveAttribute('aria-pressed', 'false')
  await scheduleView.closeMenu()

  for (const heading of DAYS) {
    await expect(scheduleView.day(heading).rows).toHaveCount(4)
  }
  await expect(page.getByRole('option')).toHaveCount(12)

  await scheduleView.openMenu()
  await scheduleView.schedule('1h').click()

  for (const heading of DAYS) {
    await expect(scheduleView.day(heading).rows).toHaveCount(24)
  }
  await expect(page.getByRole('option')).toHaveCount(72)
})

test('asks for the new short name once, not once per render', async ({ api, scheduleView }) => {
  expect(api.notesWindows).toEqual(['s3 2026-08-24 2026-08-27'])

  await scheduleView.openMenu()
  await scheduleView.schedule('6h').click()
  await expect(scheduleView.day(FOCUS).rows).toHaveCount(4)

  expect(api.notesWindows).toEqual([
    's3 2026-08-24 2026-08-27',
    's6 2026-08-24 2026-08-27',
  ])
})

test('re-anchors a pinned selection onto the current period of the new schedule', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).row('06:00 – 09:00').click()

  await scheduleView.openMenu()
  await scheduleView.schedule('1h').click()

  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '20:00 – 21:00')
})

/**
 * The menu cannot be reached while another dialog is open: a modal `<dialog>` swallows the click.
 * This is why `App` carries no close-the-other-dialog guard — there is no way to reach it.
 */
test('cannot open the menu while a dialog is open — the button is behind it', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).noteButton.click()
  await expect(scheduleView.dialog).toBeVisible()

  await expect(scheduleView.menuButton.click({ timeout: 2000 })).rejects.toThrow(
    /intercepts pointer events/,
  )

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.menu).toHaveCount(0)
  await expect(scheduleView.day(FOCUS).rows).toHaveCount(8)
})

test('brings the new schedule’s own notes with it', async ({ scheduleView }) => {
  await scheduleView.openMenu()
  await scheduleView.schedule('6h').click()

  await expect(scheduleView.day(FOCUS).noteText('Six-hourly: the long block.')).toBeVisible()
  await expect(scheduleView.day(FOCUS).noteText('Stand-up')).toHaveCount(0)
})
