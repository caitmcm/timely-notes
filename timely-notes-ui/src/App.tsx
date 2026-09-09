import { useMemo, useState } from 'react'
import { deleteNote, saveNote } from './api/notesApi'
import { addDays, dayKeyOf, eachDay } from './domain/days'
import { monthGrid, monthStartOf } from './domain/months'
import {
  assignNotes,
  buildPeriods,
  formatDayHeading,
  ordinalOf,
} from './domain/periods'
import { DEFAULT_SCHEDULE, SCHEDULES } from './domain/schedules'
import { useNow } from './hooks/useNow'
import { useNoteDays } from './hooks/useNoteDays'
import { useScheduleNotes } from './hooks/useScheduleNotes'
import SchedulePicker from './components/SchedulePicker'
import ScheduleView from './components/ScheduleView'
import CalendarDialog from './components/CalendarDialog'
import NoteDialog, { type NoteSlot } from './components/NoteDialog'
import type { DayKey, Period, Schedule, ScheduleShortName } from './types'
import './App.css'

interface AppProps {
  /** Injected by tests to freeze the clock: supplied, the view never ticks and never rolls over. */
  now?: Date
}

/**
 * What the user has committed to: the day being read and the row chosen on it. `null` means the
 * view still follows the clock. The address, not a `Period` — periods are rebuilt whenever the
 * notes or the Schedule change, so a held object reference would go stale.
 */
interface Pinned {
  day: DayKey
  ordinal: number
}

/** Days either side of the focus day. The window is always these three; it never grows. */
const NEIGHBOUR_DAYS = 1

function App({ now: nowProp }: AppProps) {
  const { now, readNow } = useNow(nowProp)

  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [pinned, setPinned] = useState<Pinned | null>(null)

  // Everything derived keys off the day, never off `now`: `now` is a fresh Date every minute, so
  // memoising on it would rebuild the window and refire the fetch on every tick.
  const currentDay = useMemo(() => dayKeyOf(now), [now])

  // Unpinned, the view *is* the clock — derived rather than stored, so a rollover moves it with no
  // effect to fire and nothing to keep in step.
  const focusDay = pinned?.day ?? currentDay

  const first = addDays(focusDay, -NEIGHBOUR_DAYS)
  const last = addDays(focusDay, NEIGHBOUR_DAYS)

  const { notesFor, isLoaded, error, applyNote, removeNote } = useScheduleNotes(
    schedule,
    first,
    last,
  )

  const selectedOrdinal = pinned?.ordinal ?? ordinalOf(now, schedule.spanHours)

  const [dialogSlot, setDialogSlot] = useState<NoteSlot | null>(null)

  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => monthStartOf(focusDay))
  const weeks = useMemo(() => monthGrid(calendarMonth), [calendarMonth])

  const {
    countFor,
    isLoading: isCalendarLoading,
    error: calendarError,
  } = useNoteDays(schedule, weeks[0][0], weeks.at(-1)!.at(-1)!, isCalendarOpen)

  // App owns the domain calls, so everything below it is handed finished periods.
  const days = useMemo(
    () =>
      eachDay(first, last).map((day) => ({
        day,
        periods: assignNotes(buildPeriods(schedule.spanHours), day, notesFor(day)),
        isLoading: !isLoaded(day),
      })),
    [first, last, schedule, notesFor, isLoaded],
  )

  const awayFromToday = focusDay !== currentDay

  const handleScheduleChange = (shortName: ScheduleShortName) => {
    const next = SCHEDULES.find((candidate) => candidate.shortName === shortName)

    if (!next || next.shortName === schedule.shortName) {
      return
    }

    // Re-chunking the day leaves a pinned ordinal counting the wrong grid, so start again from now.
    setSchedule(next)
    setPinned((current) => current && { ...current, ordinal: ordinalOf(now, next.spanHours) })
  }

  const handleOpenNote = (day: DayKey, period: Period) => {
    setPinned({ day, ordinal: period.ordinal })
    setDialogSlot({ day, period })
  }

  /** Selecting a row is a commitment: the view stops following the clock. */
  const handleSelect = (day: DayKey, period: Period) =>
    setPinned({ day, ordinal: period.ordinal })

  const goToToday = () => setPinned(null)

  const openCalendar = () => {
    setCalendarMonth(monthStartOf(focusDay))
    setIsCalendarOpen(true)
  }

  /** Choosing from the calendar is a commitment, exactly as selecting a row is. */
  const handlePickDay = (day: DayKey) => {
    setIsCalendarOpen(false)

    if (day === currentDay) {
      goToToday()

      return
    }

    setPinned({ day, ordinal: 1 })
  }

  // The address is the row the user pressed — the same before the note exists, while it does, and
  // after it has been swept away. Nothing is stamped and nothing is minted.
  const handleSave = async (day: DayKey, ordinal: number, content: string, signal: AbortSignal) => {
    const note = await saveNote(schedule.shortName, day, ordinal, content, signal)

    applyNote(note)

    return note
  }

  const handleRemove = async (day: DayKey, ordinal: number) => {
    // The row is already gone — the empty write cleared it — and stays gone if the delete fails.
    removeNote(day, ordinal)
    await deleteNote(schedule.shortName, day, ordinal)
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
          It is now {formatDayHeading(currentDay)}.
        </p>
      )}

      <ScheduleView
        days={days}
        spanHours={schedule.spanHours}
        now={now}
        focusDay={focusDay}
        selectedOrdinal={selectedOrdinal}
        onSelect={handleSelect}
        onOpenNote={handleOpenNote}
        onOpenCalendar={openCalendar}
        onGoToToday={goToToday}
      />

      <CalendarDialog
        isOpen={isCalendarOpen}
        monthStart={calendarMonth}
        weeks={weeks}
        currentDay={currentDay}
        focusDay={focusDay}
        countFor={countFor}
        isLoading={isCalendarLoading}
        error={calendarError}
        onChangeMonth={setCalendarMonth}
        onPickDay={handlePickDay}
        onClose={() => setIsCalendarOpen(false)}
      />

      <NoteDialog
        slot={dialogSlot}
        spanHours={schedule.spanHours}
        save={handleSave}
        remove={handleRemove}
        readNow={readNow}
        onClose={() => setDialogSlot(null)}
      />
    </div>
  )
}

export default App
