import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { monthGrid, monthStartOf } from '../domain/months'
import { toDayKey } from '../domain/days'
import type { DayKey } from '../types'
import MonthGrid from './MonthGrid'

const day = toDayKey

const september = monthStartOf(day('2026-09-01'))
const weeks = monthGrid(september)

const counted: Record<string, number> = {
  '2026-09-03': 3,
  '2026-09-10': 1,
}

const renderGrid = (overrides: Partial<Parameters<typeof MonthGrid>[0]> = {}) => {
  const onPickDay = vi.fn()

  render(
    <MonthGrid
      weeks={weeks}
      monthStart={september}
      currentDay={day('2026-09-17')}
      focusDay={day('2026-09-17')}
      countFor={(value) => counted[value] ?? 0}
      onPickDay={onPickDay}
      {...overrides}
    />,
  )

  return { onPickDay }
}

const cell = (value: DayKey) =>
  document.querySelector<HTMLButtonElement>(`[data-day="${value}"]`)!

describe('MonthGrid', () => {
  it('renders a weekday header starting on Monday', () => {
    renderGrid()

    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('renders one button per grid day, in order, showing the day number', () => {
    renderGrid()

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(weeks.flat().length)
    expect(buttons[0]).toHaveTextContent('31')
    expect(cell(day('2026-09-01'))).toHaveTextContent('1')
    expect(cell(day('2026-09-30'))).toHaveTextContent('30')
  })

  it('marks a day that has notes and says how many', () => {
    renderGrid()

    expect(cell(day('2026-09-03'))).toHaveAccessibleName('3, 3 notes')
    expect(cell(day('2026-09-03')).querySelector('.month-grid__marker')).toBeInTheDocument()
    expect(cell(day('2026-09-10'))).toHaveAccessibleName('10, 1 note')
  })

  it('leaves a day with no notes unmarked, named by its number alone', () => {
    renderGrid()

    expect(cell(day('2026-09-04'))).toHaveAccessibleName('4')
    expect(cell(day('2026-09-04')).querySelector('.month-grid__marker')).not.toBeInTheDocument()
  })

  it('marks the current day and the focus day separately', () => {
    renderGrid({ focusDay: day('2026-09-22') })

    expect(cell(day('2026-09-17'))).toHaveAttribute('aria-current', 'date')
    expect(cell(day('2026-09-17'))).toHaveAttribute('aria-pressed', 'false')
    expect(cell(day('2026-09-22'))).toHaveAttribute('aria-pressed', 'true')
    expect(cell(day('2026-09-22'))).not.toHaveAttribute('aria-current')
  })

  it('dims the days outside the month but leaves them selectable', () => {
    renderGrid()

    expect(cell(day('2026-08-31'))).toHaveAttribute('data-outside', 'true')
    expect(cell(day('2026-08-31'))).toBeEnabled()
    expect(cell(day('2026-09-01'))).not.toHaveAttribute('data-outside')
  })

  it('passes the day pressed, as the readable day it carries', async () => {
    const { onPickDay } = renderGrid()

    await userEvent.click(cell(day('2026-09-22')))

    expect(onPickDay).toHaveBeenCalledWith('2026-09-22')
  })

  it('picks a day outside the month too', async () => {
    const { onPickDay } = renderGrid()

    await userEvent.click(cell(day('2026-10-01')))

    expect(onPickDay).toHaveBeenCalledWith('2026-10-01')
  })
})
