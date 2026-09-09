/**
 * Fixtures in **wire shape** — exactly as `NoteResponse` and `NoteDayResponse` serialise — because
 * they are fed to `route.fulfill`, not to a component. A note is addressed by its day and its
 * period, so no instant is written here at all beyond the two audit stamps, and those are 28/08
 * throughout so "placed by the period, never by an audit stamp" is asserted in the browser too.
 *
 * The ordinals below are `s3`'s: `p4` is 09:00–12:00, `p5` 12:00–15:00, `p6` 15:00–18:00 and `p7`
 * 18:00–21:00. No two notes of one Schedule share a period.
 */

export interface WireNote {
  day: string
  periodOrdinal: number
  content: string
  createdAt: string
  modifiedAt: string
}

export interface WireNoteDay {
  day: string
  count: number
}

/** The audit stamp every fixture note carries — a different day from any note's own. */
export const WRITTEN_AT = '2026-08-28T09:12:00+01:00'

const note = (day: string, periodOrdinal: number, content: string): WireNote => ({
  day,
  periodOrdinal,
  content,
  createdAt: WRITTEN_AT,
  modifiedAt: WRITTEN_AT,
})

/** Newest first, as the API answers: by day, then by period. */
const newestFirst = (notes: WireNote[]) =>
  [...notes].sort((a, b) => b.day.localeCompare(a.day) || b.periodOrdinal - a.periodOrdinal)

/**
 * 25/08 carries the frozen day's notes — three periods filled, one of them markdown. 26/08 proves a
 * note lands on the day it is addressed to rather than the focus day, 24/08 is deliberately empty,
 * and 17/08 is the calendar's jump target: far enough from the frozen day that its three-day window
 * shares nothing with the cached one.
 */
const s3 = newestFirst([
  note('2026-07-15', 4, 'July: an older note.'),
  note('2026-08-17', 4, 'Jump target: the week before.'),
  note('2026-08-17', 5, 'Jump target: a second note.'),
  note('2026-08-25', 4, 'Morning block: drafted the TDD plan.'),
  note('2026-08-25', 6, 'Afternoon block: wired up FastEndpoints.'),
  note('2026-08-25', 7, '# Stand-up\n\nBlocked.'),
  note('2026-08-26', 4, 'Tomorrow: review the schedule.'),
])

const s1 = [note('2026-08-25', 10, 'Hourly: one small thing.')]
const s6 = [note('2026-08-25', 2, 'Six-hourly: the long block.')]

export const NOTES: Record<string, WireNote[]> = { s1, s3, s6 }

/** Counts derived from the notes themselves, so a marker can never disagree with a row. */
export function noteDaysFor(notes: WireNote[]): WireNoteDay[] {
  const counts = new Map<string, number>()

  for (const entry of notes) {
    counts.set(entry.day, (counts.get(entry.day) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day, count }))
}

/** Whether a day falls in the half-open window the caller asked for. */
export function inWindow(day: string, searchFrom: string, searchTo: string): boolean {
  return day >= searchFrom && day < searchTo
}

/** The instant the `FrontendSkeleton` mockup is drawn at — every stubbed spec's frozen clock. */
export const FROZEN_NOW = new Date('2026-08-25T20:20:00+01:00')
