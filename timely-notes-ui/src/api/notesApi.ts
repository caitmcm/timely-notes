import type { Note, ScheduleShortName } from '../types'

/** A note exactly as it arrives on the wire — mirrors the API's `NoteResponse`. */
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
 * An ISO 8601 instant carrying the browser's UTC offset, e.g. `2026-08-27T00:00:00+01:00`.
 *
 * `toISOString` would send the same instant as UTC, which the server would read identically — but
 * the bounds are *local* midnights, and keeping the offset on the wire says so. The server has no
 * idea what timezone the caller is in, so the offset is the only thing that makes the window
 * meaningful.
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
 * Lists the notes belonging to a Schedule whose `occursAt` falls in the half-open window
 * `[searchFrom, searchTo)` — `searchFrom` inclusive, `searchTo` exclusive, so adjacent windows never
 * return the same note twice. The server rejects a window wider than 7 days.
 *
 * Calls the API same-origin — Vite's dev proxy forwards `/api` to the backend.
 *
 * `signal` is required rather than optional: the frontend mirror of the backend's "always pass the
 * cancellation token" rule, so an in-flight request can't outlive the effect that started it.
 */
export async function getNotesBySchedule(
  shortName: ScheduleShortName,
  searchFrom: Date,
  searchTo: Date,
  signal: AbortSignal,
): Promise<Note[]> {
  // URLSearchParams, not string interpolation: a raw `+` in a query string means a space.
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
