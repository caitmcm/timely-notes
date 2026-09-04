import { addMonths, formatMonthHeading, isInMonth, monthGrid, monthStartOf } from './months'

const day = (year: number, month: number, date: number) => new Date(year, month, date).getTime()

describe('monthStartOf', () => {
  it('is local midnight on the 1st of that month', () => {
    expect(monthStartOf(day(2026, 8, 17))).toBe(day(2026, 8, 1))
  })

  it('keeps the 1st itself on its own month', () => {
    expect(monthStartOf(day(2026, 8, 1))).toBe(day(2026, 8, 1))
  })
})

describe('addMonths', () => {
  it('moves forwards and backwards', () => {
    expect(addMonths(day(2026, 8, 1), 1)).toBe(day(2026, 9, 1))
    expect(addMonths(day(2026, 8, 1), -2)).toBe(day(2026, 6, 1))
  })

  it('crosses a year boundary in both directions', () => {
    expect(addMonths(day(2026, 0, 1), -1)).toBe(day(2025, 11, 1))
    expect(addMonths(day(2026, 11, 1), 1)).toBe(day(2027, 0, 1))
  })

  // Going back from a 31-day month must not overflow into the following one.
  it('lands on the 1st when the neighbouring month is shorter', () => {
    expect(addMonths(day(2026, 2, 31), -1)).toBe(day(2026, 1, 1))
    expect(addMonths(day(2026, 0, 31), 1)).toBe(day(2026, 1, 1))
  })
})

describe('monthGrid', () => {
  // September 2026 starts on a Tuesday and ends on a Wednesday.
  const september = monthGrid(day(2026, 8, 1))

  it('starts on the Monday of the week holding the 1st', () => {
    expect(september[0][0]).toBe(day(2026, 7, 31))
  })

  it('ends on the Sunday of the week holding the last day', () => {
    expect(september.at(-1)!.at(-1)).toBe(day(2026, 9, 4))
  })

  it('is whole weeks of seven days', () => {
    expect(september.every((week) => week.length === 7)).toBe(true)
  })

  it('covers every day of the month in order', () => {
    const days = september.flat()

    expect(days).toEqual([...days].sort((a, b) => a - b))
    expect(days).toContain(day(2026, 8, 30))
  })

  it('gives six rows to a month that needs them', () => {
    // November 2026 starts on a Sunday, so the grid runs from 26 October.
    expect(monthGrid(day(2026, 10, 1))).toHaveLength(6)
    expect(monthGrid(day(2026, 10, 1))[0][0]).toBe(day(2026, 9, 26))
  })

  it('gives five rows to a month that fits in them', () => {
    expect(monthGrid(day(2026, 8, 1))).toHaveLength(5)
  })

  it('is built from local clock fields, so every cell is a local midnight', () => {
    // March 2026 holds a daylight-saving change in most of Europe.
    expect(
      monthGrid(day(2026, 2, 1))
        .flat()
        .every((cell) => new Date(cell).getHours() === 0),
    ).toBe(true)
  })
})

describe('isInMonth', () => {
  it('is true for a day of the month itself', () => {
    expect(isInMonth(day(2026, 8, 30), day(2026, 8, 1))).toBe(true)
  })

  it('is false for the leading and trailing days of the grid', () => {
    expect(isInMonth(day(2026, 7, 31), day(2026, 8, 1))).toBe(false)
    expect(isInMonth(day(2026, 9, 1), day(2026, 8, 1))).toBe(false)
  })
})

describe('formatMonthHeading', () => {
  it('names the month and the year', () => {
    expect(formatMonthHeading(day(2026, 8, 1))).toBe('September 2026')
    expect(formatMonthHeading(day(2027, 0, 1))).toBe('January 2027')
  })
})
