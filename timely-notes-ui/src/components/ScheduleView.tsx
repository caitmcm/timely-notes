import { useEffect, useRef } from 'react'
import { addDays } from '../domain/days'
import type { Note, Period } from '../types'
import DaySection from './DaySection'

/** One rendered day: its local midnight, its finished periods, and whether its notes have landed. */
export interface DayView {
  dayStart: number
  periods: Period[]
  isLoading: boolean
}

interface ScheduleViewProps {
  days: DayView[]
  /** Injected so tests are deterministic — never read the clock inside the component. */
  now: Date
  /** The day the app is pointing at; scrolled to when it moves, never on mount. */
  focusDayStart: number
  selectedPeriod: Period | undefined
  onSelect: (period: Period) => void
  onTakeNote: (period: Period) => void
  onOpenNote: (period: Period, note: Note) => void
  onOpenCalendar: () => void
  onGoToToday: () => void
}

/**
 * The focus day and its two neighbours in one short scroll container, under a navigation toolbar
 * that never scrolls away. The column is a fixed three days: it never grows.
 */
function ScheduleView({
  days,
  now,
  focusDayStart,
  selectedPeriod,
  onSelect,
  onTakeNote,
  onOpenNote,
  onOpenCalendar,
  onGoToToday,
}: ScheduleViewProps) {
  const sections = useRef(new Map<number, HTMLElement>())
  const previousFocus = useRef(focusDayStart)

  // On a change only: the mount scroll belongs to the selected row, inside its day.
  useEffect(() => {
    if (previousFocus.current === focusDayStart) {
      return
    }

    previousFocus.current = focusDayStart
    sections.current.get(focusDayStart)?.scrollIntoView?.({ block: 'start' })
  }, [focusDayStart])

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
        {days.map((day) => {
          const start = new Date(day.dayStart)
          const selectedStart = selectedPeriod?.start.getTime() ?? -1
          const holdsSelection =
            selectedStart >= day.dayStart && selectedStart < addDays(day.dayStart, 1)

          return (
            <DaySection
              key={day.dayStart}
              ref={(element) => {
                if (element) {
                  sections.current.set(day.dayStart, element)
                } else {
                  sections.current.delete(day.dayStart)
                }
              }}
              day={start}
              periods={day.periods}
              now={now}
              isLoading={day.isLoading}
              selectedPeriod={holdsSelection ? selectedPeriod : undefined}
              onSelect={onSelect}
              onTakeNote={onTakeNote}
              onOpenNote={onOpenNote}
            />
          )
        })}
      </div>
    </div>
  )
}

export default ScheduleView
