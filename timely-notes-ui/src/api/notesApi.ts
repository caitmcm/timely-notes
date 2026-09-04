import { dayStartOf } from '../domain/days'
import type { Note, ScheduleShortName } from '../types'

/** Mirrors the API's `NoteResponse`. */
interface NoteResponse {
  id: string
  content: string
  occursAt: string
  createdAt: string
  modifiedAt: string
}

function toNote(response: NoteResponse): Note {
  return {
    id: response.id,
    content: response.content,
    occursAt: new Date(response.occursAt),
    createdAt: new Date(response.createdAt),
    modifiedAt: new Date(response.modifiedAt),
  }
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * An instant carrying the browser's UTC offset, e.g. `2026-08-27T00:00:00+01:00`. The bounds are
 * *local* midnights and the offset is what says so, which `toISOString`'s UTC would lose.
 */
function toOffsetIso(at: Date): string {
  const offsetMinutes = -at.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)

  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  )
}

/**
 * Notes whose `occursAt` is in the half-open window `[searchFrom, searchTo)`; the server rejects a
 * window wider than 7 days. `signal` is required so a request can't outlive its effect.
 */
export async function getNotesBySchedule(
  shortName: ScheduleShortName,
  searchFrom: Date,
  searchTo: Date,
  signal: AbortSignal,
): Promise<Note[]> {
  // URLSearchParams, not interpolation: a raw `+` in a query string means a space.
  const query = new URLSearchParams({
    searchFrom: toOffsetIso(searchFrom),
    searchTo: toOffsetIso(searchTo),
  })

  const response = await fetch(`/api/schedules/${shortName}/notes?${query}`, { signal })

  if (!response.ok) {
    throw new Error(`Failed to load notes for schedule ${shortName}: ${response.status}`)
  }

  const payload: NoteResponse[] = await response.json()

  return payload.map(toNote)
}

/** Mirrors the API's `NoteDayResponse`; `day` is midnight carrying the offset we asked in. */
interface NoteDayResponse {
  day: string
  count: number
}

/** How many notes fall on a day, keyed by the same local day start the note cache uses. */
export interface NoteDay {
  dayStart: number
  count: number
}

/**
 * Per-day note counts over the half-open window `[searchFrom, searchTo)`; the server rejects a
 * window wider than 42 days. Days with no notes are absent rather than zero.
 */
export async function getNoteDaysBySchedule(
  shortName: ScheduleShortName,
  searchFrom: Date,
  searchTo: Date,
  signal: AbortSignal,
): Promise<NoteDay[]> {
  const query = new URLSearchParams({
    searchFrom: toOffsetIso(searchFrom),
    searchTo: toOffsetIso(searchTo),
  })

  const response = await fetch(`/api/schedules/${shortName}/note-days?${query}`, { signal })

  if (!response.ok) {
    throw new Error(`Failed to load note days for schedule ${shortName}: ${response.status}`)
  }

  const payload: NoteDayResponse[] = await response.json()

  return payload.map((entry) => ({ dayStart: dayStartOf(new Date(entry.day)), count: entry.count }))
}
