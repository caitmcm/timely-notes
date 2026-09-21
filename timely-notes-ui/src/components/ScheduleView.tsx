import { useEffect, useRef } from 'react'
import { addDays } from '../domain/days'
import type { DayKey, Period, SpanHours } from '../types'
import DaySection from './DaySection'
import { ChevronDownIcon, ChevronUpIcon } from './icons'

/** One rendered day: its day key, its finished periods, and whether its notes have landed. */
export interface DayView {
  day: DayKey
  periods: Period[]
  isLoading: boolean
}

interface ScheduleViewProps {
  days: DayView[]
  spanHours: SpanHours
  /** Injected so tests are deterministic — never read the clock inside the component. */
  now: Date
  /** The day the selection is on. Outside the window, no row is drawn selected at all. */
  selectedDay: DayKey
  /** Which period of the selected day is selected; the other two days show no selection. */
  selectedOrdinal: number
  onSelect: (day: DayKey, period: Period) => void
  onOpenNote: (day: DayKey, period: Period) => void
  onShowEarlier: () => void
  onShowLater: () => void
}

/** Where a window move leaves the view: the day to bring into view, and which edge to take it to. */
interface Landing {
  day: DayKey
  block: 'start' | 'end'
}

/**
 * Where to land after the window has moved. A step by the arrows produces a window abutting the one
 * left, and there the next thing read is the day adjacent to it — the top of the new first day
 * going forwards, the bottom of the new last day coming back. Any other move is a jump, and a jump
 * lands on the day it was aimed at: the anchor, in the middle.
 */
function landingFor(previous: DayView[], next: DayView[]): Landing | null {
  const was = { first: previous[0]?.day, last: previous.at(-1)?.day }
  const now = { first: next[0]?.day, last: next.at(-1)?.day }

  if (!was.first || !now.first || was.first === now.first) {
    return null
  }

  if (now.first === addDays(was.last!, 1)) {
    return { day: now.first, block: 'start' }
  }

  if (now.last === addDays(was.first, -1)) {
    return { day: now.last!, block: 'end' }
  }

  return { day: next[Math.floor(next.length / 2)].day, block: 'start' }
}

/**
 * The window's three days in one short scroll container, below the header that never scrolls away,
 * with an arrow at either end that pages it. The column is a fixed three days: it never grows.
 */
function ScheduleView({
  days,
  spanHours,
  now,
  selectedDay,
  selectedOrdinal,
  onSelect,
  onOpenNote,
  onShowEarlier,
  onShowLater,
}: ScheduleViewProps) {
  const sections = useRef(new Map<DayKey, HTMLElement>())
  const previousDays = useRef(days)

  // On a window change only: the mount scroll belongs to the selected row, inside its day.
  useEffect(() => {
    const landing = landingFor(previousDays.current, days)
    previousDays.current = days

    if (landing) {
      sections.current.get(landing.day)?.scrollIntoView?.({ block: landing.block })
    }
  }, [days])

  return (
    <div className="schedule-view" data-testid="schedule-scroll">
      <button
        type="button"
        className="schedule-view__step"
        aria-label="Earlier days"
        title="Earlier days"
        onClick={onShowEarlier}
      >
        <ChevronUpIcon />
      </button>

      {days.map((day) => (
        <DaySection
          key={day.day}
          ref={(element) => {
            if (element) {
              sections.current.set(day.day, element)
            } else {
              sections.current.delete(day.day)
            }
          }}
          day={day.day}
          periods={day.periods}
          spanHours={spanHours}
          now={now}
          isLoading={day.isLoading}
          selectedOrdinal={day.day === selectedDay ? selectedOrdinal : null}
          onSelect={(period) => onSelect(day.day, period)}
          onOpenNote={(period) => onOpenNote(day.day, period)}
        />
      ))}

      <button
        type="button"
        className="schedule-view__step"
        aria-label="Later days"
        title="Later days"
        onClick={onShowLater}
      >
        <ChevronDownIcon />
      </button>
    </div>
  )
}

export default ScheduleView
