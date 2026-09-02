import { addDays, chunkRun, contiguousRuns, dayKeyOf, dayStartOf, eachDay } from './days'

const day = (year: number, month: number, date: number) => new Date(year, month, date).getTime()

describe('dayStartOf', () => {
  it('is the local midnight containing the instant', () => {
    expect(dayStartOf(new Date(2026, 7, 25, 20, 20, 13))).toBe(day(2026, 7, 25))
  })

  it('keeps midnight itself on its own day', () => {
    expect(dayStartOf(new Date(2026, 7, 25))).toBe(day(2026, 7, 25))
  })
})

describe('addDays', () => {
  it('moves forwards and backwards', () => {
    expect(addDays(day(2026, 7, 25), 1)).toBe(day(2026, 7, 26))
    expect(addDays(day(2026, 7, 25), -3)).toBe(day(2026, 7, 22))
  })

  it('crosses a month end', () => {
    expect(addDays(day(2026, 7, 31), 1)).toBe(day(2026, 8, 1))
  })

  // Built from local clock fields, not 86 400 000 ms: a DST day is 23 or 25 hours long.
  it('lands on local midnight across a daylight-saving change', () => {
    const result = new Date(addDays(day(2026, 2, 28), 2))

    expect(result.getHours()).toBe(0)
    expect(result.getDate()).toBe(30)
  })
})

describe('eachDay', () => {
  it('is inclusive at both ends', () => {
    expect(eachDay(day(2026, 7, 25), day(2026, 7, 27))).toEqual([
      day(2026, 7, 25),
      day(2026, 7, 26),
      day(2026, 7, 27),
    ])
  })

  it('returns the single day when both ends are the same', () => {
    expect(eachDay(day(2026, 7, 25), day(2026, 7, 25))).toEqual([day(2026, 7, 25)])
  })

  it('returns nothing when the range is inverted', () => {
    expect(eachDay(day(2026, 7, 25), day(2026, 7, 24))).toEqual([])
  })
})

describe('contiguousRuns', () => {
  it('groups adjacent days into one run', () => {
    const days = [day(2026, 7, 25), day(2026, 7, 26), day(2026, 7, 27)]

    expect(contiguousRuns(days)).toEqual([days])
  })

  it('splits on a gap, so a cached day is never spanned', () => {
    const runs = contiguousRuns([day(2026, 7, 25), day(2026, 7, 26), day(2026, 7, 29)])

    expect(runs).toEqual([[day(2026, 7, 25), day(2026, 7, 26)], [day(2026, 7, 29)]])
  })

  it('sorts before grouping', () => {
    const runs = contiguousRuns([day(2026, 7, 27), day(2026, 7, 25), day(2026, 7, 26)])

    expect(runs).toEqual([[day(2026, 7, 25), day(2026, 7, 26), day(2026, 7, 27)]])
  })

  it('returns nothing for no days', () => {
    expect(contiguousRuns([])).toEqual([])
  })
})

describe('chunkRun', () => {
  it('leaves a run shorter than the maximum whole', () => {
    const run = eachDay(day(2026, 7, 25), day(2026, 7, 27))

    expect(chunkRun(run, 5)).toEqual([run])
  })

  it('splits a longer run into chunks of at most the maximum, covering it exactly once', () => {
    const run = eachDay(day(2026, 7, 20), day(2026, 7, 31))

    const chunks = chunkRun(run, 5)

    expect(chunks.map((chunk) => chunk.length)).toEqual([5, 5, 2])
    expect(chunks.flat()).toEqual(run)
  })
})

describe('dayKeyOf', () => {
  it('buckets a note by the local day its instant falls in', () => {
    expect(dayKeyOf(new Date(2026, 7, 25, 23, 59))).toBe(day(2026, 7, 25))
    expect(dayKeyOf(new Date(2026, 7, 26, 0, 1))).toBe(day(2026, 7, 26))
  })
})
