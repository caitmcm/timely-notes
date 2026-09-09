import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getNotesBySchedule } from '../api/notesApi'
import { addDays, chunkRun, contiguousRuns, eachDay } from '../domain/days'
import { isBlank } from '../domain/notes'
import type { DayKey, Note, Schedule, ScheduleShortName } from '../types'

/** Days per request: inside the server's 7-day maximum, with room for a rounding mistake. */
const MAX_REQUEST_DAYS = 5

const NO_NOTES: Note[] = []
const NO_DAYS: ReadonlyMap<DayKey, Note[]> = new Map()

/** Notes by day, tagged with the Schedule they belong to — one is never read for another. */
interface Cache {
  shortName: ScheduleShortName
  days: ReadonlyMap<DayKey, Note[]>
}

export interface ScheduleNotes {
  notesFor: (day: DayKey) => Note[]
  /** False while a day is still in flight; a day that came back empty is loaded, not missing. */
  isLoaded: (day: DayKey) => boolean
  error: string | null
  /** Puts a written note in its day's bucket, replacing whatever that period held. No refetch. */
  applyNote: (note: Note) => void
  /** Takes a deleted note out of its bucket. No refetch. */
  removeNote: (day: DayKey, ordinal: number) => void
}

function bucketByDay(days: DayKey[], notes: Note[]): Map<DayKey, Note[]> {
  const buckets = new Map(days.map((day) => [day, [] as Note[]]))

  for (const note of notes) {
    buckets.get(note.day)?.push(note)
  }

  return buckets
}

/**
 * The scrolling view's note store: every day between `wantFrom` and `wantTo` (inclusive) is fetched
 * once and kept, so scrolling back over ground already covered costs nothing. Missing days are
 * grouped into contiguous runs and chunked, so a cached gap is never spanned and no window exceeds
 * the server's cap.
 */
export function useScheduleNotes(
  schedule: Schedule,
  wantFrom: DayKey,
  wantTo: DayKey,
): ScheduleNotes {
  const [cache, setCache] = useState<Cache>({ shortName: schedule.shortName, days: NO_DAYS })
  const [failure, setFailure] = useState<{ shortName: ScheduleShortName; message: string } | null>(
    null,
  )

  const requested = useRef(new Set<DayKey>())
  const signal = useRef<AbortSignal | null>(null)
  const current = useRef(schedule.shortName)

  // Scoped to the Schedule, not to the range: a range change is what *starts* requests, so tying
  // the controller to it would abort the prefetch it just asked for.
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

    if (!inFlight) {
      return
    }

    const asked = requested.current
    const missing = eachDay(wantFrom, wantTo).filter((day) => !asked.has(day))

    missing.forEach((day) => asked.add(day))

    for (const run of contiguousRuns(missing)) {
      for (const chunk of chunkRun(run, MAX_REQUEST_DAYS)) {
        // Half-open, so the window ends the day after the last one wanted.
        const searchTo = addDays(chunk[chunk.length - 1], 1)

        getNotesBySchedule(shortName, chunk[0], searchTo, inFlight)
          .then((notes) => {
            if (current.current !== shortName) {
              return
            }

            setCache((held) => ({
              shortName,
              days: new Map([
                ...(held.shortName === shortName ? held.days : NO_DAYS),
                ...bucketByDay(chunk, notes),
              ]),
            }))
          })
          .catch(() => {
            // Un-mark them: a failed day is missing again, and the next range change retries it.
            chunk.forEach((day) => asked.delete(day))

            if (inFlight.aborted) {
              return
            }

            setFailure({ shortName, message: `Could not load notes for the ${label} schedule.` })
          })
      }
    }
  }, [schedule, wantFrom, wantTo])

  const days = cache.shortName === schedule.shortName ? cache.days : NO_DAYS

  // A blank note is never rendered, wherever it came from: the empty PUT this session made is
  // what clears the row, with no wait on the DELETE and no refetch.
  const notesFor = useCallback(
    (day: DayKey) => (days.get(day) ?? NO_NOTES).filter((note) => !isBlank(note.content)),
    [days],
  )
  const isLoaded = useCallback((day: DayKey) => days.has(day), [days])
  const error = failure?.shortName === schedule.shortName ? failure.message : null

  /** Rewrites one day's bucket. A day that is not cached is left alone: it is fetched complete. */
  const editDay = useCallback(
    (day: DayKey, edit: (notes: Note[]) => Note[]) =>
      setCache((held) => {
        const bucket = held.days.get(day)

        if (!bucket) {
          return held
        }

        return { ...held, days: new Map([...held.days, [day, edit(bucket)]]) }
      }),
    [],
  )

  const applyNote = useCallback(
    (note: Note) =>
      editDay(note.day, (notes) => [
        ...notes.filter((held) => held.ordinal !== note.ordinal),
        note,
      ]),
    [editDay],
  )

  const removeNote = useCallback(
    (day: DayKey, ordinal: number) =>
      editDay(day, (notes) => notes.filter((held) => held.ordinal !== ordinal)),
    [editDay],
  )

  return useMemo(
    () => ({ notesFor, isLoaded, error, applyNote, removeNote }),
    [notesFor, isLoaded, error, applyNote, removeNote],
  )
}
