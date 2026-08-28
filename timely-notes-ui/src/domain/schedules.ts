import type { Schedule } from '../types'

/** Known statically: there are no Schedule endpoints, and the short name is the span identifier. */
export const SCHEDULES: readonly Schedule[] = [
  { shortName: 's1', spanHours: 1, label: '1h' },
  { shortName: 's3', spanHours: 3, label: '3h' },
  { shortName: 's6', spanHours: 6, label: '6h' },
]

export const DEFAULT_SCHEDULE: Schedule = SCHEDULES[1]
