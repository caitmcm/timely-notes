import { toDayKey } from '../domain/days'
import { formatPeriodAddress } from '../domain/periods'
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

/**
 * The note's address: a `DayKey` is already the wire form and `p4` is path-safe as written, so
 * nothing here is converted and nothing is encoded.
 */
function noteUrl(shortName: ScheduleShortName, day: DayKey, ordinal: number): string {
  return `${apiBaseUrl()}/api/schedules/${shortName}/notes/${day}/${formatPeriodAddress(ordinal)}`
}

/**
 * Writes the note in that period — one idempotent call, whether or not a note is there already, so
 * the client has no create-or-update branch and a repeat is harmless.
 */
export async function saveNote(
  shortName: ScheduleShortName,
  day: DayKey,
  ordinal: number,
  content: string,
  signal: AbortSignal,
): Promise<Note> {
  const response = await fetch(noteUrl(shortName, day, ordinal), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to save note ${day}/p${ordinal}: ${response.status}`)
  }

  return toNote(await response.json())
}

/**
 * Removes the note in that period. `signal` is optional — the exception in this file — because the
 * closing delete is issued *as* its caller is torn down, and a signal would cancel it.
 */
export async function deleteNote(
  shortName: ScheduleShortName,
  day: DayKey,
  ordinal: number,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(noteUrl(shortName, day, ordinal), { method: 'DELETE', signal })

  // A 404 is the outcome asked for: the note is already gone.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete note ${day}/p${ordinal}: ${response.status}`)
  }
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
