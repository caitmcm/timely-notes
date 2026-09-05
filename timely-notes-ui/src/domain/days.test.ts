import { addDays, chunkRun, contiguousRuns, dayKeyOf, eachDay, toDayKey } from './days'
import { EITHER_SIDE_OF_GREENWICH, inTimezone } from '../test/timezone'

const day = toDayKey

describe('dayKeyOf', () => {
  it('names the local calendar day the instant falls on', () => {
    expect(dayKeyOf(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05')
    expect(dayKeyOf(new Date(2026, 8, 6, 0, 1))).toBe('2026-09-06')
  })

  it('pads the month and the day, so the format is fixed width', () => {
    expect(dayKeyOf(new Date(2026, 0, 2))).toBe('2026-01-02')
  })

  // The one clock-to-calendar conversion in the app, and the one place a UTC-shaped slip would
  // land on the wrong day.
  it.each(EITHER_SIDE_OF_GREENWICH)('reads local fields, not UTC ones, in %s', (zone) => {
    inTimezone(zone, () => {
      expect(dayKeyOf(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05')
      expect(dayKeyOf(new Date(2026, 8, 5, 0, 30))).toBe('2026-09-05')
    })
  })
})

describe('toDayKey', () => {
  it('accepts a fixed-width ISO date', () => {
    expect(toDayKey('2026-09-05')).toBe('2026-09-05')
  })

  it.each(['2026-9-5', '05/09/2026', '2026-09-05T00:00:00+01:00', ''])(
    'rejects %s rather than letting it through as a day',
    (value) => {
      expect(() => toDayKey(value)).toThrow(/day/i)
    },
  )
})

describe('addDays', () => {
  it('moves forwards and backwards', () => {
    expect(addDays(day('2026-08-25'), 1)).toBe('2026-08-26')
    expect(addDays(day('2026-08-25'), -3)).toBe('2026-08-22')
  })

  it('crosses a month end and a year end', () => {
    expect(addDays(day('2026-08-31'), 1)).toBe('2026-09-01')
    expect(addDays(day('2026-12-31'), 1)).toBe('2027-01-01')
    expect(addDays(day('2026-01-01'), -1)).toBe('2025-12-31')
  })

  it('crosses a leap day', () => {
    expect(addDays(day('2028-02-28'), 1)).toBe('2028-02-29')
  })

  // Built from local clock fields, not 86 400 000 ms: a daylight-saving day is 23 or 25 hours long.
  it.each(EITHER_SIDE_OF_GREENWICH)('crosses a daylight-saving change in %s', (zone) => {
    inTimezone(zone, () => {
      expect(addDays(day('2026-03-28'), 2)).toBe('2026-03-30')
      expect(addDays(day('2026-10-24'), 2)).toBe('2026-10-26')
    })
  })
})

describe('eachDay', () => {
  it('is inclusive at both ends', () => {
    expect(eachDay(day('2026-08-25'), day('2026-08-27'))).toEqual([
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
    ])
  })

  it('returns the single day when both ends are the same', () => {
    expect(eachDay(day('2026-08-25'), day('2026-08-25'))).toEqual(['2026-08-25'])
  })

  it('returns nothing when the range is inverted', () => {
    expect(eachDay(day('2026-08-25'), day('2026-08-24'))).toEqual([])
  })
})

describe('contiguousRuns', () => {
  it('groups adjacent days into one run', () => {
    const days = [day('2026-08-25'), day('2026-08-26'), day('2026-08-27')]

    expect(contiguousRuns(days)).toEqual([days])
  })

  it('splits on a gap, so a cached day is never spanned', () => {
    const runs = contiguousRuns([day('2026-08-25'), day('2026-08-26'), day('2026-08-29')])

    expect(runs).toEqual([['2026-08-25', '2026-08-26'], ['2026-08-29']])
  })

  // Correct only because the format is fixed-width ISO, so it is asserted rather than assumed.
  it('sorts lexicographically before grouping, across a month and a year end', () => {
    const runs = contiguousRuns([day('2027-01-01'), day('2026-12-31'), day('2026-08-25')])

    expect(runs).toEqual([['2026-08-25'], ['2026-12-31', '2027-01-01']])
  })

  it('returns nothing for no days', () => {
    expect(contiguousRuns([])).toEqual([])
  })
})

describe('chunkRun', () => {
  it('leaves a run shorter than the maximum whole', () => {
    const run = eachDay(day('2026-08-25'), day('2026-08-27'))

    expect(chunkRun(run, 5)).toEqual([run])
  })

  it('splits a longer run into chunks of at most the maximum, covering it exactly once', () => {
    const run = eachDay(day('2026-08-20'), day('2026-08-31'))

    const chunks = chunkRun(run, 5)

    expect(chunks.map((chunk) => chunk.length)).toEqual([5, 5, 2])
    expect(chunks.flat()).toEqual(run)
  })
})
