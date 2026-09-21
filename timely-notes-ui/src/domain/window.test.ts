import { toDayKey, addDays } from './days'
import {
  WINDOW_DAYS,
  formatDayRange,
  shiftAnchor,
  windowContains,
  windowOf,
} from './window'

const day = (value: string) => toDayKey(value)

describe('windowOf', () => {
  it('centres the three days on the anchor', () => {
    expect(windowOf(day('2026-09-24'))).toEqual({
      first: day('2026-09-23'),
      last: day('2026-09-25'),
    })
  })

  it('crosses a month end', () => {
    expect(windowOf(day('2026-09-30'))).toEqual({
      first: day('2026-09-29'),
      last: day('2026-10-01'),
    })
  })

  it('crosses a year end', () => {
    expect(windowOf(day('2027-01-01'))).toEqual({
      first: day('2026-12-31'),
      last: day('2027-01-02'),
    })
  })

  // Through `addDays`, which converts on local clock fields rather than on 86 400 000 ms.
  it('lands on the neighbouring dates across a daylight-saving change', () => {
    expect(windowOf(day('2026-03-29'))).toEqual({
      first: day('2026-03-28'),
      last: day('2026-03-30'),
    })
  })

  it('is three days wide', () => {
    const { first, last } = windowOf(day('2026-09-24'))

    expect(addDays(first, WINDOW_DAYS - 1)).toBe(last)
  })
})

describe('shiftAnchor', () => {
  it('steps a whole window forwards', () => {
    expect(shiftAnchor(day('2026-09-24'), 1)).toBe(day('2026-09-27'))
  })

  it('steps a whole window backwards', () => {
    expect(shiftAnchor(day('2026-09-24'), -1)).toBe(day('2026-09-21'))
  })

  it('abuts the window it came from, forwards', () => {
    const anchor = day('2026-09-24')

    expect(windowOf(shiftAnchor(anchor, 1)).first).toBe(addDays(windowOf(anchor).last, 1))
  })

  it('abuts the window it came from, backwards', () => {
    const anchor = day('2026-09-24')

    expect(windowOf(shiftAnchor(anchor, -1)).last).toBe(addDays(windowOf(anchor).first, -1))
  })

  it('returns to where it started', () => {
    expect(shiftAnchor(shiftAnchor(day('2026-09-24'), 1), -1)).toBe(day('2026-09-24'))
  })
})

describe('windowContains', () => {
  const anchor = day('2026-09-24')

  it('holds the anchor and both ends', () => {
    expect(windowContains(anchor, day('2026-09-23'))).toBe(true)
    expect(windowContains(anchor, anchor)).toBe(true)
    expect(windowContains(anchor, day('2026-09-25'))).toBe(true)
  })

  it('holds neither day either side of it', () => {
    expect(windowContains(anchor, day('2026-09-22'))).toBe(false)
    expect(windowContains(anchor, day('2026-09-26'))).toBe(false)
  })
})

describe('formatDayRange', () => {
  it('spells both ends the way a day heading is spelled', () => {
    expect(formatDayRange(day('2026-09-23'), day('2026-09-25'))).toBe('23/09/2026 – 25/09/2026')
  })

  it('does not special-case a range of one day', () => {
    expect(formatDayRange(day('2026-09-23'), day('2026-09-23'))).toBe('23/09/2026 – 23/09/2026')
  })
})
