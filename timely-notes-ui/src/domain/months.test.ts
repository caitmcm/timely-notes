import {
  addMonths,
  dayOfMonth,
  formatMonthHeading,
  isInMonth,
  monthGrid,
  monthStartOf,
} from './months'
import { toDayKey } from './days'
import { EITHER_SIDE_OF_GREENWICH, inTimezone } from '../test/timezone'

const day = toDayKey

describe('monthStartOf', () => {
  it('is the 1st of that month', () => {
    expect(monthStartOf(day('2026-09-17'))).toBe('2026-09-01')
  })

  it('keeps the 1st itself on its own month', () => {
    expect(monthStartOf(day('2026-09-01'))).toBe('2026-09-01')
  })
})

describe('addMonths', () => {
  it('moves forwards and backwards', () => {
    expect(addMonths(day('2026-09-01'), 1)).toBe('2026-10-01')
    expect(addMonths(day('2026-09-01'), -2)).toBe('2026-07-01')
  })

  it('crosses a year boundary in both directions', () => {
    expect(addMonths(day('2026-01-01'), -1)).toBe('2025-12-01')
    expect(addMonths(day('2026-12-01'), 1)).toBe('2027-01-01')
    expect(addMonths(day('2026-01-01'), -13)).toBe('2024-12-01')
  })

  // Going back from a 31-day month must not overflow into the following one.
  it('lands on the 1st when the neighbouring month is shorter', () => {
    expect(addMonths(day('2026-03-31'), -1)).toBe('2026-02-01')
    expect(addMonths(day('2026-01-31'), 1)).toBe('2026-02-01')
  })
})

describe('dayOfMonth', () => {
  it('reads the date without building one', () => {
    expect(dayOfMonth(day('2026-09-05'))).toBe(5)
    expect(dayOfMonth(day('2026-09-30'))).toBe(30)
  })
})

describe('monthGrid', () => {
  // September 2026 starts on a Tuesday and ends on a Wednesday.
  const september = monthGrid(day('2026-09-01'))

  it('starts on the Monday of the week holding the 1st', () => {
    expect(september[0][0]).toBe('2026-08-31')
  })

  it('ends on the Sunday of the week holding the last day', () => {
    expect(september.at(-1)!.at(-1)).toBe('2026-10-04')
  })

  it('is whole weeks of seven days', () => {
    expect(september.every((week) => week.length === 7)).toBe(true)
  })

  it('covers every day of the month in order', () => {
    const days = september.flat()

    expect(days).toEqual([...days].sort())
    expect(days).toContain('2026-09-30')
  })

  it('gives six rows to a month that needs them', () => {
    // November 2026 starts on a Sunday, so the grid runs from 26 October.
    expect(monthGrid(day('2026-11-01'))).toHaveLength(6)
    expect(monthGrid(day('2026-11-01'))[0][0]).toBe('2026-10-26')
  })

  it('gives five rows to a month that fits in them', () => {
    expect(monthGrid(day('2026-09-01'))).toHaveLength(5)
  })

  it('spans a year end without a gap', () => {
    const december = monthGrid(day('2026-12-01')).flat()

    expect(december).toContain('2026-12-31')
    expect(december).toContain('2027-01-01')
  })

  // March holds a daylight-saving change in both hemispheres.
  it.each(EITHER_SIDE_OF_GREENWICH)('is the same grid in %s', (zone) => {
    inTimezone(zone, () => {
      expect(monthGrid(day('2026-03-01'))).toEqual(monthGrid(day('2026-03-01')))
      expect(monthGrid(day('2026-03-01'))[0][0]).toBe('2026-02-23')
      expect(monthGrid(day('2026-03-01')).at(-1)!.at(-1)).toBe('2026-04-05')
    })
  })
})

describe('isInMonth', () => {
  it('is true for a day of the month itself', () => {
    expect(isInMonth(day('2026-09-30'), day('2026-09-01'))).toBe(true)
  })

  it('is false for the leading and trailing days of the grid', () => {
    expect(isInMonth(day('2026-08-31'), day('2026-09-01'))).toBe(false)
    expect(isInMonth(day('2026-10-01'), day('2026-09-01'))).toBe(false)
  })
})

describe('formatMonthHeading', () => {
  it('names the month and the year', () => {
    expect(formatMonthHeading(day('2026-09-01'))).toBe('September 2026')
    expect(formatMonthHeading(day('2027-01-01'))).toBe('January 2027')
  })
})
