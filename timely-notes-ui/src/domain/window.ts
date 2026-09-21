import { addDays } from './days'
import { formatDayHeading } from './periods'
import type { DayKey } from '../types'

/**
 * The three days on screen, as a centre and the arithmetic around it. The window is a position,
 * not a range: everything here is derived from one anchor, so nothing can drift out of step.
 */

/** The width of the window, and therefore the size of one step. */
export const WINDOW_DAYS = 3

/** Days either side of the anchor. */
const NEIGHBOUR_DAYS = (WINDOW_DAYS - 1) / 2

export interface DayWindow {
  first: DayKey
  last: DayKey
}

export function windowOf(anchor: DayKey): DayWindow {
  return { first: addDays(anchor, -NEIGHBOUR_DAYS), last: addDays(anchor, NEIGHBOUR_DAYS) }
}

/** `direction` is `1` or `-1`; consecutive windows abut, with no overlap and no gap. */
export function shiftAnchor(anchor: DayKey, direction: 1 | -1): DayKey {
  return addDays(anchor, direction * WINDOW_DAYS)
}

export function windowContains(anchor: DayKey, day: DayKey): boolean {
  const { first, last } = windowOf(anchor)

  return first <= day && day <= last
}

/** e.g. `23/09/2026 – 25/09/2026`; the en dash is `formatPeriodLabel`'s. */
export function formatDayRange(first: DayKey, last: DayKey): string {
  return `${formatDayHeading(first)} – ${formatDayHeading(last)}`
}
