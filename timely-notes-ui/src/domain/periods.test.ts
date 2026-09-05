import {
  assignNotes,
  buildPeriods,
  findCurrentPeriod,
  formatDayHeading,
  formatPeriodLabel,
  formatPeriodStart,
  isCurrentPeriod,
  ordinalOf,
} from './periods'
import { toDayKey } from './days'
import type { Note, SpanHours } from '../types'

const day = toDayKey

const note = (dayValue: string, ordinal: number, content = 'Note'): Note => ({
  day: day(dayValue),
  ordinal,
  content,
  // Deliberately another day: an audit stamp never places a note.
  createdAt: new Date(2020, 0, 1, 8),
  modifiedAt: new Date(2020, 0, 1, 8),
})

describe('buildPeriods', () => {
  it.each([
    [1, 24],
    [3, 8],
    [6, 4],
  ])('splits the day into 24 / %i periods', (spanHours, count) => {
    expect(buildPeriods(spanHours as SpanHours)).toHaveLength(count)
  })

  it('numbers them from 1, holding no note', () => {
    expect(buildPeriods(6)).toEqual([
      { ordinal: 1, note: null },
      { ordinal: 2, note: null },
      { ordinal: 3, note: null },
      { ordinal: 4, note: null },
    ])
  })

  it('carries no date and no time at all', () => {
    expect(Object.keys(buildPeriods(3)[0]).sort()).toEqual(['note', 'ordinal'])
  })
})

describe('ordinalOf', () => {
  it.each([1, 3, 6])('is 1 at midnight and the count at 23:59 on s%i', (spanHours) => {
    const span = spanHours as SpanHours

    expect(ordinalOf(new Date(2026, 7, 25, 0, 0), span)).toBe(1)
    expect(ordinalOf(new Date(2026, 7, 25, 23, 59), span)).toBe(24 / spanHours)
  })

  it('puts a boundary hour in the period it opens, not the one it closes', () => {
    expect(ordinalOf(new Date(2026, 7, 25, 8, 59), 3)).toBe(3)
    expect(ordinalOf(new Date(2026, 7, 25, 9, 0), 3)).toBe(4)
    expect(ordinalOf(new Date(2026, 7, 25, 11, 59), 3)).toBe(4)
    expect(ordinalOf(new Date(2026, 7, 25, 12, 0), 3)).toBe(5)
  })

  it('answers the fourth period for 09:30 on s3, the tenth on s1 and the second on s6', () => {
    expect(ordinalOf(new Date(2026, 7, 25, 9, 30), 3)).toBe(4)
    expect(ordinalOf(new Date(2026, 7, 25, 9, 30), 1)).toBe(10)
    expect(ordinalOf(new Date(2026, 7, 25, 9, 30), 6)).toBe(2)
  })
})

describe('isCurrentPeriod', () => {
  const periods = buildPeriods(3)
  const now = new Date(2026, 7, 25, 20, 20)

  it('is true only for the period the clock is in, on the day the clock is on', () => {
    expect(isCurrentPeriod(periods[6], day('2026-08-25'), now, 3)).toBe(true)
    expect(isCurrentPeriod(periods[5], day('2026-08-25'), now, 3)).toBe(false)
  })

  it('is false for the same period on another day', () => {
    expect(isCurrentPeriod(periods[6], day('2026-08-26'), now, 3)).toBe(false)
  })
})

describe('findCurrentPeriod', () => {
  const now = new Date(2026, 7, 25, 20, 20)

  it('finds the one period holding the clock', () => {
    expect(findCurrentPeriod(buildPeriods(3), day('2026-08-25'), now, 3)).toEqual({
      ordinal: 7,
      note: null,
    })
  })

  it('finds exactly one, whatever the span', () => {
    const found = buildPeriods(1).filter((period) =>
      isCurrentPeriod(period, day('2026-08-25'), now, 1),
    )

    expect(found).toHaveLength(1)
  })

  it('finds nothing on another day', () => {
    expect(findCurrentPeriod(buildPeriods(3), day('2026-08-26'), now, 3)).toBeUndefined()
  })
})

describe('assignNotes', () => {
  const periods = buildPeriods(3)
  const today = day('2026-08-25')

  it('gives a period the note addressed to its ordinal, and null to the rest', () => {
    const assigned = assignNotes(periods, today, [note('2026-08-25', 4, 'Morning')])

    expect(assigned[3].note?.content).toBe('Morning')
    expect(assigned.filter((period) => period.note !== null)).toHaveLength(1)
  })

  it('is a lookup on the ordinal, so 1 is the first period and the count is the last', () => {
    const assigned = assignNotes(periods, today, [
      note('2026-08-25', 1, 'First'),
      note('2026-08-25', 8, 'Last'),
    ])

    expect(assigned[0].note?.content).toBe('First')
    expect(assigned.at(-1)?.note?.content).toBe('Last')
  })

  it('ignores a note addressed to another day', () => {
    const assigned = assignNotes(periods, today, [note('2026-08-26', 4)])

    expect(assigned.every((period) => period.note === null)).toBe(true)
  })

  it('ignores an ordinal outside the grid rather than throwing', () => {
    expect(() => assignNotes(periods, today, [note('2026-08-25', 99)])).not.toThrow()
    expect(assignNotes(periods, today, [note('2026-08-25', 99)])).toEqual(periods)
  })

  // Unspellable through the API, but bad data should degrade rather than crash.
  it('lets the last note win when two claim one period', () => {
    const assigned = assignNotes(periods, today, [
      note('2026-08-25', 4, 'First'),
      note('2026-08-25', 4, 'Second'),
    ])

    expect(assigned[3].note?.content).toBe('Second')
  })

  it('leaves the periods it was given untouched', () => {
    assignNotes(periods, today, [note('2026-08-25', 4)])

    expect(periods.every((period) => period.note === null)).toBe(true)
  })
})

describe('formatPeriodStart', () => {
  it('is the ordinal’s own hour, zero-padded', () => {
    expect(formatPeriodStart({ ordinal: 1, note: null }, 3)).toBe('00:00')
    expect(formatPeriodStart({ ordinal: 7, note: null }, 3)).toBe('18:00')
    expect(formatPeriodStart({ ordinal: 10, note: null }, 1)).toBe('09:00')
  })
})

describe('formatPeriodLabel', () => {
  it('spans the period', () => {
    expect(formatPeriodLabel({ ordinal: 4, note: null }, 3)).toBe('09:00 – 12:00')
    expect(formatPeriodLabel({ ordinal: 1, note: null }, 6)).toBe('00:00 – 06:00')
  })

  it('ends the day at midnight rather than at 24:00', () => {
    expect(formatPeriodLabel({ ordinal: 8, note: null }, 3)).toBe('21:00 – 00:00')
    expect(formatPeriodLabel({ ordinal: 24, note: null }, 1)).toBe('23:00 – 00:00')
  })
})

describe('formatDayHeading', () => {
  it('reads the day back as a British date', () => {
    expect(formatDayHeading(day('2026-08-25'))).toBe('25/08/2026')
    expect(formatDayHeading(day('2027-01-02'))).toBe('02/01/2027')
  })
})
