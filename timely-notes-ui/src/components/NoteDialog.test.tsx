import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildPeriods } from '../domain/periods'
import type { Note } from '../types'
import NoteDialog from './NoteDialog'

const day = new Date(2026, 7, 25)
const evening = buildPeriods(day, 3)[6] // 18:00 – 21:00

const existing: Note = {
  id: 'a',
  content: 'Evening wrap-up: slice one is close.',
  createdAt: new Date(2026, 7, 25, 19, 30),
  modifiedAt: new Date(2026, 7, 25, 19, 30),
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof NoteDialog>> = {}) {
  const props = {
    period: evening,
    note: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  const view = render(<NoteDialog {...props} />)

  return { ...props, ...view }
}

describe('NoteDialog', () => {
  it('renders nothing when there is no period to write to', () => {
    renderDialog({ period: null })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('titles the dialog with the period range', () => {
    renderDialog()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('18:00 – 21:00')).toBeInTheDocument()
  })

  it('opens blank for a new note', () => {
    renderDialog()

    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })

  it('seeds the editor with an existing note', () => {
    renderDialog({ note: existing })

    expect(screen.getByRole('textbox')).toHaveTextContent('Evening wrap-up: slice one is close.')
  })

  it('closes without saving when Cancel is pressed', async () => {
    const { onClose, onSave } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reports the markdown then closes when Save is pressed', async () => {
    const { onClose, onSave } = renderDialog({ note: existing })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('Evening wrap-up'))
    expect(onClose).toHaveBeenCalled()
  })

  it('remounts the editor per note, so reopening blank clears the last content', () => {
    const { rerender } = renderDialog({ note: existing })
    expect(screen.getByRole('textbox')).toHaveTextContent('Evening wrap-up')

    rerender(
      <NoteDialog period={evening} note={null} onSave={vi.fn()} onClose={vi.fn()} />,
    )

    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })
})
