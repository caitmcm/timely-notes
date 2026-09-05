import { expect, test } from './fixtures/app'

/**
 * What the browser actually put on the wire. The unit suite asserts these URLs *structurally*
 * because it must pass in any timezone; here the timezone is pinned, so the literal is the
 * assertion — and one block below re-runs it under UTC+12 to keep the offset logic honest.
 */

test('asks for a three-day, half-open window around the frozen day', async ({
  api,
  scheduleView,
}) => {
  await scheduleView.open()

  const [request] = api.notesRequests

  expect(request.searchParams.get('searchFrom')).toBe('2026-08-24T00:00:00+01:00')
  expect(request.searchParams.get('searchTo')).toBe('2026-08-27T00:00:00+01:00')
})

test('percent-encodes the offset, so the + cannot be read as a space', async ({
  api,
  scheduleView,
}) => {
  await scheduleView.open()

  expect(api.notesRequests[0].search).toContain('searchFrom=2026-08-24T00%3A00%3A00%2B01%3A00')
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

test.describe('under UTC+12', () => {
  test.use({ timezoneId: 'Pacific/Auckland' })

  test('sends that zone’s own local midnights and its offset', async ({
    api,
    scheduleView,
  }) => {
    await scheduleView.open()

    // The frozen instant is 20:20 on 25/08 in London, which is 07:20 on the 26th in Auckland — so
    // the focus day, and with it the window, is a day further on.
    const [request] = api.notesRequests

    expect(request.searchParams.get('searchFrom')).toBe('2026-08-25T00:00:00+12:00')
    expect(request.searchParams.get('searchTo')).toBe('2026-08-28T00:00:00+12:00')
    expect(request.search).toContain('%2B12%3A00')
  })
})
