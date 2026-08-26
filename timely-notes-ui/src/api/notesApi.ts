import type { Note, ScheduleShortName } from '../types'

/** A note exactly as it arrives on the wire — mirrors the API's `NoteResponse`. */
interface NoteResponse {
  id: string
  content: string
  createdAt: string
  modifiedAt: string
}

function toNote(response: NoteResponse): Note {
  return {
    id: response.id,
    content: response.content,
    createdAt: new Date(response.createdAt),
    modifiedAt: new Date(response.modifiedAt),
  }
}

/**
 * Lists the notes belonging to a Schedule. Calls the API same-origin — Vite's dev proxy forwards
 * `/api` to the backend.
 *
 * `signal` is required rather than optional: the frontend mirror of the backend's "always pass the
 * cancellation token" rule, so an in-flight request can't outlive the effect that started it.
 */
export async function getNotesBySchedule(
  shortName: ScheduleShortName,
  signal: AbortSignal,
): Promise<Note[]> {
  const response = await fetch(`/api/schedules/${shortName}/notes`, { signal })

  if (!response.ok) {
    throw new Error(`Failed to load notes for schedule ${shortName}: ${response.status}`)
  }

  const payload: NoteResponse[] = await response.json()

  return payload.map(toNote)
}
