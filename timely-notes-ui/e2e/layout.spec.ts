import { expect, test } from './fixtures/app'
import type { Locator } from '@playwright/test'

/**
 * None of this is reachable in jsdom, where every box is 0×0 and `scrollIntoView` is a no-op, so
 * none of it is derived from a unit test. Heights are read from the real layout and compared to
 * each other — never to a literal, which would only restate `App.css`.
 */

const FOCUS = '25/08/2026'
const TOLERANCE = 1

const heightOf = async (locator: Locator) => (await locator.boundingBox())!.height

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('fits all 24 rows of a day inside that day’s period list at 1h', async ({ scheduleView }) => {
  await scheduleView.schedule('1h').click()

  const day = scheduleView.day(FOCUS)
  await expect(day.rows).toHaveCount(24)

  const list = (await day.periodList.boundingBox())!
  const rows = await day.rows.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()

      return { top: box.top, bottom: box.bottom }
    }),
  )

  for (const row of rows) {
    expect(row.top).toBeGreaterThanOrEqual(list.y - TOLERANCE)
    expect(row.bottom).toBeLessThanOrEqual(list.y + list.height + TOLERANCE)
  }
})

test('makes a 6h row six times a 1h row, over a day of unchanging height', async ({
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)

  // The second row, not the first: `.period-row:first-child` drops its top border, so only the
  // rows that carry one are comparable across two different row counts.
  await scheduleView.schedule('1h').click()
  await expect(day.rows).toHaveCount(24)
  const hourly = await heightOf(day.rows.nth(1))
  const hourlyDay = await heightOf(day.periodList)

  await scheduleView.schedule('6h').click()
  await expect(day.rows).toHaveCount(4)
  const sixHourly = await heightOf(day.rows.nth(1))
  const sixHourlyDay = await heightOf(day.periodList)

  expect(sixHourly).toBeCloseTo(hourly * 6, 0)
  expect(sixHourlyDay).toBeCloseTo(hourlyDay, 0)
})

test('holds the navigation toolbar still while the days scroll beneath it', async ({
  scheduleView,
}) => {
  const before = await scheduleView.toolbar.boundingBox()

  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))

  expect(await scheduleView.scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await scheduleView.toolbar.boundingBox()).toEqual(before)
})

test('distinguishes the selected row by more than colour', async ({ scheduleView }) => {
  const day = scheduleView.day(FOCUS)
  const selected = day.row('18:00 – 21:00')
  const other = day.row('06:00 – 09:00')

  await expect(selected).toHaveAttribute('aria-selected', 'true')
  await expect(other).toHaveAttribute('aria-selected', 'false')

  // The Note button is the cue that survives a screen with no colour at all.
  await expect(selected.getByRole('button', { name: 'Note', exact: true })).toBeVisible()
  await expect(other.getByRole('button', { name: 'Note', exact: true })).toHaveCount(0)
})

test.describe('on a viewport too short to show the selected row', () => {
  test.use({ viewport: { width: 800, height: 520 } })

  test('scrolls it into the day’s view on load', async ({ scheduleView }) => {
    const row = scheduleView.day(FOCUS).row('18:00 – 21:00')

    // Without `DaySection`'s mount-time scroll this row sits over a thousand pixels down the column.
    await expect(row).toBeInViewport({ ratio: 0.9 })

    const rowBox = (await row.boundingBox())!
    const scroller = (await scheduleView.scroller.boundingBox())!

    expect(rowBox.y).toBeGreaterThanOrEqual(scroller.y - TOLERANCE)
    expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(scroller.y + scroller.height + TOLERANCE)
  })
})
