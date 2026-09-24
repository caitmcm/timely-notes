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

test('is genuinely modal: focus is inside it and the day behind is inert', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).noteButton.click()

  expect(await scheduleView.isDialogModal()).toBe(true)
  expect(await scheduleView.isFocusInsideDialog()).toBe(true)

  await expect(
    scheduleView.day(FOCUS).row('06:00 – 09:00').click({ timeout: 250 }),
  ).rejects.toThrow(/intercepts pointer events/)

  await expect(scheduleView.dialog).toBeVisible()
  await expect(scheduleView.day(FOCUS).selectedRow).toHaveAttribute('aria-label', '18:00 – 21:00')
})

// A mis-press leaves nothing behind, even if the editor normalises the markdown it was given.
test('renders a note’s markdown, then a blank editor after it, and writes nothing untyped', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '18:00 – 21:00')
  await expect(scheduleView.editor.getByRole('heading', { name: 'Stand-up' })).toBeVisible()
  await expect(scheduleView.editor).toContainText('Blocked.')
  await page.clock.runFor(PAST_THE_DEBOUNCE_MS * 4)
  await scheduleView.done.click()

  await openNote(scheduleView, '00:00 – 03:00')
  await expect(scheduleView.editor).toHaveText('')
  await page.clock.runFor(PAST_THE_DEBOUNCE_MS * 4)
  await scheduleView.done.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(api.writes).toEqual([])
})

test('turns a typed leading # into a heading, and writes it in one PUT after the debounce', async ({
  api,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await type(scheduleView, '# Retro')

  await expect(scheduleView.editor.getByRole('heading', { name: 'Retro' })).toBeVisible()
  expect(api.writes).toEqual([])

  await settle(page, api, 1)

  expect(api.writeSummary).toEqual([`PUT ${FOCUS_DAY}/p1`])
  expect(api.writes[0].content).toContain('# Retro')
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
})
