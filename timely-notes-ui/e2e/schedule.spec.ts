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
  await scheduleView.schedule('6h').click()

  await expect(scheduleView.schedule('6h')).toHaveAttribute('aria-pressed', 'true')
  await expect(scheduleView.schedule('3h')).toHaveAttribute('aria-pressed', 'false')

  for (const heading of DAYS) {
    await expect(scheduleView.day(heading).rows).toHaveCount(4)
  }
  await expect(page.getByRole('option')).toHaveCount(12)

  await scheduleView.schedule('1h').click()

  for (const heading of DAYS) {
    await expect(scheduleView.day(heading).rows).toHaveCount(24)
  }
  await expect(page.getByRole('option')).toHaveCount(72)
})

test('asks for the new short name once, not once per render', async ({ api, scheduleView }) => {
  expect(api.notesWindows).toEqual(['s3 2026-08-24T00:00:00+01:00 2026-08-27T00:00:00+01:00'])

  await scheduleView.schedule('6h').click()
  await expect(scheduleView.day(FOCUS).rows).toHaveCount(4)

  expect(api.notesWindows).toEqual([
    's3 2026-08-24T00:00:00+01:00 2026-08-27T00:00:00+01:00',
    's6 2026-08-24T00:00:00+01:00 2026-08-27T00:00:00+01:00',
  ])
})

test('re-anchors a pinned selection onto the current period of the new schedule', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).row('06:00 – 09:00').click()

  await scheduleView.schedule('1h').click()

  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '20:00 – 21:00')
})

/**
 * The picker cannot be reached while a dialog is open: a modal `<dialog>` swallows the click. This
 * is why `handleScheduleChange` carries no close-the-dialog guard — there is no way to reach it.
 */
test('cannot change schedule while a dialog is open — the picker is behind it', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).noteButton.click()
  await expect(scheduleView.dialog).toBeVisible()

  await expect(scheduleView.schedule('6h').click({ timeout: 2000 })).rejects.toThrow(
    /intercepts pointer events/,
  )

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.schedule('3h')).toHaveAttribute('aria-pressed', 'true')
})

test('brings the new schedule’s own notes with it', async ({ scheduleView }) => {
  await scheduleView.schedule('6h').click()

  await expect(scheduleView.day(FOCUS).note('09:00 Six-hourly: the long block.')).toBeVisible()
  await expect(scheduleView.day(FOCUS).note('19:30 Stand-up')).toHaveCount(0)
})
