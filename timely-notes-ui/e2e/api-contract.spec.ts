import { expect, test } from './fixtures/app'

/**
 * What the browser put on the wire, under UTC+12. The frozen instant is 20:20 on 25/08 in London
 * and 07:20 on the 26th in Auckland, so a stray `toISOString` in the day path asks for the wrong day.
 */
test.use({ timezoneId: 'Pacific/Auckland' })

test('reads and writes that zone’s own days, by plain dates and no offset', async ({
  api,
  page,
  scheduleView,
}) => {
  await scheduleView.open()

  const [request] = api.notesRequests
  expect(request.pathname).toBe('/api/schedules/s3/notes')
  expect(request.origin).toBe(new URL(page.url()).origin)
  expect(request.search).toBe('?searchFrom=2026-08-25&searchTo=2026-08-28')

  expect(await scheduleView.dayHeadings()).toEqual(['25/08/2026', '26/08/2026', '27/08/2026'])
  await expect(scheduleView.day('25/08/2026').noteText('Morning block')).toBeVisible()
  await expect(scheduleView.day('26/08/2026').noteText('Tomorrow: review the schedule.')).toBeVisible()

  // The 25th is the same note as in London: same URL, no offset.
  const day = scheduleView.day('25/08/2026')
  await day.row('09:00 – 12:00').click()
  await day.noteButton.click()
  await scheduleView.editor.click()
  await scheduleView.editor.pressSequentially('Addressed by its period.')
  await page.clock.runFor(2_500)

  await expect.poll(() => api.writes.length).toBe(1)
  expect(new URL(api.writes[0].url).pathname).toBe('/api/schedules/s3/notes/2026-08-25/p4')
})
