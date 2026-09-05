import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getNoteDaysBySchedule } from '../api/notesApi'
import { addDays } from '../domain/days'
import type { DayKey, Schedule, ScheduleShortName } from '../types'

const NO_COUNTS: ReadonlyMap<DayKey, number> = new Map()

/** Counts by day, plus the grids already answered, tagged with their Schedule. */
interface Cache {
  shortName: ScheduleShortName
  days: ReadonlyMap<DayKey, number>
  grids: ReadonlySet<string>
}

export interface NoteDays {
  countFor: (day: DayKey) => number
  isLoading: boolean
  error: string | null
}

const gridKey = (gridFrom: DayKey, gridTo: DayKey) => `${gridFrom}:${gridTo}`

/**
 * The calendar's markers: one request per grid shown, kept for as long as the Schedule does not
 * change, and none at all while `enabled` is false. `gridFrom`/`gridTo` are inclusive both ends.
 */
export function useNoteDays(
  schedule: Schedule,
  gridFrom: DayKey,
  gridTo: DayKey,
  enabled: boolean,
): NoteDays {
  const [cache, setCache] = useState<Cache>({
    shortName: schedule.shortName,
    days: NO_COUNTS,
    grids: new Set(),
  })
  const [failure, setFailure] = useState<{ shortName: ScheduleShortName; message: string } | null>(
    null,
  )

  const requested = useRef(new Set<string>())
  const signal = useRef<AbortSignal | null>(null)
  const current = useRef(schedule.shortName)

  // Scoped to the Schedule: what is in flight belongs to the Schedule it was asked under.
  useEffect(() => {
    const controller = new AbortController()

    requested.current = new Set()
    signal.current = controller.signal
    current.current = schedule.shortName

    return () => controller.abort()
  }, [schedule.shortName])

  useEffect(() => {
    const { shortName, label } = schedule
    const inFlight = signal.current
    const key = gridKey(gridFrom, gridTo)

    if (!enabled || !inFlight || requested.current.has(key)) {
      return
    }

    requested.current.add(key)

    getNoteDaysBySchedule(shortName, gridFrom, addDays(gridTo, 1), inFlight)
      .then((days) => {
        if (current.current !== shortName) {
          return
        }

        setCache((held) => {
          const kept = held.shortName === shortName ? held : null

          return {
            shortName,
            days: new Map([
              ...(kept?.days ?? NO_COUNTS),
              ...days.map((day) => [day.day, day.count] as const),
            ]),
            grids: new Set([...(kept?.grids ?? []), key]),
          }
        })
      })
      .catch(() => {
        // Un-marked, so the grid is asked for again the next time it is shown.
        requested.current.delete(key)

        if (inFlight.aborted) {
          return
        }

        setFailure({ shortName, message: `Could not load the calendar for the ${label} schedule.` })
      })
  }, [schedule, gridFrom, gridTo, enabled])

  const held = cache.shortName === schedule.shortName ? cache : null
  const days = held?.days ?? NO_COUNTS

  const countFor = useCallback((day: DayKey) => days.get(day) ?? 0, [days])
  const isLoading = enabled && !held?.grids.has(gridKey(gridFrom, gridTo))
  const error = failure?.shortName === schedule.shortName ? failure.message : null

  return useMemo(() => ({ countFor, isLoading, error }), [countFor, isLoading, error])
}
