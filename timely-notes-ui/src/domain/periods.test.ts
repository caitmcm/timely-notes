import type { Note, Period } from '../types'
import {
  assignNotes,
  buildPeriods,
  findCurrentPeriod,
  formatDayHeading,
  formatPeriodLabel,
  formatPeriodStart,
  isCurrentPeriod,
  nextDay,
} from './periods'

/** The date the mockup is drawn against. */
const day = new Date(2026, 7, 25)

/** `createdAt` is deliberately a different day — placement must ignore it. */
const note = (id: string, occursAt: Date, content = 'body'): Note => ({
  id,
  content,
  occursAt,
  createdAt: new Date(2026, 7, 28, 9, 12),
  modifiedAt: new Date(2026, 7, 28, 9, 12),
})

describe('buildPeriods', () => {
  it.each([
    [1, 24],
    [3, 8],
    [6, 4],
  ] as const)('splits the day into %ih periods, giving %i of them', (spanHours, expected) => {
    expect(buildPeriods(day, spanHours)).toHaveLength(expected)
  })

  it('starts the first period at local midnight', () => {
    const [first] = buildPeriods(day, 3)

    expect(first.start).toEqual(new Date(2026, 7, 25, 0, 0, 0, 0))
  })

  it('ends the last period at the next local midnight', () => {
    const periods = buildPeriods(day, 3)

    expect(periods[periods.length - 1].end).toEqual(new Date(2026, 7, 26, 0, 0, 0, 0))
  })

  it('leaves no gaps between periods', () => {
    const periods = buildPeriods(day, 6)

    periods.slice(1).forEach((period, index) => {
      expect(period.start.getTime()).toBe(periods[index].end.getTime())
    })
  })

  it('gives every period an empty notes array', () => {
    expect(buildPeriods(day, 3).every((period) => period.notes.length === 0)).toBe(true)
  })

  it('ignores the time of day on the date it is given', () => {
    const [fromMidday] = buildPeriods(new Date(2026, 7, 25, 12, 34, 56), 3)

    expect(fromMidday.start).toEqual(new Date(2026, 7, 25, 0, 0, 0, 0))
  })
})

describe('isCurrentPeriod', () => {
  const period = buildPeriods(day, 3)[6] // 18:00 – 21:00

  it('is true for an instant inside the period', () => {
    expect(isCurrentPeriod(period, new Date(2026, 7, 25, 20, 20))).toBe(true)
  })

  it('is true at the opening boundary', () => {
    expect(isCurrentPeriod(period, new Date(2026, 7, 25, 18, 0))).toBe(true)
  })

  it('gives the closing boundary instant to the later period', () => {
    expect(isCurrentPeriod(period, new Date(2026, 7, 25, 21, 0))).toBe(false)
  })

  it('is false for a time on another day', () => {
    expect(isCurrentPeriod(period, new Date(2026, 7, 26, 19, 0))).toBe(false)
  })
})

describe('findCurrentPeriod', () => {
  it('returns the 18:00 – 21:00 period at 20:20 on the 3h schedule', () => {
    const found = findCurrentPeriod(buildPeriods(day, 3), new Date(2026, 7, 25, 20, 20))

    expect(found?.start).toEqual(new Date(2026, 7, 25, 18, 0, 0, 0))
  })

  it('matches exactly one period', () => {
    const now = new Date(2026, 7, 25, 20, 20)
    const periods = buildPeriods(day, 1)

    expect(periods.filter((period) => isCurrentPeriod(period, now))).toHaveLength(1)
  })

  it('returns undefined when now falls on another day', () => {
    expect(findCurrentPeriod(buildPeriods(day, 3), new Date(2026, 7, 26, 20, 20))).toBeUndefined()
  })
})

