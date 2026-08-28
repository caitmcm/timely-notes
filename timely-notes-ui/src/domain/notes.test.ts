import { noteExcerpt, occursAtFor } from './notes'
import { buildPeriods } from './periods'

describe('noteExcerpt', () => {
  it('uses the first non-empty line', () => {
    expect(noteExcerpt('\n\nMorning block: drafted the TDD plan.')).toBe(
      'Morning block: drafted the TDD plan.',
    )
  })

  it('strips markdown heading markers', () => {
    expect(noteExcerpt('# Stand-up\n\nBlocked on the notes endpoint.')).toBe('Stand-up')
  })

  it('strips list and quote markers', () => {
    expect(noteExcerpt('- Review the design doc')).toBe('Review the design doc')
    expect(noteExcerpt('> quoted')).toBe('quoted')
  })

  it('collapses runs of whitespace', () => {
    expect(noteExcerpt('two    spaces\there')).toBe('two spaces here')
  })

  it('truncates long content with an ellipsis', () => {
    expect(noteExcerpt('x'.repeat(60), 10)).toBe('xxxxxxxxxx…')
  })

  it('leaves content at the limit untruncated', () => {
    expect(noteExcerpt('x'.repeat(10), 10)).toBe('xxxxxxxxxx')
  })

  it('describes an empty note rather than returning nothing', () => {
    expect(noteExcerpt('   \n  ')).toBe('Empty note')
  })
})

describe('occursAtFor', () => {
  const periods = buildPeriods(new Date(2026, 7, 25), 3)
  const live = periods[6]

  it('stamps the real time of day when the slot is the live one', () => {
    const now = new Date(2026, 7, 25, 20, 20)

    expect(occursAtFor(live, now)).toEqual(now)
  })

  it('stamps the slot start for a past slot', () => {
    expect(occursAtFor(periods[2], new Date(2026, 7, 25, 20, 20))).toEqual(
      new Date(2026, 7, 25, 6),
    )
  })

  it('stamps the slot start for a future slot', () => {
    expect(occursAtFor(periods[7], new Date(2026, 7, 25, 20, 20))).toEqual(
      new Date(2026, 7, 25, 21),
    )
  })

  it('stamps the slot start when now is on another day entirely', () => {
    expect(occursAtFor(live, new Date(2026, 7, 26, 20, 20))).toEqual(new Date(2026, 7, 25, 18))
  })

  it('follows the half-open rule: start is inside the slot, end is not', () => {
    expect(occursAtFor(live, live.start)).toEqual(live.start)
    expect(occursAtFor(live, live.end)).toEqual(live.start)
    expect(occursAtFor(periods[7], live.end)).toEqual(live.end)
  })
})
