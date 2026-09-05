import type { DayKey } from '../types'

/**
 * A day is the string `2026-09-05` — the same value the wire carries — so nothing is parsed on the
 * way in or formatted on the way out. Equality and ordering are lexicographic, which is correct
 * because the format is fixed-width ISO, and identical in every timezone.
 */

const KEY_FORMAT = /^\d{4}-\d{2}-\d{2}$/

const pad = (value: number) => String(value).padStart(2, '0')

/** The one clock-to-calendar conversion in the app: which local day the wall clock is on. */
export function dayKeyOf(at: Date): DayKey {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` as DayKey
}

/** The only way in for a day from outside — the wire, a data attribute, a test. */
export function toDayKey(value: string): DayKey {
  if (!KEY_FORMAT.test(value)) {
    throw new Error(`Not a day: ${value}. Expected YYYY-MM-DD.`)
  }

  return value as DayKey
}

/**
 * The only place in this file a `DayKey` becomes a `Date`, and it goes through local clock fields
 * rather than 86 400 000 ms, so a daylight-saving day still lands on the next date.
 */
export function addDays(day: DayKey, days: number): DayKey {
  const [year, month, date] = day.split('-').map(Number)

  return dayKeyOf(new Date(year, month - 1, date + days))
}

/** Inclusive at both ends; empty when `last` is before `first`. */
export function eachDay(first: DayKey, last: DayKey): DayKey[] {
  const days: DayKey[] = []

  for (let day = first; day <= last; day = addDays(day, 1)) {
    days.push(day)
  }

  return days
}

/** Sorted, then split on every gap — so a run never spans a day already held. */
export function contiguousRuns(days: DayKey[]): DayKey[][] {
  const sorted = [...days].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  return sorted.reduce<DayKey[][]>((runs, day) => {
    const run = runs.at(-1)

    if (run && addDays(run[run.length - 1], 1) === day) {
      run.push(day)
    } else {
      runs.push([day])
    }

    return runs
  }, [])
}

/** Splits a run into requestable chunks, so no window exceeds the server's maximum range. */
export function chunkRun(run: DayKey[], maxDays: number): DayKey[][] {
  const chunks: DayKey[][] = []

  for (let index = 0; index < run.length; index += maxDays) {
    chunks.push(run.slice(index, index + maxDays))
  }

  return chunks
}
