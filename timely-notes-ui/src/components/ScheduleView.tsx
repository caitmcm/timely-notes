import { useEffect, useRef } from 'react'
import type { DayKey, Period, SpanHours } from '../types'
import DaySection from './DaySection'

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
  /** The day the app is pointing at; scrolled to when it moves, never on mount. */
  focusDay: DayKey
  /** Which period of the focus day is selected; the other two days show no selection. */
  selectedOrdinal: number
  onSelect: (day: DayKey, period: Period) => void
  onOpenNote: (day: DayKey, period: Period) => void
  onOpenCalendar: () => void
  onGoToToday: () => void
}

/**
 * The focus day and its two neighbours in one short scroll container, under a navigation toolbar
 * that never scrolls away. The column is a fixed three days: it never grows.
 */
function ScheduleView({
  days,
  spanHours,
  now,
  focusDay,
  selectedOrdinal,
  onSelect,
  onOpenNote,
  onOpenCalendar,
  onGoToToday,
}: ScheduleViewProps) {
  const sections = useRef(new Map<DayKey, HTMLElement>())
  const previousFocus = useRef(focusDay)

  // On a change only: the mount scroll belongs to the selected row, inside its day.
  useEffect(() => {
    if (previousFocus.current === focusDay) {
      return
    }

    previousFocus.current = focusDay
    sections.current.get(focusDay)?.scrollIntoView?.({ block: 'start' })
  }, [focusDay])

  return (
    <div className="schedule">
      {/* Above the scroll, always: navigation that moved or disappeared would be a surprise. */}
      <div className="schedule__nav" role="toolbar" aria-label="Navigate">
        <button type="button" className="schedule__nav-button" onClick={onOpenCalendar}>
          Calendar
        </button>
        <button type="button" className="schedule__nav-button" onClick={onGoToToday}>
          Go to today
        </button>
      </div>

      <div className="schedule-view" data-testid="schedule-scroll">
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
            selectedOrdinal={day.day === focusDay ? selectedOrdinal : null}
            onSelect={(period) => onSelect(day.day, period)}
            onOpenNote={(period) => onOpenNote(day.day, period)}
          />
        ))}
      </div>
    </div>
  )
}

export default ScheduleView
