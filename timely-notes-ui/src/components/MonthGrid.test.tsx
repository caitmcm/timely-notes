import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { monthGrid, monthStartOf } from '../domain/months'
import MonthGrid from './MonthGrid'

const day = (year: number, month: number, dayOfMonth: number) =>
  new Date(year, month, dayOfMonth).getTime()

const september = monthStartOf(day(2026, 8, 1))
const weeks = monthGrid(september)

const counted: Record<number, number> = {
  [day(2026, 8, 3)]: 3,
  [day(2026, 8, 10)]: 1,
}

const renderGrid = (overrides: Partial<Parameters<typeof MonthGrid>[0]> = {}) => {
  const onPickDay = vi.fn()

  render(
    <MonthGrid
      weeks={weeks}
      monthStart={september}
      currentDayStart={day(2026, 8, 17)}
      focusDayStart={day(2026, 8, 17)}
      countFor={(dayStart) => counted[dayStart] ?? 0}
      onPickDay={onPickDay}
      {...overrides}
    />,
  )

  return { onPickDay }
}

const cell = (dayStart: number) =>
  document.querySelector<HTMLButtonElement>(`[data-day="${dayStart}"]`)!

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
    expect(cell(day(2026, 8, 1))).toHaveTextContent('1')
    expect(cell(day(2026, 8, 30))).toHaveTextContent('30')
  })

  it('marks a day that has notes and says how many', () => {
    renderGrid()

    expect(cell(day(2026, 8, 3))).toHaveAccessibleName('3, 3 notes')
    expect(cell(day(2026, 8, 3)).querySelector('.month-grid__marker')).toBeInTheDocument()
    expect(cell(day(2026, 8, 10))).toHaveAccessibleName('10, 1 note')
  })

  it('leaves a day with no notes unmarked, named by its number alone', () => {
    renderGrid()

    expect(cell(day(2026, 8, 4))).toHaveAccessibleName('4')
    expect(cell(day(2026, 8, 4)).querySelector('.month-grid__marker')).not.toBeInTheDocument()
  })

  it('marks the current day and the focus day separately', () => {
    renderGrid({ focusDayStart: day(2026, 8, 22) })

    expect(cell(day(2026, 8, 17))).toHaveAttribute('aria-current', 'date')
    expect(cell(day(2026, 8, 17))).toHaveAttribute('aria-pressed', 'false')
    expect(cell(day(2026, 8, 22))).toHaveAttribute('aria-pressed', 'true')
    expect(cell(day(2026, 8, 22))).not.toHaveAttribute('aria-current')
  })

  it('dims the days outside the month but leaves them selectable', () => {
    renderGrid()

    expect(cell(day(2026, 7, 31))).toHaveAttribute('data-outside', 'true')
    expect(cell(day(2026, 7, 31))).toBeEnabled()
    expect(cell(day(2026, 8, 1))).not.toHaveAttribute('data-outside')
  })

  it('passes the local day start of the day pressed', async () => {
    const { onPickDay } = renderGrid()

    await userEvent.click(cell(day(2026, 8, 22)))

    expect(onPickDay).toHaveBeenCalledWith(day(2026, 8, 22))
  })

  it('picks a day outside the month too', async () => {
    const { onPickDay } = renderGrid()

    await userEvent.click(cell(day(2026, 9, 1)))

    expect(onPickDay).toHaveBeenCalledWith(day(2026, 9, 1))
  })
})
