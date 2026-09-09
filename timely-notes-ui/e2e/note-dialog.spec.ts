import { expect, test } from './fixtures/app'
import type { ApiStub } from './fixtures/app'
import type { ScheduleView } from './fixtures/ScheduleView'
import type { Page } from '@playwright/test'

const FOCUS = '25/08/2026'
const FOCUS_DAY = '2026-08-25'

/** Longer than the debounce, run on the page's own clock rather than waited out in real time. */
const PAST_THE_DEBOUNCE_MS = 2_500

/** The only way into a period: select its row, then press its one button. */
const openNote = async (scheduleView: ScheduleView, label: string) => {
  const day = scheduleView.day(FOCUS)
  await day.row(label).click()
  await day.noteButton.click()
}

const type = async (scheduleView: ScheduleView, markdown: string) => {
  await scheduleView.editor.click()
  await scheduleView.editor.pressSequentially(markdown)
}

const clear = async (page: Page, scheduleView: ScheduleView) => {
  await scheduleView.editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
}

/** Runs the debounce forward on the frozen clock; nothing here waits in real time. */
const settle = async (page: Page, api: ApiStub, expected: number) => {
  await page.clock.runFor(PAST_THE_DEBOUNCE_MS)
  await expect.poll(() => api.writes.length).toBe(expected)
}

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('opens a blank editor headed with an empty selected period', async ({ scheduleView }) => {
  await openNote(scheduleView, '00:00 – 03:00')

  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('00:00 – 03:00')
  await expect(scheduleView.editor).toHaveText('')
})

test('opens the period’s existing note with its markdown rendered, not flattened', async ({
  scheduleView,
}) => {
  await openNote(scheduleView, '18:00 – 21:00')

  await expect(scheduleView.editor.getByRole('heading', { name: 'Stand-up' })).toBeVisible()
  await expect(scheduleView.editor).toContainText('Blocked.')
})

test('heads the dialog with the period it was opened on', async ({ scheduleView }) => {
  await openNote(scheduleView, '09:00 – 12:00')

  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('09:00 – 12:00')
  await expect(scheduleView.editor).toContainText('Morning block: drafted the TDD plan.')
})

test('is genuinely modal: focus is inside it and the day behind is inert', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).noteButton.click()

  expect(await scheduleView.isDialogModal()).toBe(true)
  expect(await scheduleView.isFocusInsideDialog()).toBe(true)

  await expect(
    scheduleView.day(FOCUS).row('06:00 – 09:00').click({ timeout: 2000 }),
  ).rejects.toThrow(/intercepts pointer events/)

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

// The whole point of the change: a mis-press leaves nothing at all behind.
test('opening and closing without typing issues no write at all', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await page.clock.runFor(PAST_THE_DEBOUNCE_MS * 4)
  await scheduleView.done.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(api.writes).toEqual([])
})

test('the same goes for Escape', async ({ api, page, scheduleView }) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await page.keyboard.press('Escape')

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(api.writes).toEqual([])
})

test('typing a sentence issues exactly one PUT after the debounce', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, 'Wrote this in a real browser.')

  expect(api.writes).toEqual([])

  await settle(page, api, 1)

  expect(api.writeSummary).toEqual([`PUT ${FOCUS_DAY}/p1`])
  expect(api.writes[0].content).toContain('Wrote this in a real browser.')
})

test('typing more writes again to the same URL, and the store still holds one note', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, 'First sentence.')
  await settle(page, api, 1)

  await type(scheduleView, ' Second sentence.')
  await settle(page, api, 2)

  expect(new Set(api.writes.map((write) => write.url)).size).toBe(1)
  expect(api.countAt('s3', FOCUS_DAY, 1)).toBe(1)
})

test('clearing a note writes it empty, clears the row at once, and deletes it on Done', async ({
  api,
  page,
  scheduleView,
}) => {
  const row = scheduleView.day(FOCUS).row('09:00 – 12:00')
  await openNote(scheduleView, '09:00 – 12:00')

  await clear(page, scheduleView)
  await settle(page, api, 1)

  expect(api.writes[0].content).toBe('')
  // Behind the still-open dialog: the empty write is what clears it, not the close.
  await expect(row).not.toContainText('Morning block')

  await scheduleView.done.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(api.writeSummary).toEqual([`PUT ${FOCUS_DAY}/p4`, `DELETE ${FOCUS_DAY}/p4`])
})

