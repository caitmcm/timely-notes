import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildPeriods } from '../domain/periods'
import type { Note, Period } from '../types'
import PeriodRow from './PeriodRow'

const day = new Date(2026, 7, 25)
const evening = () => buildPeriods(day, 3)[6] // 18:00 – 21:00

const note = (id: string, hour: number, minute: number, content: string): Note => ({
  id,
  content,
  occursAt: new Date(2026, 7, 25, hour, minute),
  // Deliberately a different day: the row shows the slot, never the write time.
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
})

const withNotes = (period: Period, notes: Note[]): Period => ({ ...period, notes })

function renderRow(overrides: Partial<React.ComponentProps<typeof PeriodRow>> = {}) {
  const props = {
    period: evening(),
    isCurrent: false,
    isSelected: false,
    onSelect: vi.fn(),
    onTakeNote: vi.fn(),
    onOpenNote: vi.fn(),
    ...overrides,
  }

  render(
    <ul>
      <PeriodRow {...props} />
    </ul>,
  )

  return props
}

describe('PeriodRow', () => {
  it('shows the period start time in the gutter', () => {
    renderRow()

    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  it('names the row with the full period range', () => {
    renderRow()

    expect(screen.getByRole('option', { name: '18:00 – 21:00' })).toBeInTheDocument()
  })

  it('has no Note button when it is not selected', () => {
    renderRow({ isSelected: false })

    expect(screen.queryByRole('button', { name: 'Note' })).not.toBeInTheDocument()
  })

  it('has a Note button when it is selected', () => {
    renderRow({ isSelected: true })

    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument()
  })

  it('selects the period when the row is clicked', async () => {
    const { onSelect, onTakeNote, period } = renderRow()

    await userEvent.click(screen.getByRole('option'))

    expect(onSelect).toHaveBeenCalledWith(period)
    expect(onTakeNote).not.toHaveBeenCalled()
  })

  it('takes a note without re-selecting when Note is pressed', async () => {
    const { onSelect, onTakeNote, period } = renderRow({ isSelected: true })

    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    expect(onTakeNote).toHaveBeenCalledWith(period)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('renders nothing note-shaped for an empty period', () => {
    renderRow()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders each existing note as a button labelled with its time and an excerpt', () => {
    const period = withNotes(evening(), [note('a', 19, 30, '# Stand-up\n\nBlocked.')])
    renderRow({ period })

    expect(screen.getByRole('button', { name: '19:30 Stand-up' })).toBeInTheDocument()
  })

  it('opens a note with both the period and the note, without re-selecting', async () => {
    const notes = [note('a', 19, 30, 'Evening wrap-up')]
    const period = withNotes(evening(), notes)
    const { onOpenNote, onSelect, onTakeNote } = renderRow({ period, isSelected: true })

    await userEvent.click(screen.getByRole('button', { name: '19:30 Evening wrap-up' }))

    expect(onOpenNote).toHaveBeenCalledWith(period, notes[0])
    expect(onSelect).not.toHaveBeenCalled()
    expect(onTakeNote).not.toHaveBeenCalled()
  })

  it('marks the current period with aria-current="time"', () => {
    renderRow({ isCurrent: true })

    expect(screen.getByRole('option')).toHaveAttribute('aria-current', 'time')
  })

  it('leaves aria-current off a period that is not current', () => {
    renderRow({ isCurrent: false, isSelected: true })

    expect(screen.getByRole('option')).not.toHaveAttribute('aria-current')
  })

  it('marks selection independently of the clock', () => {
    renderRow({ isCurrent: false, isSelected: true })

    expect(screen.getByRole('option', { selected: true })).toBeInTheDocument()
  })

  it('is not selected when only the clock matches', () => {
    renderRow({ isCurrent: true, isSelected: false })

    expect(screen.getByRole('option', { selected: false })).toBeInTheDocument()
  })
})
