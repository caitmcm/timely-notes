import type { Note, Period, SpanHours } from '../types'

const HOURS_IN_DAY = 24

/** Local midnight on the day the given instant falls in. */
function startOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate())
}

/**
 * Splits the local day containing `day` into `24 / spanHours` consecutive periods, the first
 * starting at local midnight and the last ending at the next. Periods come back without notes —
 * bucketing is `assignNotes`' job.
 *
 * Built from local clock fields rather than millisecond arithmetic, so a DST day still reads as
 * midnight-to-midnight in the gutter.
 */
export function buildPeriods(day: Date, spanHours: SpanHours): Period[] {
  const midnight = startOfDay(day)
  const boundary = (hour: number) =>
    new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), hour)

  return Array.from({ length: HOURS_IN_DAY / spanHours }, (_, index) => ({
    start: boundary(index * spanHours),
    end: boundary((index + 1) * spanHours),
    notes: [],
  }))
}

/** Whether `now` falls in this period's half-open range: `start <= now < end`. */
export function isCurrentPeriod(period: Period, now: Date): boolean {
  return period.start.getTime() <= now.getTime() && now.getTime() < period.end.getTime()
}

/** The one period containing `now`, or `undefined` when `now` is outside the day. */
export function findCurrentPeriod(periods: Period[], now: Date): Period | undefined {
  return periods.find((period) => isCurrentPeriod(period, now))
}

/**
 * Buckets each note into the period whose half-open range contains its `occursAt`, oldest-first
 * within each period. Pure: returns new `Period` objects and leaves both inputs untouched.
 *
 * Placement is `occursAt` — the slot the note was written *for* — never `createdAt`, which only
 * records when it was typed: a note written today for last Tuesday belongs to last Tuesday.
 *
 * The API returns notes newest-first and stamps them with an offset, so this sorts by instant
 * rather than trusting the wire order.
 */
export function assignNotes(periods: Period[], notes: Note[]): Period[] {
  const ascending = [...notes].sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime())

  return periods.map((period) => ({
    ...period,
    notes: ascending.filter((note) => isCurrentPeriod(period, note.occursAt)),
  }))
}

/** A time of day as a zero-padded 24-hour clock reading, e.g. `18:00`. */
export function formatTimeOfDay(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/** The gutter label: the period's start time only, e.g. `18:00`. */
export function formatPeriodStart(period: Period): string {
  return formatTimeOfDay(period.start)
}

/** The full range, e.g. `18:00 – 21:00` — the dialog title and the row's accessible name. */
export function formatPeriodLabel(period: Period): string {
  return `${formatTimeOfDay(period.start)} – ${formatTimeOfDay(period.end)}`
}

/** A day heading, e.g. `25/08/2026`. */
export function formatDayHeading(day: Date): string {
  const date = String(day.getDate()).padStart(2, '0')
  const month = String(day.getMonth() + 1).padStart(2, '0')

  return `${date}/${month}/${day.getFullYear()}`
}

/** Local midnight on the day after `day` — the view's closing boundary row. */
export function nextDay(day: Date): Date {
  const midnight = startOfDay(day)

  return new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + 1)
}
