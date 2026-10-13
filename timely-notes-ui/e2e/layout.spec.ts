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

test('fits 24 rows in a day at 1h, and makes a 6h row six of them over the same height', async ({
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)

  await scheduleView.openMenu()
  await scheduleView.schedule('1h').click()
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

  // The second row, not the first: `.period-row:first-child` drops its top border, so only the
  // rows that carry one are comparable across two different row counts.
  const hourly = await heightOf(day.rows.nth(1))
  const hourlyDay = list.height

  await scheduleView.openMenu()
  await scheduleView.schedule('6h').click()
  await expect(day.rows).toHaveCount(4)
  const sixHourly = await heightOf(day.rows.nth(1))
  const sixHourlyDay = await heightOf(day.periodList)

  expect(sixHourly).toBeCloseTo(hourly * 6, 0)
  expect(sixHourlyDay).toBeCloseTo(hourlyDay, 0)
})

test('holds the header still while the days scroll beneath it', async ({ scheduleView }) => {
  const before = await scheduleView.header.boundingBox()

  await scheduleView.scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight))

  expect(await scheduleView.scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await scheduleView.header.boundingBox()).toEqual(before)
})

/** The left border and the padding that reserves room for it, in pixels. */
const gutterOf = (row: Locator) =>
  row.evaluate((element) => {
    const style = getComputedStyle(element)

    return {
      border: Number.parseFloat(style.borderLeftWidth),
      padding: Number.parseFloat(style.paddingLeft),
    }
  })

test('distinguishes the selected row by more than colour', async ({ scheduleView }) => {
  const day = scheduleView.day(FOCUS)
  const selected = day.row('18:00 – 21:00')
  const other = day.row('06:00 – 09:00')

  await expect(selected).toHaveAttribute('aria-selected', 'true')
  await expect(other).toHaveAttribute('aria-selected', 'false')

  await expect(selected.getByRole('button', { name: 'Note', exact: true })).toBeVisible()
  await expect(other.getByRole('button', { name: 'Note', exact: true })).toHaveCount(0)

  // A recoloured border would be colour alone; a wider one is a cue on a monochrome screen too.
  const marked = await gutterOf(selected)
  const unmarked = await gutterOf(other)

  expect(marked.border).toBeGreaterThan(unmarked.border)
  // …and the row's content must not shift as the bar thickens.
  expect(marked.border + marked.padding).toBeCloseTo(unmarked.border + unmarked.padding, 1)
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

/** The vertical middle of a box: the line is a couple of pixels thick, and its middle is the minute. */
const middleOf = async (locator: Locator) => {
  const box = (await locator.boundingBox())!

  return box.y + box.height / 2
}

for (const schedule of ['1h', '3h', '6h']) {
  test(`draws the now line inside the current row at ${schedule}`, async ({ scheduleView }) => {
    const day = scheduleView.day(FOCUS)

    await scheduleView.openMenu()
    await scheduleView.schedule(schedule).click()

    const row = (await day.currentRow.boundingBox())!
    const line = await middleOf(day.nowLine)

    expect(line).toBeGreaterThan(row.y)
    expect(line).toBeLessThan(row.y + row.height)
  })
}

test('moves the now line down by the share of the day that half an hour is', async ({
  page,
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)
  const before = await middleOf(day.nowLine)
  const column = await heightOf(day.periodList)

  await page.clock.runFor(30 * 60_000)

  await expect
    .poll(async () => (await middleOf(day.nowLine)) - before)
    .toBeGreaterThan(0)
  const moved = (await middleOf(day.nowLine)) - before

  expect(Math.abs(moved - (column * 30) / (24 * 60))).toBeLessThan(1.5)
})

/** The gutter time's weight, and the row's background. */
const markOf = (row: Locator) =>
  row.evaluate((element) => ({
    weight: Number(getComputedStyle(element.querySelector('.period-row__time')!).fontWeight),
    background: getComputedStyle(element).backgroundColor,
  }))

test('marks the current row by more than colour, and keeps it marked when another is selected', async ({
  scheduleView,
}) => {
  const day = scheduleView.day(FOCUS)
  const current = day.row('18:00 – 21:00')
  const other = day.row('06:00 – 09:00')
  const plain = day.row('00:00 – 03:00')

  await expect(day.currentRow).toHaveAccessibleName('18:00 – 21:00')
  const selectedBackground = (await markOf(current)).background

  await other.click()
  await expect(other).toHaveAttribute('aria-selected', 'true')

  // Selection moved, and the current row still stands out from a row that is neither.
  await expect(current).toHaveAttribute('aria-current', 'time')
  const marked = await markOf(current)
  const unmarked = await markOf(plain)

  expect(marked.weight).toBeGreaterThan(unmarked.weight)
  expect(marked.background).not.toBe(unmarked.background)
  // …while the selected row keeps the selection's own background, not the now tint.
  expect((await markOf(other)).background).toBe(selectedBackground)
  expect(marked.background).not.toBe(selectedBackground)
  await expect(day.nowLine).toBeVisible()
})
