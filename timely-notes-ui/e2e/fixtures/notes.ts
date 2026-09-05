/**
 * Fixtures in **wire shape** — ISO strings carrying an offset, exactly as `NoteResponse` and
 * `NoteDayResponse` serialise — because they are fed to `route.fulfill`, not to a component.
 *
 * Every instant is written literally in `Europe/London` (`+01:00` through July and August 2026),
 * never derived from a `Date` built in the test process: `timezoneId` pins the browser's zone, not
 * Node's. `createdAt` is 28/08 throughout, so "placed by `occursAt`, never `createdAt`" is asserted
 * in the browser too.
 */

export interface WireNote {
  id: string
  content: string
  occursAt: string
  createdAt: string
  modifiedAt: string
}

export interface WireNoteDay {
  day: string
  count: number
}

const WRITTEN_AT = '2026-08-28T09:12:00+01:00'

const note = (id: string, occursAt: string, content: string): WireNote => ({
  id,
  content,
  occursAt,
  createdAt: WRITTEN_AT,
  modifiedAt: WRITTEN_AT,
})

/** Newest first, as the API answers. */
const newestFirst = (notes: WireNote[]) =>
  [...notes].sort((a, b) => Date.parse(b.occursAt) - Date.parse(a.occursAt))

/**
 * 25/08 carries the frozen day's notes — two in one period so ordering is assertable, and one whose
 * content is markdown. 26/08 proves a note lands on the day it occurs on rather than the focus day,
 * 24/08 is deliberately empty, and 17/08 is the calendar's jump target: far enough from the frozen
 * day that its three-day window shares nothing with the cached one.
 */
const s3 = newestFirst([
  note('s3-july', '2026-07-15T09:00:00+01:00', 'July: an older note.'),
  note('s3-jump-morning', '2026-08-17T09:00:00+01:00', 'Jump target: the week before.'),
  note('s3-jump-afternoon', '2026-08-17T14:00:00+01:00', 'Jump target: a second note.'),
  note('s3-morning', '2026-08-25T09:00:00+01:00', 'Morning block: drafted the TDD plan.'),
  note('s3-morning-late', '2026-08-25T10:30:00+01:00', 'Second thoughts on the plan.'),
  note('s3-afternoon', '2026-08-25T15:00:00+01:00', 'Afternoon block: wired up FastEndpoints.'),
  note('s3-standup', '2026-08-25T19:30:00+01:00', '# Stand-up\n\nBlocked.'),
  note('s3-next-day', '2026-08-26T09:00:00+01:00', 'Tomorrow: review the schedule.'),
])

const s1 = [note('s1-morning', '2026-08-25T09:00:00+01:00', 'Hourly: one small thing.')]
const s6 = [note('s6-morning', '2026-08-25T09:00:00+01:00', 'Six-hourly: the long block.')]

export const NOTES: Record<string, WireNote[]> = { s1, s3, s6 }

/** The date part of an offset-carrying instant, which is its local day in that offset. */
const dayOf = (instant: string) => instant.slice(0, 10)

/** Counts derived from the notes themselves, so a marker can never disagree with a row. */
export function noteDaysFor(notes: WireNote[]): WireNoteDay[] {
  const counts = new Map<string, number>()

  for (const entry of notes) {
    const day = dayOf(entry.occursAt)
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, count]) => ({ day: `${day}T00:00:00+01:00`, count }))
}

/** Whether an instant falls in the half-open window the caller asked for. */
export function inWindow(instant: string, searchFrom: string, searchTo: string): boolean {
  const at = Date.parse(instant)

  return at >= Date.parse(searchFrom) && at < Date.parse(searchTo)
}

/** The instant the `FrontendSkeleton` mockup is drawn at — every stubbed spec's frozen clock. */
export const FROZEN_NOW = new Date('2026-08-25T20:20:00+01:00')
