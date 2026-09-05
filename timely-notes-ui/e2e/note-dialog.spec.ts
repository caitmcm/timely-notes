import { expect, test } from './fixtures/app'
import type { ScheduleView } from './fixtures/ScheduleView'

const FOCUS = '25/08/2026'

/** `App.handleSave` logs the markdown, then the address; the markdown comes first. */
const saved = (logs: string[]) => logs.at(-1) ?? ''

/** The only way into a period: select its row, then press its one button. */
const openNote = async (scheduleView: ScheduleView, label: string) => {
  const day = scheduleView.day(FOCUS)
  await day.row(label).click()
  await day.noteButton.click()
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

test('closes on Escape', async ({ logs, page, scheduleView }) => {
  await scheduleView.day(FOCUS).noteButton.click()
  await expect(scheduleView.dialog).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(logs).toEqual([])
})

test('closes on Cancel without reporting anything', async ({ logs, scheduleView }) => {
  await openNote(scheduleView, '18:00 – 21:00')
  await scheduleView.cancel.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(logs).toEqual([])
})

test('reports the editor’s markdown and the period’s address on Save, then closes', async ({
  logs,
  scheduleView,
}) => {
  await openNote(scheduleView, '18:00 – 21:00')
  await scheduleView.save.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(saved(logs)).toContain('# Stand-up')
  expect(saved(logs)).toContain('Blocked.')
  expect(saved(logs)).toContain('2026-08-25 7')
})

test('reports what was typed into a blank editor', async ({ logs, scheduleView }) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await scheduleView.editor.click()
  await scheduleView.editor.pressSequentially('Wrote this in a real browser.')
  await scheduleView.save.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(saved(logs)).toContain('Wrote this in a real browser.')
})

test('wraps the selection in ** from the Bold toolbar button', async ({
  logs,
  page,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await scheduleView.editor.click()
  await scheduleView.editor.pressSequentially('emphatic')

  await page.keyboard.press('ControlOrMeta+a')
  await scheduleView.editorToolbarButton('Bold').click()
  await scheduleView.save.click()

  expect(saved(logs)).toContain('**emphatic**')
})

test('turns a leading # into a heading, as markdownShortcutPlugin promises', async ({
  logs,
  scheduleView,
}) => {
  await openNote(scheduleView, '00:00 – 03:00')
  await scheduleView.editor.click()
  await scheduleView.editor.pressSequentially('# Retro')

  await expect(scheduleView.editor.getByRole('heading', { name: 'Retro' })).toBeVisible()

  await scheduleView.save.click()
  expect(saved(logs)).toContain('# Retro')
})

test('gives a blank editor on an empty period after a filled one was cancelled', async ({
  scheduleView,
}) => {
  await openNote(scheduleView, '09:00 – 12:00')
  await expect(scheduleView.editor).toContainText('Morning block')
  await scheduleView.cancel.click()

  await openNote(scheduleView, '00:00 – 03:00')

  await expect(scheduleView.editor).toHaveText('')
})
