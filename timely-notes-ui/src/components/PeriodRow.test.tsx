import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildPeriods } from '../domain/periods'
import { toDayKey } from '../domain/days'
import type { Note, Period } from '../types'
import PeriodRow from './PeriodRow'

const evening = () => buildPeriods(3)[6] // 18:00 – 21:00

const note = (content: string): Note => ({
  day: toDayKey('2026-08-25'),
  ordinal: 7,
  content,
  // Deliberately a different day: the row shows the period, never the write time.
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
})

const holding = (period: Period, content: string): Period => ({ ...period, note: note(content) })

function renderRow(overrides: Partial<React.ComponentProps<typeof PeriodRow>> = {}) {
  const props = {
    period: evening(),
    spanHours: 3 as const,
    isCurrent: false,
    isSelected: false,
    onSelect: vi.fn(),
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

  it('shows its note as text, with no time of day and nothing to press', () => {
    renderRow({ period: holding(evening(), '# Stand-up\n\nBlocked.') })

    expect(screen.getByText('Stand-up')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('option')).not.toHaveTextContent(/\d{2}:\d{2}\s+Stand-up/)
  })

  it('renders nothing note-shaped for an empty period', () => {
    renderRow()

    expect(screen.getByRole('option')).toHaveTextContent(/^18:00$/)
  })

  it('has no button at all when it is not selected, note or no note', () => {
    renderRow({ isSelected: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    ['empty', () => evening()],
    ['already holding a note', () => holding(evening(), 'Evening wrap-up')],
  ])('has exactly one button when selected and %s', (_case, period) => {
    renderRow({ isSelected: true, period: period() })

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument()
  })

  it('selects the period when the row is clicked', async () => {
    const { onSelect, onOpenNote, period } = renderRow()

    await userEvent.click(screen.getByRole('option'))

    expect(onSelect).toHaveBeenCalledWith(period)
    expect(onOpenNote).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty period', () => evening()],
    ['the period’s existing note', () => holding(evening(), 'Evening wrap-up')],
  ])('opens %s without re-selecting', async (_case, build) => {
    const period = build()
    const { onOpenNote, onSelect } = renderRow({ period, isSelected: true })

    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    expect(onOpenNote).toHaveBeenCalledWith(period)
    expect(onSelect).not.toHaveBeenCalled()
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