// The journey the extra write exists for: the record survives, the note does not.
test('a cleared note does not come back on a reload', async ({ api, page, scheduleView }) => {
  await openNote(scheduleView, '09:00 – 12:00')
  await clear(page, scheduleView)
  await settle(page, api, 1)

  await scheduleView.reload()

  await expect(scheduleView.day(FOCUS).row('09:00 – 12:00')).not.toContainText('Morning block')
})

// Clearing and dismissing with Escape: the native dialog's own close, which only this lane has.
test('clearing and pressing Escape deletes the note too', async ({ api, page, scheduleView }) => {
  await openNote(scheduleView, '09:00 – 12:00')
  await clear(page, scheduleView)
  await settle(page, api, 1)

  await page.keyboard.press('Escape')

  await expect(scheduleView.dialog).toHaveCount(0)
  await expect.poll(() => api.writeSummary).toEqual([
    `PUT ${FOCUS_DAY}/p4`,
    `DELETE ${FOCUS_DAY}/p4`,
  ])

  await scheduleView.reload()
  await expect(scheduleView.day(FOCUS).row('09:00 – 12:00')).not.toContainText('Morning block')
})

// The upsert's whole justification, at the level where it would be visible if it were wrong.
test('typing after the note has been swept re-creates it, with nothing surfaced', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, 'Before the prune.')
  await settle(page, api, 1)

  api.dropNote('s3', FOCUS_DAY, 1)

  await type(scheduleView, ' And after it.')
  await settle(page, api, 2)

  expect(api.noteAt('s3', FOCUS_DAY, 1)?.content).toContain('Before the prune.')
  expect(api.noteAt('s3', FOCUS_DAY, 1)?.content).toContain('And after it.')
  await expect(scheduleView.saveStatus).toHaveText(/^Saved /)
})

// The journey OneNotePerPeriod had to defer for want of a write path.
test('a note written, closed and reopened comes back, and the row holds one entry', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, 'Persisted through a close.')
  await settle(page, api, 1)
  await scheduleView.done.click()

  const row = scheduleView.day(FOCUS).row('00:00 – 03:00')
  await expect(row).toContainText('Persisted through a close.')

  await openNote(scheduleView, '00:00 – 03:00')

  await expect(scheduleView.editor).toContainText('Persisted through a close.')
  await expect(scheduleView.day(FOCUS).noteButton).toHaveCount(1)
})

test('reports the save in a status line', async ({ api, page, scheduleView }) => {
  await openNote(scheduleView, '00:00 – 03:00')

  await expect(scheduleView.saveStatus).toHaveText('')

  await type(scheduleView, 'Something to report.')
  await settle(page, api, 1)

  await expect(scheduleView.saveStatus).toHaveText(/^Saved \d\d:\d\d$/)
})

test('says so when a write fails, and keeps the dialog open', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  api.failWritesWith(500)

  await type(scheduleView, 'Into the void.')
  await settle(page, api, 1)

  await expect(scheduleView.saveStatus).toHaveText('Not saved — retrying')

  await scheduleView.done.click()

  await expect(scheduleView.dialog).toBeVisible()
})

// The read filter's client-visible consequence, and what makes a floating record acceptable.
test('a note with empty content is not rendered in its period row', async ({
  api,
  scheduleView,
}) => {
  api.setNotes('s3', [
    {
      day: FOCUS_DAY,
      periodOrdinal: 1,
      content: '   ',
      createdAt: '2026-08-28T09:12:00+01:00',
      modifiedAt: '2026-08-28T09:12:00+01:00',
    },
  ])
  await scheduleView.open()

  const row = scheduleView.day(FOCUS).row('00:00 – 03:00')
  await expect(row).toBeVisible()
  await expect(row.locator('.period-row__note')).toHaveText('')
})

test('wraps the selection in ** from the Bold toolbar button', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, 'emphatic')

  await page.keyboard.press('ControlOrMeta+a')
  await scheduleView.editorToolbarButton('Bold').click()
  await settle(page, api, 1)

  expect(api.writes.at(-1)?.content).toContain('**emphatic**')
})

test('turns a leading # into a heading, as markdownShortcutPlugin promises', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, '# Retro')

  await expect(scheduleView.editor.getByRole('heading', { name: 'Retro' })).toBeVisible()

  await settle(page, api, 1)
  expect(api.writes.at(-1)?.content).toContain('# Retro')
})

test('gives a blank editor on an empty period after a filled one was closed', async ({
  scheduleView,
}) => {
  await openNote(scheduleView, '09:00 – 12:00')
  await expect(scheduleView.editor).toContainText('Morning block')
  await scheduleView.done.click()

  await openNote(scheduleView, '00:00 – 03:00')

  await expect(scheduleView.editor).toHaveText('')
})
