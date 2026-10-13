import { render, screen } from '@testing-library/react'
import { assignNotes, buildPeriods, dayFractionOf } from '../domain/periods'
import { toDayKey } from '../domain/days'
import type { Note } from '../types'
import DaySection from './DaySection'

const day = toDayKey('2026-08-25')
const now = new Date(2026, 7, 25, 20, 20)

const note = (ordinal: number, content: string): Note => ({
  day,
  ordinal,
  content,
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
})

function renderView(overrides: Partial<React.ComponentProps<typeof DaySection>> = {}) {
  const props = {
    day,
    periods: buildPeriods(3),
    spanHours: 3 as const,
    now,
    selectedOrdinal: 7,
    isLoading: false,
    onSelect: vi.fn(),
    onOpenNote: vi.fn(),
    ...overrides,
  }

  const { rerender } = render(<DaySection {...props} />)

  return { props, rerender }
}

describe('DaySection', () => {
  it('heads the day with its date', () => {
    renderView()

    expect(screen.getByText('25/08/2026')).toBeInTheDocument()
  })

  it('renders one row per period it is given', () => {
    renderView({ periods: buildPeriods(6), spanHours: 6, selectedOrdinal: null })

    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('marks exactly one row as current, the one holding now', () => {
    renderView()

    const current = screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))

    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAccessibleName('18:00 – 21:00')
  })

  it('marks exactly one row selected, and it is the one with the Note button', () => {
    renderView({ selectedOrdinal: 3 })

    const selected = screen.getAllByRole('option', { selected: true })

    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveAccessibleName('06:00 – 09:00')
    expect(selected[0]).toContainElement(screen.getByRole('button', { name: 'Note' }))
  })

  it('leaves selection and the clock independent', () => {
    renderView({ selectedOrdinal: 1 })

    expect(screen.getAllByRole('option', { selected: true })[0]).toHaveAccessibleName(
      '00:00 – 03:00',
    )
    expect(
      screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))[0],
    ).toHaveAccessibleName('18:00 – 21:00')
  })

  it('shows each note against the period addressing it, as text', () => {
    const periods = assignNotes(buildPeriods(3), day, [
      note(4, 'Morning block'),
      note(6, 'Afternoon block'),
    ])
    renderView({ periods })

    expect(screen.getByRole('option', { name: '09:00 – 12:00' })).toHaveTextContent('Morning block')
    expect(screen.getByRole('option', { name: '15:00 – 18:00' })).toHaveTextContent(
      'Afternoon block',
    )
  })

  it('shows a note for this day only, ignoring one addressed to another', () => {
    const periods = assignNotes(buildPeriods(3), day, [
      { ...note(4, 'Yesterday'), day: toDayKey('2026-08-24') },
    ])
    renderView({ periods })

    expect(screen.queryByText('Yesterday')).not.toBeInTheDocument()
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

  it('carries its day, readable, so the scrolling view can observe it', () => {
    renderView()

    expect(document.querySelector('[data-day="2026-08-25"]')).toBeInTheDocument()
  })

  it('renders no current row when now falls on another day', () => {
    renderView({ now: new Date(2026, 7, 26, 20, 20) })

    expect(screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))).toEqual(
      [],
    )
  })

  describe('the now line', () => {
    const lines = () => document.querySelectorAll<HTMLElement>('.now-line')
    const fractionOf = (line: HTMLElement) =>
      Number(line.style.getPropertyValue('--now-fraction'))

    it('draws one on the current day, at the fraction of the day the clock has reached', () => {
      renderView()

      expect(lines()).toHaveLength(1)
      expect(fractionOf(lines()[0])).toBe(dayFractionOf(now))
    })

    it.each(['2026-08-24', '2026-08-26'])('draws none on %s, a neighbour of today', (other) => {
      renderView({ day: toDayKey(other) })

      expect(lines()).toHaveLength(0)
    })

    it('moves down when the minute ticks, leaving the current row where it was', () => {
      const { props, rerender } = renderView()
      const before = fractionOf(lines()[0])
      const line = lines()[0]
      const currentRow = () =>
        screen.getAllByRole('option').filter((row) => row.getAttribute('aria-current'))

      rerender(<DaySection {...props} now={new Date(2026, 7, 25, 20, 21)} />)

      expect(lines()[0]).toBe(line)
      expect(fractionOf(lines()[0])).toBeGreaterThan(before)
      expect(currentRow()).toHaveLength(1)
      expect(currentRow()[0]).toHaveAccessibleName('18:00 – 21:00')
    })

    it.each([1, 3, 6] as const)('sits at the same height on s%i', (spanHours) => {
      renderView({ periods: buildPeriods(spanHours), spanHours, selectedOrdinal: null })

      expect(fractionOf(lines()[0])).toBe(dayFractionOf(now))
    })
  })

  it('renders no Note button when nothing is selected', () => {
    renderView({ selectedOrdinal: null })

    expect(screen.queryByRole('button', { name: 'Note' })).not.toBeInTheDocument()
  })
})
