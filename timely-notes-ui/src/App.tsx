import { useEffect, useMemo, useState } from 'react'
import { getNotesBySchedule } from './api/notesApi'
import { assignNotes, buildPeriods, findCurrentPeriod } from './domain/periods'
import { DEFAULT_SCHEDULE, SCHEDULES } from './domain/schedules'
import SchedulePicker from './components/SchedulePicker'
import ScheduleView from './components/ScheduleView'
import NoteDialog from './components/NoteDialog'
import type { Note, Period, Schedule, ScheduleShortName } from './types'
import './App.css'

interface AppProps {
  /** Injected by tests. Captured once on mount — the view doesn't tick; this slice is today-only. */
  now?: Date
}

interface LoadedNotes {
  shortName: ScheduleShortName
  notes: Note[]
  error: string | null
}

/** Stable identity, so `periods` isn't rebuilt on every render while a fetch is in flight. */
const NO_NOTES: Note[] = []

const startOfDay = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate())

/** Local midnight `days` from the one `at` falls in. Negative goes backwards. */
const addDays = (at: Date, days: number) =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate() + days)

const WINDOW_DAYS_EITHER_SIDE = 1

function currentStart(day: Date, schedule: Schedule, now: Date): number {
  const periods = buildPeriods(day, schedule.spanHours)

  return (findCurrentPeriod(periods, now) ?? periods[0]).start.getTime()
}

function App({ now: nowProp }: AppProps) {
  const [now] = useState(() => nowProp ?? new Date())
  const today = useMemo(() => startOfDay(now), [now])

  // Three whole local days are fetched but only today is rendered — groundwork for scrolling.
  const searchFrom = useMemo(() => addDays(today, -WINDOW_DAYS_EITHER_SIDE), [today])
  const searchTo = useMemo(() => addDays(today, WINDOW_DAYS_EITHER_SIDE + 1), [today])

  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [loaded, setLoaded] = useState<LoadedNotes | null>(null)

  // A timestamp, not a Period: periods are rebuilt whenever the notes or the Schedule change, so a
  // held object reference would go stale.
  const [selectedStart, setSelectedStart] = useState(() =>
    currentStart(today, DEFAULT_SCHEDULE, now),
  )

  const [dialogPeriod, setDialogPeriod] = useState<Period | null>(null)
  const [dialogNote, setDialogNote] = useState<Note | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    getNotesBySchedule(schedule.shortName, searchFrom, searchTo, controller.signal)
      .then((notes) => setLoaded({ shortName: schedule.shortName, notes, error: null }))
      .catch(() => {
        if (controller.signal.aborted) {
          return
        }

        setLoaded({
          shortName: schedule.shortName,
          notes: NO_NOTES,
          error: `Could not load notes for the ${schedule.label} schedule.`,
        })
      })

    return () => controller.abort()
  }, [schedule, searchFrom, searchTo])

  // Loading derived from which Schedule the last result was for — one less piece of state to keep
  // in step with the request.
  const settled = loaded?.shortName === schedule.shortName ? loaded : null
  const notes = settled?.notes ?? NO_NOTES
  const error = settled?.error ?? null

  // App owns the domain calls, so everything below it is handed finished periods.
  const periods = useMemo(
    () => assignNotes(buildPeriods(today, schedule.spanHours), notes),
    [today, schedule, notes],
  )

  const selectedPeriod = periods.find((period) => period.start.getTime() === selectedStart)

  const closeDialog = () => {
    setDialogPeriod(null)
    setDialogNote(null)
  }

  const handleScheduleChange = (shortName: ScheduleShortName) => {
    const next = SCHEDULES.find((candidate) => candidate.shortName === shortName)

    if (!next || next.shortName === schedule.shortName) {
      return
    }

    // Re-chunking the day can leave the old selection off a boundary, so start again from now.
    setSchedule(next)
    setSelectedStart(currentStart(today, next, now))
    closeDialog()
  }

  const handleTakeNote = (period: Period) => {
    setDialogPeriod(period)
    setDialogNote(null)
  }

  const handleOpenNote = (period: Period, note: Note) => {
    setDialogPeriod(period)
    setDialogNote(note)
  }

  // Placeholder until a create/update endpoint exists.
  const handleSave = (markdown: string) => {
    console.log(markdown)
    closeDialog()
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Timely Notes</h1>
        <SchedulePicker selected={schedule.shortName} onChange={handleScheduleChange} />
      </header>

      {settled === null && (
        <p className="app__status" role="status">
          Loading notes…
        </p>
      )}
      {error && (
        <p className="app__status app__status--error" role="alert">
          {error}
        </p>
      )}

      <ScheduleView
        day={today}
        periods={periods}
        now={now}
        selectedPeriod={selectedPeriod}
        onSelect={(period) => setSelectedStart(period.start.getTime())}
        onTakeNote={handleTakeNote}
        onOpenNote={handleOpenNote}
      />

      <NoteDialog
        period={dialogPeriod}
        note={dialogNote}
        onSave={handleSave}
        onClose={closeDialog}
      />
    </div>
  )
}

export default App
