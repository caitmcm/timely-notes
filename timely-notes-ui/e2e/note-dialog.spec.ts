import { expect, test } from './fixtures/app'

const FOCUS = '25/08/2026'

/** `App.handleSave` logs the markdown beside the note's `occursAt`; the markdown comes first. */
const saved = (logs: string[]) => logs.at(-1) ?? ''

test.beforeEach(async ({ scheduleView }) => {
  await scheduleView.open()
})

test('opens a blank editor headed with the selected period', async ({ scheduleView }) => {
  await scheduleView.day(FOCUS).noteButton.click()

  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('18:00 – 21:00')
  await expect(scheduleView.editor).toHaveText('')
})

test('opens an existing note with its markdown rendered, not flattened', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).note('19:30 Stand-up').click()

  await expect(scheduleView.editor.getByRole('heading', { name: 'Stand-up' })).toBeVisible()
  await expect(scheduleView.editor).toContainText('Blocked.')
})

test('heads the dialog with the note’s own period, not the selected one', async ({
  scheduleView,
}) => {
  await scheduleView.day(FOCUS).note('09:00 Morning block: drafted the TDD plan.').click()

  await expect(scheduleView.dialog.getByRole('heading').first()).toHaveText('09:00 – 12:00')
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
  await scheduleView.day(FOCUS).note('19:30 Stand-up').click()
  await scheduleView.cancel.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(logs).toEqual([])
})

test('reports the editor’s markdown on Save, then closes', async ({ logs, scheduleView }) => {
  await scheduleView.day(FOCUS).note('19:30 Stand-up').click()
  await scheduleView.save.click()

  await expect(scheduleView.dialog).toHaveCount(0)
  expect(saved(logs)).toContain('# Stand-up')
  expect(saved(logs)).toContain('Blocked.')
})

test('reports what was typed into a blank editor', async ({ logs, scheduleView }) => {
  await scheduleView.day(FOCUS).noteButton.click()
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
  await scheduleView.day(FOCUS).noteButton.click()
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
  await scheduleView.day(FOCUS).noteButton.click()
  await scheduleView.editor.click()
  await scheduleView.editor.pressSequentially('# Retro')

  await expect(scheduleView.editor.getByRole('heading', { name: 'Retro' })).toBeVisible()

  await scheduleView.save.click()
  expect(saved(logs)).toContain('# Retro')
})

test('gives a blank editor after an existing note is cancelled', async ({ scheduleView }) => {
  await scheduleView.day(FOCUS).note('19:30 Stand-up').click()
  await expect(scheduleView.editor).toContainText('Stand-up')
  await scheduleView.cancel.click()

  await scheduleView.day(FOCUS).noteButton.click()

  await expect(scheduleView.editor).toHaveText('')
})
