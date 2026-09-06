import { toDayKey } from '../domain/days'
import type { DayKey, Note, ScheduleShortName } from '../types'

/**
 * Empty in dev, where the Vite proxy serves `/api` same-origin; the API's origin once the two are
 * deployed apart. Read per call so a test can stub it.
 */
function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
}

/** Mirrors the API's `NoteResponse`. */
interface NoteResponse {
  day: string
  periodOrdinal: number
  content: string
  createdAt: string
  modifiedAt: string
}

function toNote(response: NoteResponse): Note {
  return {
    day: toDayKey(response.day),
    ordinal: response.periodOrdinal,
    content: response.content,
    createdAt: new Date(response.createdAt),
    modifiedAt: new Date(response.modifiedAt),
  }
}

/**
 * Notes whose day is in the half-open window `[searchFrom, searchTo)`; the server rejects a window
 * wider than 7 days. `signal` is required so a request can't outlive its effect.
 */
export async function getNotesBySchedule(
  shortName: ScheduleShortName,
  searchFrom: DayKey,
  searchTo: DayKey,
  signal: AbortSignal,
): Promise<Note[]> {
  const query = new URLSearchParams({ searchFrom, searchTo })

  const response = await fetch(`${apiBaseUrl()}/api/schedules/${shortName}/notes?${query}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to load notes for schedule ${shortName}: ${response.status}`)
  }

  const payload: NoteResponse[] = await response.json()

  return payload.map(toNote)
}

/** Mirrors the API's `NoteDayResponse`. */
interface NoteDayResponse {
  day: string
  count: number
}

export interface NoteDay {
  day: DayKey
  count: number
}

/**
 * Per-day note counts over the half-open window `[searchFrom, searchTo)`; the server rejects a
 * window wider than 42 days. Days with no notes are absent rather than zero.
 */
export async function getNoteDaysBySchedule(
  shortName: ScheduleShortName,
  searchFrom: DayKey,
  searchTo: DayKey,
  signal: AbortSignal,
): Promise<NoteDay[]> {
  const query = new URLSearchParams({ searchFrom, searchTo })

  const response = await fetch(`${apiBaseUrl()}/api/schedules/${shortName}/note-days?${query}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to load note days for schedule ${shortName}: ${response.status}`)
  }

  const payload: NoteDayResponse[] = await response.json()

  return payload.map((entry) => ({ day: toDayKey(entry.day), count: entry.count }))
}
