import { useEffect, useMemo, useRef, useState } from 'react'
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
import MenuDrawer from './components/MenuDrawer'
import ScheduleView from './components/ScheduleView'
import CalendarDialog from './components/CalendarDialog'
import NoteDialog, { type NoteSlot } from './components/NoteDialog'
import { CalendarIcon, MenuIcon, NoteNowIcon } from './components/icons'
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
  const [isNoteNowPending, setIsNoteNowPending] = useState(false)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
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

  // The one path `Note now` takes. It reads the period out of `days` by `selectedOrdinal`, which
  // with `pinned` null *is* the current period — so nothing here touches `now` and no tick refetches.
  // Derivation cannot replace it: a derived slot would follow the clock over an open dialog.
  useEffect(() => {
    if (!isNoteNowPending) {
      return
    }

    if (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above
      setIsNoteNowPending(false)

      return
    }

    const today = days.find((day) => day.day === currentDay)

    if (!today || today.isLoading) {
      return
    }

    const period = today.periods.find((candidate) => candidate.ordinal === selectedOrdinal)

    if (!period) {
      return
    }

    setIsNoteNowPending(false)
    setDialogSlot({ day: currentDay, period })
  }, [isNoteNowPending, error, days, currentDay, selectedOrdinal])

  // The drawer unmounts rather than closing, so `<dialog>`'s own focus restore never runs. After the
  // commit, not in the handler: on Escape the browser's close sequence would otherwise land last.
  const wasMenuOpen = useRef(false)

  useEffect(() => {
    if (wasMenuOpen.current && !isMenuOpen) {
      menuButtonRef.current?.focus()
    }

    wasMenuOpen.current = isMenuOpen
  }, [isMenuOpen])

  const handleScheduleChange = (shortName: ScheduleShortName) => {
    // One tap in, one tap done: the close is on the press, whether or not the Schedule moves.
    setIsMenuOpen(false)

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

  /** Un-pins and asks for the open; the effect below is what performs it, once the day is there. */
  const handleNoteNow = () => {
    setPinned(null)
    setIsNoteNowPending(true)
  }

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
        <button
          type="button"
          className="app__header-button"
          aria-label="Menu"
          title="Menu"
          aria-haspopup="dialog"
          aria-expanded={isMenuOpen}
          ref={menuButtonRef}
          onClick={() => setIsMenuOpen(true)}
        >
          <MenuIcon />
        </button>

        <h1 className="app__title">Timely Notes</h1>

        <div className="app__header-actions">
          <button
            type="button"
            className="app__header-button"
            aria-label="Calendar"
            title="Calendar"
            aria-haspopup="dialog"
            onClick={openCalendar}
          >
            <CalendarIcon />
          </button>
          <button
            type="button"
            className="app__header-button app__header-button--primary"
            aria-label="Note now"
            title="Note now"
            aria-haspopup="dialog"
            onClick={handleNoteNow}
          >
            <NoteNowIcon />
          </button>
        </div>
      </header>

      {error && (
        <p className="app__status app__status--error" role="alert">
          {error}
        </p>
      )}

      {/* The region announces the rollover; the button inside it is the way back. A button alone
          is never announced, so the two jobs stay separate. */}
      {awayFromToday && (
        <p className="app__status" role="status">
          It is now {formatDayHeading(currentDay)}.{' '}
          <button type="button" className="app__status-action" onClick={goToToday}>
            Go to today
          </button>
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
      />

      <MenuDrawer
        isOpen={isMenuOpen}
        selected={schedule.shortName}
        onChangeSchedule={handleScheduleChange}
        onClose={() => setIsMenuOpen(false)}
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
