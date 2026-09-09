import { act, fireEvent, render, screen } from '@testing-library/react'
import { buildPeriods } from '../domain/periods'
import { toDayKey } from '../domain/days'
import type { DayKey, Note, Period } from '../types'
import NoteDialog from './NoteDialog'

// MDXEditor's own behaviour is asserted in the Playwright lane, where it has a real browser. Here
// it stands in as a plain textbox, so these tests are about the dialog's wiring and nothing else.
vi.mock('./NoteEditor', () => ({
  default: ({
    markdown,
    onChange,
  }: {
    markdown: string
    onChange?: (markdown: string) => void
  }) => (
    <textarea
      aria-label="Note"
      defaultValue={markdown}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

const DEBOUNCE_MS = 2_000

const day = toDayKey('2026-08-25')
const evening = buildPeriods(3)[6] // 18:00 – 21:00

const SAVED_AT = new Date(2026, 7, 25, 12, 3)

const existing: Note = {
  day,
  ordinal: 7,
  content: 'Evening wrap-up: slice one is close.',
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
}

const holding = (note: Note): Period => ({ ...evening, note })

const written = (content: string): Note => ({ ...existing, content })

function renderDialog(overrides: Partial<React.ComponentProps<typeof NoteDialog>> = {}) {
  // Declared outside the props object so they keep their mock types through the spread.
  const save = vi.fn(async (_day: DayKey, _ordinal: number, content: string) => written(content))
  const remove = vi.fn(async () => {})

  const props = {
    slot: { day, period: evening },
    spanHours: 3 as const,
    save,
    remove,
    readNow: () => SAVED_AT,
    onClose: vi.fn(),
    ...overrides,
  }

  const view = render(<NoteDialog {...props} />)

  return { ...props, save, remove, ...view }
}

const editor = () => screen.getByRole('textbox', { name: 'Note' })

/** Types without user-event, which needs the real timers the debounce is faking. */
const type = async (markdown: string) => {
  await act(async () => {
    fireEvent.change(editor(), { target: { value: markdown } })
  })
}

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const press = async (name: string) => {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NoteDialog', () => {
  it('renders nothing when there is no period to write to', () => {
    renderDialog({ slot: null })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('titles the dialog with the period range', () => {
    renderDialog()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('18:00 – 21:00')).toBeInTheDocument()
  })

  it('opens blank for a period holding no note', () => {
    renderDialog()

    expect(editor()).toHaveValue('')
  })

  it('seeds the editor with the period’s own note', () => {
    renderDialog({ slot: { day, period: holding(existing) } })

    expect(editor()).toHaveValue('Evening wrap-up: slice one is close.')
  })

  // The same two assertions for a new note and an existing one: the dialog does not tell them apart.
  it.each([
    ['a new note', evening],
    ['an existing note', holding(existing)],
  ])('opens %s with no request at all', async (_case, period) => {
    const { save, remove } = renderDialog({ slot: { day, period } })

    await advance(DEBOUNCE_MS * 10)

    expect(save).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it.each([
    ['a new note', evening, 'First words.'],
    ['an existing note', holding(existing), 'Evening wrap-up, revised.'],
  ])('writes %s on the first change after the debounce', async (_case, period, markdown) => {
    const { save } = renderDialog({ slot: { day, period } })

    await type(markdown)
    await advance(DEBOUNCE_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(day, 7, markdown, expect.any(AbortSignal))
  })

  it('shows nothing at all until something has been written', () => {
    renderDialog()

    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('reports the save as it happens, stamped by this browser’s clock', async () => {
    const { save } = renderDialog()
    let release: (note: Note) => void = () => {}
    save.mockImplementationOnce(
      () => new Promise<Note>((resolve) => (release = resolve)),
    )

    await type('Slow one.')
    await advance(DEBOUNCE_MS)

    expect(screen.getByRole('status')).toHaveTextContent('Saving…')

    await act(async () => {
      release(written('Slow one.'))
    })

    expect(screen.getByRole('status')).toHaveTextContent('Saved 12:03')
  })

  it('announces a failure rather than swallowing it', async () => {
    const { save } = renderDialog()
    save.mockRejectedValue(new Error('offline'))

    await type('Into the void.')
    await advance(DEBOUNCE_MS)

    expect(screen.getByRole('status')).toHaveTextContent('Not saved — retrying')
  })

  it('has one button, and it is Done', () => {
    renderDialog()

    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('flushes a pending write and closes on Done', async () => {
    const { save, onClose } = renderDialog()

    await type('Mid-sentence.')
    await press('Done')

    expect(save).toHaveBeenCalledWith(day, 7, 'Mid-sentence.', expect.any(AbortSignal))
    expect(onClose).toHaveBeenCalled()
  })

  it('deletes a cleared note when Done is pressed', async () => {
    const { save, remove, onClose } = renderDialog({ slot: { day, period: holding(existing) } })

    await type('')
    await press('Done')

    expect(save).toHaveBeenLastCalledWith(day, 7, '', expect.any(AbortSignal))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  // Escape and a Schedule change alike unmount the body; its teardown is what finishes the note.
  it('deletes a cleared note when the dialog is unmounted from above', async () => {
    const { save, remove, rerender } = renderDialog({
      slot: { day, period: holding(existing) },
    })

    await type('')
    await act(async () => {
      rerender(
        <NoteDialog
          slot={null}
          spanHours={3}
          save={save}
          remove={remove}
          readNow={() => SAVED_AT}
          onClose={vi.fn()}
        />,
      )
    })

    expect(save).toHaveBeenLastCalledWith(day, 7, '', expect.any(AbortSignal))
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('closes the first time even when the delete fails', async () => {
    const { remove, onClose } = renderDialog({ slot: { day, period: holding(existing) } })
    remove.mockRejectedValue(new Error('offline'))

    await type('')
    await press('Done')

    expect(onClose).toHaveBeenCalled()
  })

  it('stays open on a failed write, and closes on a second Done', async () => {
    const { save, onClose } = renderDialog()
    save.mockRejectedValue(new Error('offline'))

    await type('Unsaved.')
    await press('Done')

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Not saved — retrying')

    // Deliberate: the second press discards the text, rather than trapping the user in the dialog.
    await press('Done')

    expect(onClose).toHaveBeenCalled()
  })

  it.each([
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['pagehide', () => window.dispatchEvent(new Event('pagehide'))],
  ])('writes a blank buffer empty on %s, and deletes nothing', async (_event, fire) => {
    const { save, remove } = renderDialog({ slot: { day, period: holding(existing) } })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    await type('')
    await act(async () => {
      fire()
    })

    expect(save).toHaveBeenLastCalledWith(day, 7, '', expect.any(AbortSignal))
    expect(remove).not.toHaveBeenCalled()
  })

  it('remounts the editor per address, so opening another period clears the last content', async () => {
    const { save, remove, rerender } = renderDialog({ slot: { day, period: holding(existing) } })
    expect(editor()).toHaveValue('Evening wrap-up: slice one is close.')

    await act(async () => {
      rerender(
        <NoteDialog
          slot={{ day, period: buildPeriods(3)[2] }}
          spanHours={3}
          save={save}
          remove={remove}
          readNow={() => SAVED_AT}
          onClose={vi.fn()}
        />,
      )
    })

    expect(editor()).toHaveValue('')
  })
})
