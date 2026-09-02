import { useMemo, useState } from 'react'
import { occursAtFor } from './domain/notes'
import { addDays, dayStartOf, eachDay } from './domain/days'
import { assignNotes, buildPeriods, findCurrentPeriod, formatDayHeading } from './domain/periods'
import { DEFAULT_SCHEDULE, SCHEDULES } from './domain/schedules'
import { useNow } from './hooks/useNow'
import { useScheduleNotes } from './hooks/useScheduleNotes'
import SchedulePicker from './components/SchedulePicker'
import ScheduleView from './components/ScheduleView'
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

/** Rendered days, inclusive both ends. Grown a day at a time as the user reaches an edge. */
interface DayRange {
  first: number
  last: number
}

/** Where the user has scrolled to, remembered against the focus day it was observed under. */
interface Anchor {
  forFocus: number
  dayStart: number
}

/** Days loaded past the rendered edge: two in the direction of travel, one behind. */
const PREFETCH_DAYS = 2
const NEIGHBOUR_DAYS = 1

function currentStart(day: Date, schedule: Schedule, now: Date): number {
  const periods = buildPeriods(day, schedule.spanHours)

  return (findCurrentPeriod(periods, now) ?? periods[0]).start.getTime()
}

function App({ now: nowProp }: AppProps) {
  const { now, readNow } = useNow(nowProp)

  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [pinned, setPinned] = useState<Pinned | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [direction, setDirection] = useState(0)

  // Everything derived keys off the day as a number, never off `now`: `now` is a fresh Date every
  // minute, so memoising on it would rebuild the window and refire the fetch on every tick.
  const currentDayStart = useMemo(() => dayStartOf(now), [now])

  // Unpinned, the view *is* the clock — derived rather than stored, so a rollover moves it with no
  // effect to fire and nothing to keep in step.
  const focusDayStart = pinned?.dayStart ?? currentDayStart
  const focusDay = useMemo(() => new Date(focusDayStart), [focusDayStart])

  const [range, setRange] = useState<DayRange>(() => ({
    first: focusDayStart,
    last: focusDayStart,
  }))

  // A focus day outside the rendered days means the view was moved rather than scrolled — a
  // rollover, or Go to today from a week back — so it starts again there instead of spanning the gap.
  const rendered: DayRange =
    focusDayStart >= range.first && focusDayStart <= range.last
      ? range
      : { first: focusDayStart, last: focusDayStart }

  const wantFrom = addDays(rendered.first, -(direction < 0 ? PREFETCH_DAYS : NEIGHBOUR_DAYS))
  const wantTo = addDays(rendered.last, direction > 0 ? PREFETCH_DAYS : NEIGHBOUR_DAYS)

  const { notesFor, isLoaded, error } = useScheduleNotes(schedule, wantFrom, wantTo)

  const selectedStart = pinned?.selectedStart ?? currentStart(focusDay, schedule, now)

  const [dialogPeriod, setDialogPeriod] = useState<Period | null>(null)
  const [dialogNote, setDialogNote] = useState<Note | null>(null)
  const [dialogOccursAt, setDialogOccursAt] = useState<Date | null>(null)

  // App owns the domain calls, so everything below it is handed finished periods.
  const days = useMemo(
    () =>
      eachDay(rendered.first, rendered.last).map((dayStart) => ({
        dayStart,
        periods: assignNotes(
          buildPeriods(new Date(dayStart), schedule.spanHours),
          notesFor(dayStart),
        ),
        isLoading: !isLoaded(dayStart),
      })),
    [rendered.first, rendered.last, schedule, notesFor, isLoaded],
  )

  const selectedPeriod = days
    .flatMap((day) => day.periods)
    .find((period) => period.start.getTime() === selectedStart)

  // The anchor is discarded the moment the focus day moves, so a rollover, a selection on another
  // day and Go to today each correct it in the same render.
  const anchorDayStart = anchor?.forFocus === focusDayStart ? anchor.dayStart : focusDayStart
  const awayFromToday = anchorDayStart !== currentDayStart

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

  const handleReachStart = () => {
    setRange({ first: addDays(rendered.first, -1), last: rendered.last })
    setDirection(-1)
  }

  const handleReachEnd = () => {
    setRange({ first: rendered.first, last: addDays(rendered.last, 1) })
    setDirection(1)
  }

  const handleAnchorDay = (dayStart: number) =>
    setAnchor({ forFocus: focusDayStart, dayStart })

  const goToToday = () => {
    setPinned(null)
    setRange({ first: currentDayStart, last: currentDayStart })
    setAnchor(null)
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

      {awayFromToday && (
        <p className="app__status" role="status">
          It is now {formatDayHeading(new Date(currentDayStart))}.{' '}
          <button type="button" className="app__rollover-action" onClick={goToToday}>
            Go to today
          </button>
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
        onReachStart={handleReachStart}
        onReachEnd={handleReachEnd}
        onAnchorDay={handleAnchorDay}
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
