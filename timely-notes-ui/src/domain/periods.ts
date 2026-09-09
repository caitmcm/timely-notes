import { dayKeyOf } from './days'
import type { DayKey, Note, Period, SpanHours } from '../types'

const HOURS_IN_DAY = 24

const pad = (value: number) => String(value).padStart(2, '0')

/** The `24 / spanHours` blocks of any day, numbered from 1. A period carries no date and no time. */
export function buildPeriods(spanHours: SpanHours): Period[] {
  return Array.from({ length: HOURS_IN_DAY / spanHours }, (_, index) => ({
    ordinal: index + 1,
    note: null,
  }))
}

/** Which period of its own day the instant falls in: 1 at 00:00, `24 / spanHours` at 23:59. */
export function ordinalOf(at: Date, spanHours: SpanHours): number {
  return Math.floor(at.getHours() / spanHours) + 1
}

export function isCurrentPeriod(
  period: Period,
  day: DayKey,
  now: Date,
  spanHours: SpanHours,
): boolean {
  return day === dayKeyOf(now) && period.ordinal === ordinalOf(now, spanHours)
}

/** `undefined` when `now` is not on `day`. */
export function findCurrentPeriod(
  periods: Period[],
  day: DayKey,
  now: Date,
  spanHours: SpanHours,
): Period | undefined {
  return periods.find((period) => isCurrentPeriod(period, day, now, spanHours))
}

/**
 * Gives each period the one note addressed to it — a lookup on `(day, ordinal)`, not a search.
 * Notes for another day are ignored, and a duplicated ordinal degrades to the last one rather than
 * throwing: the type holds one note, so there is nowhere for a second to go.
 */
export function assignNotes(periods: Period[], day: DayKey, notes: Note[]): Period[] {
  const byOrdinal = new Map<number, Note>()

  for (const note of notes) {
    if (note.day === day) {
      byOrdinal.set(note.ordinal, note)
    }
  }

  return periods.map((period) => ({ ...period, note: byOrdinal.get(period.ordinal) ?? null }))
}

/** e.g. `18:00`. */
export function formatPeriodStart(period: Period, spanHours: SpanHours): string {
  return `${pad((period.ordinal - 1) * spanHours)}:00`
}

/** e.g. `18:00 – 21:00`; the last period of the day ends at `00:00`. */
export function formatPeriodLabel(period: Period, spanHours: SpanHours): string {
  const end = (period.ordinal * spanHours) % HOURS_IN_DAY

  return `${formatPeriodStart(period, spanHours)} – ${pad(end)}:00`
}

/** e.g. `25/08/2026`. */
export function formatDayHeading(day: DayKey): string {
  return `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
}

/** e.g. `12:03`. The instant's own local fields, so it reads as the wall clock does. */
export function formatTimeOfDay(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/**
 * A period as it is spelled on the wire: `p4`. The client's mirror of the server's `Periods.Format`,
 * and the one place the sigil is written — the server accepts this spelling and no other.
 */
export function formatPeriodAddress(ordinal: number): string {
  return `p${ordinal}`
}
