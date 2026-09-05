import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildPeriods } from '../domain/periods'
import { toDayKey } from '../domain/days'
import type { Note, Period } from '../types'
import NoteDialog from './NoteDialog'

const day = toDayKey('2026-08-25')
const evening = buildPeriods(3)[6] // 18:00 – 21:00

const existing: Note = {
  day,
  ordinal: 7,
  content: 'Evening wrap-up: slice one is close.',
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
}

const holding = (note: Note): Period => ({ ...evening, note })

function renderDialog(overrides: Partial<React.ComponentProps<typeof NoteDialog>> = {}) {
  const props = {
    slot: { day, period: evening },
    spanHours: 3 as const,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  const view = render(<NoteDialog {...props} />)

  return { ...props, ...view }
}

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

    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })

  it('seeds the editor with the period’s own note', () => {
    renderDialog({ slot: { day, period: holding(existing) } })

    expect(screen.getByRole('textbox')).toHaveTextContent('Evening wrap-up: slice one is close.')
  })

  it('closes without saving when Cancel is pressed', async () => {
    const { onClose, onSave } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reports the markdown then closes when Save is pressed', async () => {
    const { onClose, onSave } = renderDialog({ slot: { day, period: holding(existing) } })

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('Evening wrap-up'))
    expect(onClose).toHaveBeenCalled()
  })

  it('remounts the editor per address, so opening another period clears the last content', () => {
    const { rerender } = renderDialog({ slot: { day, period: holding(existing) } })
    expect(screen.getByRole('textbox')).toHaveTextContent('Evening wrap-up')

    rerender(
      <NoteDialog
        slot={{ day, period: buildPeriods(3)[2] }}
        spanHours={3}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })
})
