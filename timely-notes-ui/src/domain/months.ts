import { addDays } from './days'
import type { DayKey } from '../types'

/**
 * Month arithmetic on the same `DayKey`s `days.ts` uses, so a grid cell and a fetched day are the
 * same value. Only `weekStartOf` needs a `Date`, and only to ask which weekday a day is. Weeks
 * start on Monday.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAYS_IN_WEEK = 7
const MONTHS_IN_YEAR = 12

const pad = (value: number) => String(value).padStart(2, '0')

const yearOf = (day: DayKey) => Number(day.slice(0, 4))
/** 0-based, to match `MONTH_NAMES` and `Date`. */
const monthOf = (day: DayKey) => Number(day.slice(5, 7)) - 1

export function dayOfMonth(day: DayKey): number {
  return Number(day.slice(8))
}

export function monthStartOf(day: DayKey): DayKey {
  return `${day.slice(0, 8)}01` as DayKey
}

export function addMonths(monthStart: DayKey, months: number): DayKey {
  const total = yearOf(monthStart) * MONTHS_IN_YEAR + monthOf(monthStart) + months
  const year = Math.floor(total / MONTHS_IN_YEAR)

  // Always day 1, never the day the caller held: month lengths differ, so 31 March − 1 would
  // otherwise overflow into March again.
  return `${String(year).padStart(4, '0')}-${pad(total - year * MONTHS_IN_YEAR + 1)}-01` as DayKey
}

/** Monday of the week containing `day`. The one `Date` this file builds, and only for the weekday. */
function weekStartOf(day: DayKey): DayKey {
  const weekday = new Date(yearOf(day), monthOf(day), dayOfMonth(day)).getDay()

  return addDays(day, weekday === 0 ? -6 : 1 - weekday)
}

/** The whole weeks the month falls across — five or six rows of seven days. */
export function monthGrid(monthStart: DayKey): DayKey[][] {
  const first = weekStartOf(monthStart)
  const lastOfMonth = addDays(addMonths(monthStart, 1), -1)
  const weeks: DayKey[][] = []

  for (let start = first; start <= lastOfMonth; start = addDays(start, DAYS_IN_WEEK)) {
    weeks.push(Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, index)))
  }

  return weeks
}

export function isInMonth(day: DayKey, monthStart: DayKey): boolean {
  return monthStartOf(day) === monthStart
}

/** e.g. `September 2026`. */
export function formatMonthHeading(monthStart: DayKey): string {
  return `${MONTH_NAMES[monthOf(monthStart)]} ${yearOf(monthStart)}`
}