describe('assignNotes', () => {
  it('buckets a note into the period containing its occursAt', () => {
    const periods = assignNotes(buildPeriods(day, 3), [note('a', new Date(2026, 7, 25, 19, 30))])

    expect(periods[6].notes.map((n) => n.id)).toEqual(['a'])
    expect(periods.flatMap((period) => period.notes)).toHaveLength(1)
  })

  it('orders notes within a period oldest-first even when supplied newest-first', () => {
    const newest = note('newest', new Date(2026, 7, 25, 20, 0))
    const oldest = note('oldest', new Date(2026, 7, 25, 18, 30))

    const periods = assignNotes(buildPeriods(day, 3), [newest, oldest])

    expect(periods[6].notes.map((n) => n.id)).toEqual(['oldest', 'newest'])
  })

  it('does not mutate the periods it is given', () => {
    const original = buildPeriods(day, 3)

    const assigned = assignNotes(original, [note('a', new Date(2026, 7, 25, 19, 30))])

    expect(original[6].notes).toEqual([])
    expect(assigned[6]).not.toBe(original[6])
  })

  it('does not mutate the notes array it is given', () => {
    const notes = [note('newest', new Date(2026, 7, 25, 20, 0)), note('oldest', new Date(2026, 7, 25, 18, 30))]

    assignNotes(buildPeriods(day, 3), notes)

    expect(notes.map((n) => n.id)).toEqual(['newest', 'oldest'])
  })

  it('places a note by occursAt, ignoring a createdAt in a different period', () => {
    const written: Note = {
      id: 'written-later',
      content: 'body',
      occursAt: new Date(2026, 7, 25, 19, 30),
      createdAt: new Date(2026, 7, 25, 8, 0),
      modifiedAt: new Date(2026, 7, 25, 8, 0),
    }

    const periods = assignNotes(buildPeriods(day, 3), [written])

    expect(periods[6].notes.map((n) => n.id)).toEqual(['written-later'])
    expect(periods[2].notes).toEqual([])
  })

  it('orders within a period by occursAt, not createdAt', () => {
    const later: Note = {
      id: 'later-slot',
      content: 'body',
      occursAt: new Date(2026, 7, 25, 20, 0),
      createdAt: new Date(2026, 7, 20, 9, 0),
      modifiedAt: new Date(2026, 7, 20, 9, 0),
    }
    const earlier: Note = {
      id: 'earlier-slot',
      content: 'body',
      occursAt: new Date(2026, 7, 25, 18, 30),
      createdAt: new Date(2026, 7, 27, 9, 0),
      modifiedAt: new Date(2026, 7, 27, 9, 0),
    }

    const periods = assignNotes(buildPeriods(day, 3), [later, earlier])

    expect(periods[6].notes.map((n) => n.id)).toEqual(['earlier-slot', 'later-slot'])
  })

  it('drops notes occurring on another day', () => {
    const periods = assignNotes(buildPeriods(day, 3), [note('yesterday', new Date(2026, 7, 24, 19, 30))])

    expect(periods.flatMap((period) => period.notes)).toEqual([])
  })

  it('compares instants, not clock fields, for a note carrying a non-UTC offset', () => {
    // 19:30 local, as an offset timestamp the way the API sends it.
    const local = new Date(2026, 7, 25, 19, 30)
    const offsetIso = new Date(local.getTime()).toISOString() // same instant, UTC-rendered

    const periods = assignNotes(buildPeriods(day, 3), [note('offset', new Date(offsetIso))])

    expect(periods[6].notes.map((n) => n.id)).toEqual(['offset'])
  })
})

describe('formatting', () => {
  const period: Period = buildPeriods(day, 3)[6]

  it('formats the gutter label as a zero-padded 24-hour start time', () => {
    expect(formatPeriodStart(period)).toBe('18:00')
    expect(formatPeriodStart(buildPeriods(day, 3)[0])).toBe('00:00')
  })

  it('formats the full range for the dialog title and accessible name', () => {
    expect(formatPeriodLabel(period)).toBe('18:00 – 21:00')
  })

  it('shows a period ending at midnight as 00:00', () => {
    expect(formatPeriodLabel(buildPeriods(day, 3)[7])).toBe('21:00 – 00:00')
  })

  it('formats a day heading as dd/mm/yyyy', () => {
    expect(formatDayHeading(day)).toBe('25/08/2026')
    expect(formatDayHeading(new Date(2026, 0, 5))).toBe('05/01/2026')
  })
})

describe('nextDay', () => {
  it('returns local midnight on the following day', () => {
    expect(nextDay(day)).toEqual(new Date(2026, 7, 26, 0, 0, 0, 0))
  })

  it('rolls over month ends', () => {
    expect(nextDay(new Date(2026, 7, 31, 23, 59))).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
  })
})
