import { addDays } from './days'

/**
 * Month arithmetic on the same epoch-ms local-midnight day keys `days.ts` uses, so a grid cell and
 * a fetched day are the same value. Weeks start on Monday.
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

export function monthStartOf(dayStart: number): number {
  const at = new Date(dayStart)

  return new Date(at.getFullYear(), at.getMonth(), 1).getTime()
}

export function addMonths(monthStart: number, months: number): number {
  const at = new Date(monthStart)

  // Day 1, not the day the caller held: month lengths differ, so 31 March − 1 month would overflow.
  return new Date(at.getFullYear(), at.getMonth() + months, 1).getTime()
}

/** Monday of the week containing `dayStart`. */
function weekStartOf(dayStart: number): number {
  const weekday = new Date(dayStart).getDay()

  return addDays(dayStart, weekday === 0 ? -6 : 1 - weekday)
}

/** The whole weeks the month falls across — five or six rows of seven local day starts. */
export function monthGrid(monthStart: number): number[][] {
  const first = weekStartOf(monthStart)
  const lastOfMonth = addDays(addMonths(monthStart, 1), -1)
  const weeks: number[][] = []

  for (let start = first; start <= lastOfMonth; start = addDays(start, DAYS_IN_WEEK)) {
    weeks.push(Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, index)))
  }

  return weeks
}

export function isInMonth(dayStart: number, monthStart: number): boolean {
  return monthStartOf(dayStart) === monthStart
}

/** e.g. `September 2026`. */
export function formatMonthHeading(monthStart: number): string {
  const at = new Date(monthStart)

  return `${MONTH_NAMES[at.getMonth()]} ${at.getFullYear()}`
}

