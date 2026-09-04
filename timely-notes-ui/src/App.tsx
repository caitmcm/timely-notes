import { useMemo, useState } from 'react'
import { occursAtFor } from './domain/notes'
import { addDays, dayStartOf, eachDay } from './domain/days'
import { monthGrid, monthStartOf } from './domain/months'
import { assignNotes, buildPeriods, findCurrentPeriod, formatDayHeading } from './domain/periods'
import { DEFAULT_SCHEDULE, SCHEDULES } from './domain/schedules'
import { useNow } from './hooks/useNow'
import { useNoteDays } from './hooks/useNoteDays'
import { useScheduleNotes } from './hooks/useScheduleNotes'
import SchedulePicker from './components/SchedulePicker'
import ScheduleView from './components/ScheduleView'
import CalendarDialog from './components/CalendarDialog'
import NoteDialog from './components/NoteDialog'
import type { Note, Period, Schedule, ScheduleShortName } from './types'
import './App.css'

interface AppProps {
  /** Injected by tests to freeze the clock: supplied, the view never ticks and never rolls over. */
  now?: Date
}

/**
 * What the user has committed to: the day being read and the row chosen on it. `null` means the
 * view still follows the clock. A timestamp, not a Period — periods are rebuilt whenever the notes
 * or the Schedule change, so a held object reference would go stale.
 */
interface Pinned {
  dayStart: number
  selectedStart: number
}

/** Days either side of the focus day. The window is always these three; it never grows. */
const NEIGHBOUR_DAYS = 1

function currentStart(day: Date, schedule: Schedule, now: Date): number {
  const periods = buildPeriods(day, schedule.spanHours)

  return (findCurrentPeriod(periods, now) ?? periods[0]).start.getTime()
}

function App({ now: nowProp }: AppProps) {
  const { now, readNow } = useNow(nowProp)

  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [pinned, setPinned] = useState<Pinned | null>(null)

  // Everything derived keys off the day as a number, never off `now`: `now` is a fresh Date every
  // minute, so memoising on it would rebuild the window and refire the fetch on every tick.
  const currentDayStart = useMemo(() => dayStartOf(now), [now])

  // Unpinned, the view *is* the clock — derived rather than stored, so a rollover moves it with no
  // effect to fire and nothing to keep in step.
  const focusDayStart = pinned?.dayStart ?? currentDayStart
  const focusDay = useMemo(() => new Date(focusDayStart), [focusDayStart])

  const first = addDays(focusDayStart, -NEIGHBOUR_DAYS)
  const last = addDays(focusDayStart, NEIGHBOUR_DAYS)

  const { notesFor, isLoaded, error } = useScheduleNotes(schedule, first, last)

  const selectedStart = pinned?.selectedStart ?? currentStart(focusDay, schedule, now)

  const [dialogPeriod, setDialogPeriod] = useState<Period | null>(null)
  const [dialogNote, setDialogNote] = useState<Note | null>(null)
  const [dialogOccursAt, setDialogOccursAt] = useState<Date | null>(null)

  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartOf(focusDayStart))
  const weeks = useMemo(() => monthGrid(calendarMonth), [calendarMonth])

  const {
    countFor,
    isLoading: isCalendarLoading,
    error: calendarError,
  } = useNoteDays(schedule, weeks[0][0], weeks.at(-1)!.at(-1)!, isCalendarOpen)

  // App owns the domain calls, so everything below it is handed finished periods.
  const days = useMemo(
    () =>
      eachDay(first, last).map((dayStart) => ({
        dayStart,
        periods: assignNotes(
          buildPeriods(new Date(dayStart), schedule.spanHours),
          notesFor(dayStart),
        ),
        isLoading: !isLoaded(dayStart),
      })),
    [first, last, schedule, notesFor, isLoaded],
  )

  const selectedPeriod = days
    .flatMap((day) => day.periods)
    .find((period) => period.start.getTime() === selectedStart)

  const awayFromToday = focusDayStart !== currentDayStart

  const closeDialog = () => {
    setDialogPeriod(null)
    setDialogNote(null)
    setDialogOccursAt(null)
  }

  /** Stop following the clock, on the day the acted-on row belongs to. */
  const pinTo = (period: Period, selection = selectedStart) =>
    setPinned({ dayStart: dayStartOf(period.start), selectedStart: selection })

  const handleScheduleChange = (shortName: ScheduleShortName) => {
    const next = SCHEDULES.find((candidate) => candidate.shortName === shortName)

    if (!next || next.shortName === schedule.shortName) {
      return
    }

    // Re-chunking the day can leave a pinned selection off a boundary, so start again from now.
    setSchedule(next)
    setPinned(
      (current) => current && { ...current, selectedStart: currentStart(focusDay, next, now) },
    )
    closeDialog()
  }

  const handleTakeNote = (period: Period) => {
    pinTo(period)
    setDialogPeriod(period)
    setDialogNote(null)
    // Stamped on open, not on save: once notes are created on open there is no later moment, and a
    // note begun at 23:58 belongs to the slot it was begun in. Read exactly, not from the last tick.
    setDialogOccursAt(occursAtFor(period, readNow()))
  }

  const handleOpenNote = (period: Period, note: Note) => {
    pinTo(period)
    setDialogPeriod(period)
    setDialogNote(note)
    setDialogOccursAt(note.occursAt)
  }

  const handleSelect = (period: Period) => pinTo(period, period.start.getTime())

  const goToToday = () => setPinned(null)

  const openCalendar = () => {
    setCalendarMonth(monthStartOf(focusDayStart))
    setIsCalendarOpen(true)
  }

  /** Choosing from the calendar is a commitment, exactly as selecting a row is. */
  const handlePickDay = (dayStart: number) => {
    setIsCalendarOpen(false)

    if (dayStart === currentDayStart) {
      goToToday()

      return
    }

    const periods = buildPeriods(new Date(dayStart), schedule.spanHours)
    setPinned({ dayStart, selectedStart: periods[0].start.getTime() })
  }

  // Placeholder until a create/update endpoint exists.
  const handleSave = (markdown: string) => {
    console.log(markdown, dialogOccursAt)
    closeDialog()
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Timely Notes</h1>
        <SchedulePicker selected={schedule.shortName} onChange={handleScheduleChange} />
      </header>

      {error && (
        <p className="app__status app__status--error" role="alert">
          {error}
        </p>
      )}

      {/* Go to today lives in the toolbar, always; this only says why it is worth pressing. */}
      {awayFromToday && (
        <p className="app__status" role="status">
          It is now {formatDayHeading(new Date(currentDayStart))}.
        </p>
      )}

      <ScheduleView
        days={days}
        now={now}
        focusDayStart={focusDayStart}
        selectedPeriod={selectedPeriod}
        onSelect={handleSelect}
        onTakeNote={handleTakeNote}
        onOpenNote={handleOpenNote}
        onOpenCalendar={openCalendar}
        onGoToToday={goToToday}
      />

      <CalendarDialog
        isOpen={isCalendarOpen}
        monthStart={calendarMonth}
        weeks={weeks}
        currentDayStart={currentDayStart}
        focusDayStart={focusDayStart}
        countFor={countFor}
        isLoading={isCalendarLoading}
        error={calendarError}
        onChangeMonth={setCalendarMonth}
        onPickDay={handlePickDay}
        onClose={() => setIsCalendarOpen(false)}
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
