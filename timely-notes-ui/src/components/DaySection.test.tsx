import { render, screen } from '@testing-library/react'
import { assignNotes, buildPeriods } from '../domain/periods'
import type { Note } from '../types'
import DaySection from './DaySection'

const day = new Date(2026, 7, 25)
const now = new Date(2026, 7, 25, 20, 20)

const note = (id: string, hour: number, content: string): Note => ({
  id,
  content,
  occursAt: new Date(2026, 7, 25, hour),
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
})

function renderView(overrides: Partial<React.ComponentProps<typeof DaySection>> = {}) {
  const periods = buildPeriods(day, 3)
  const props = {
    day,
    periods,
    now,
    selectedPeriod: periods[6],
    isLoading: false,
    onSelect: vi.fn(),
    onTakeNote: vi.fn(),
    onOpenNote: vi.fn(),
    ...overrides,
  }

  render(<DaySection {...props} />)

  return props
}

describe('DaySection', () => {
  it('heads the day with its date', () => {
    renderView()

    expect(screen.getByText('25/08/2026')).toBeInTheDocument()
  })

  it('renders one row per period it is given', () => {
    renderView({ periods: buildPeriods(day, 6), selectedPeriod: undefined })

    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('marks exactly one row as current, the one holding now', () => {
    renderView()

    const current = screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))

    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAccessibleName('18:00 – 21:00')
  })

  it('marks exactly one row selected, and it is the one with the Note button', () => {
    const periods = buildPeriods(day, 3)
    renderView({ periods, selectedPeriod: periods[2] })

    const selected = screen.getAllByRole('option', { selected: true })

    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveAccessibleName('06:00 – 09:00')
    expect(selected[0]).toContainElement(screen.getByRole('button', { name: 'Note' }))
  })

  it('leaves selection and the clock independent', () => {
    const periods = buildPeriods(day, 3)
    renderView({ periods, selectedPeriod: periods[0] })

    expect(screen.getAllByRole('option', { selected: true })[0]).toHaveAccessibleName(
      '00:00 – 03:00',
    )
    expect(
      screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))[0],
    ).toHaveAccessibleName('18:00 – 21:00')
  })

  it('lists each note against the period it falls in', () => {
    const periods = assignNotes(buildPeriods(day, 3), [
      note('morning', 9, 'Morning block'),
      note('afternoon', 15, 'Afternoon block'),
    ])
    renderView({ periods, selectedPeriod: periods[6] })

    expect(
      screen.getByRole('option', { name: '09:00 – 12:00' }),
    ).toContainElement(screen.getByRole('button', { name: '09:00 Morning block' }))
    expect(
      screen.getByRole('option', { name: '15:00 – 18:00' }),
    ).toContainElement(screen.getByRole('button', { name: '15:00 Afternoon block' }))
  })

  it('says so while its notes are still in flight, without hiding its rows', () => {
    renderView({ isLoading: true })

    expect(screen.getByRole('status')).toHaveTextContent(/loading notes/i)
    expect(screen.getAllByRole('option')).toHaveLength(8)
  })

  it('says nothing once its notes have landed', () => {
    renderView()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('carries its day so the scrolling view can observe it', () => {
    renderView()

    expect(document.querySelector(`[data-day="${day.getTime()}"]`)).toBeInTheDocument()
  })

  it('renders no current row when now falls on another day', () => {
    renderView({ now: new Date(2026, 7, 26, 20, 20) })

    expect(screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))).toEqual(
      [],
    )
  })

  it('renders no Note button when nothing is selected', () => {
    renderView({ selectedPeriod: undefined })

    expect(screen.queryByRole('button', { name: 'Note' })).not.toBeInTheDocument()
  })
})
