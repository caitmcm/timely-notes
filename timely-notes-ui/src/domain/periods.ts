import type { Note, Period, SpanHours } from '../types'

const HOURS_IN_DAY = 24

function startOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate())
}

/**
 * Splits the local day containing `day` into `24 / spanHours` periods, midnight to midnight. Built
 * from local clock fields rather than millisecond arithmetic, so a DST day still reads that way.
 * Notes are bucketed separately by `assignNotes`.
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

/** Half-open: `start <= now < end`. */
export function isCurrentPeriod(period: Period, now: Date): boolean {
  return period.start.getTime() <= now.getTime() && now.getTime() < period.end.getTime()
}

/** `undefined` when `now` is outside the day. */
export function findCurrentPeriod(periods: Period[], now: Date): Period | undefined {
  return periods.find((period) => isCurrentPeriod(period, now))
}

/**
 * Buckets each note into the period containing its `occursAt` — never `createdAt` — oldest first.
 * Pure: returns new `Period` objects. Sorts by instant rather than trusting the wire order, which
 * is newest first.
 */
export function assignNotes(periods: Period[], notes: Note[]): Period[] {
  const ascending = [...notes].sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime())

  return periods.map((period) => ({
    ...period,
    notes: ascending.filter((note) => isCurrentPeriod(period, note.occursAt)),
  }))
}

/** e.g. `18:00`. */
export function formatTimeOfDay(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

export function formatPeriodStart(period: Period): string {
  return formatTimeOfDay(period.start)
}

/** e.g. `18:00 – 21:00`. */
export function formatPeriodLabel(period: Period): string {
  return `${formatTimeOfDay(period.start)} – ${formatTimeOfDay(period.end)}`
}

/** e.g. `25/08/2026`. */
export function formatDayHeading(day: Date): string {
  const date = String(day.getDate()).padStart(2, '0')
  const month = String(day.getMonth() + 1).padStart(2, '0')

  return `${date}/${month}/${day.getFullYear()}`
}

export function nextDay(day: Date): Date {
  const midnight = startOfDay(day)

  return new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + 1)
}
