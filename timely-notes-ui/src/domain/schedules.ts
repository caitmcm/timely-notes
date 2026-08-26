import type { Schedule } from '../types'

/**
 * The selectable Schedules, ordered by span. There are no Schedule endpoints yet and the short
 * name *is* the spanning-period identifier, so the three options are known statically.
 */
export const SCHEDULES: readonly Schedule[] = [
  { shortName: 's1', spanHours: 1, label: '1h' },
  { shortName: 's3', spanHours: 3, label: '3h' },
  { shortName: 's6', spanHours: 6, label: '6h' },
]

/** The Schedule the app lands on. */
export const DEFAULT_SCHEDULE: Schedule = SCHEDULES[1]
