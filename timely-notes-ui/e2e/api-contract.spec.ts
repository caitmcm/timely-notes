import { expect, test } from './fixtures/app'

/**
 * What the browser actually put on the wire. The unit suite asserts these URLs *structurally*
 * because it must pass in any timezone; here the timezone is pinned, so the literal is the
 * assertion — and the block below re-runs it under UTC+12, where the only thing that may differ is
 * which calendar day the viewer is on.
 */

test('asks for a three-day, half-open window of plain dates', async ({ api, scheduleView }) => {
  await scheduleView.open()

  const [request] = api.notesRequests

  expect(request.searchParams.get('searchFrom')).toBe('2026-08-24')
  expect(request.searchParams.get('searchTo')).toBe('2026-08-27')
})

test('leaves nothing in the query needing an escape', async ({ api, scheduleView }) => {
  await scheduleView.open()

  expect(api.notesRequests[0].search).toBe('?searchFrom=2026-08-24&searchTo=2026-08-27')
})

test('addresses the notes route same-origin, under the schedule short name', async ({
  api,
  page,
  scheduleView,
}) => {
  await scheduleView.open()

  const request = api.notesRequests[0]

  expect(request.pathname).toBe('/api/schedules/s3/notes')
  expect(request.origin).toBe(new URL(page.url()).origin)
})

/**
 * West of Greenwich, at an instant that is still the same calendar day there: the request is
 * **identical**, byte for byte, and the same days render. Nothing in it depends on an offset any
 * more, and this is the regression test for a `Date` creeping back into the day path.
 */
test.describe('under UTC−7', () => {
  test.use({ timezoneId: 'America/Los_Angeles' })

  test('asks for exactly the same window as London', async ({ api, scheduleView }) => {
    await scheduleView.open()

    expect(api.notesWindows).toEqual(['s3 2026-08-24 2026-08-27'])
  })

  test('renders the same three days, with the notes on the same rows', async ({ scheduleView }) => {
    await scheduleView.open()

    expect(await scheduleView.dayHeadings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    await expect(scheduleView.day('25/08/2026').row('09:00 – 12:00')).toContainText('Morning block')
    await expect(scheduleView.day('26/08/2026').row('09:00 – 12:00')).toContainText('Tomorrow')
  })
})

test.describe('under UTC+12', () => {
  test.use({ timezoneId: 'Pacific/Auckland' })

  /**
   * The frozen instant is 20:20 on 25/08 in London, which is 07:20 on the 26th in Auckland, so the
   * viewer is on a later calendar day and the window says so. That day is the *only* difference:
   * same route, same parameters, same plain-date form, nothing escaped and no offset anywhere. A
   * `Date` creeping back into the day path is what would break this.
   */
  test('changes only which day it asks for', async ({ api, scheduleView }) => {
    await scheduleView.open()

    const [request] = api.notesRequests

    expect(request.pathname).toBe('/api/schedules/s3/notes')
    expect(request.search).toBe('?searchFrom=2026-08-25&searchTo=2026-08-28')
  })

  test('renders that zone’s own days, with the notes on them', async ({ scheduleView }) => {
    await scheduleView.open()

    expect(await scheduleView.dayHeadings()).toEqual(['25/08/2026', '26/08/2026', '27/08/2026'])
    await expect(scheduleView.day('25/08/2026').noteText('Morning block')).toBeVisible()
    await expect(scheduleView.day('26/08/2026').noteText('Tomorrow: review the schedule.')).toBeVisible()
  })
})

/**
 * The write path, where the address now decides *which note* rather than only which window. The
 * displayed row is the same in both zones, so its URL must be too — byte for byte.
 */
test.describe('the write address', () => {
  const writeInto = async (
    scheduleView: import('./fixtures/ScheduleView').ScheduleView,
    page: import('@playwright/test').Page,
    heading: string,
  ) => {
    const day = scheduleView.day(heading)
    await day.row('09:00 – 12:00').click()
    await day.noteButton.click()
    await scheduleView.editor.click()
    await scheduleView.editor.pressSequentially('Addressed by its period.')
    await page.clock.runFor(2_500)
  }

  test('PUTs to the opened period’s own day and ordinal', async ({ api, page, scheduleView }) => {
    await scheduleView.open()

    await writeInto(scheduleView, page, '25/08/2026')

    await expect.poll(() => api.writes.length).toBe(1)
    expect(new URL(api.writes[0].url).pathname).toBe('/api/schedules/s3/notes/2026-08-25/p4')
  })

  test.describe('under UTC+12', () => {
    test.use({ timezoneId: 'Pacific/Auckland' })

    // The 25th is a rendered day in Auckland too, and it is the *same* note: same URL, no offset.
    test('PUTs to the identical URL for the same displayed row', async ({
      api,
      page,
      scheduleView,
    }) => {
      await scheduleView.open()

      await writeInto(scheduleView, page, '25/08/2026')

      await expect.poll(() => api.writes.length).toBe(1)
      expect(new URL(api.writes[0].url).pathname).toBe('/api/schedules/s3/notes/2026-08-25/p4')
    })
  })
})
