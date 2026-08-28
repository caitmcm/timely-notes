import { useEffect, useRef } from 'react'
import { formatDayHeading, isCurrentPeriod, nextDay } from '../domain/periods'
import type { Note, Period } from '../types'
import PeriodRow from './PeriodRow'

interface ScheduleViewProps {
  day: Date
  periods: Period[]
  /** Injected so tests are deterministic — never read the clock inside the component. */
  now?: Date
  selectedPeriod: Period | undefined
  onSelect: (period: Period) => void
  onTakeNote: (period: Period) => void
  onOpenNote: (period: Period, note: Note) => void
}

/** The day as a calendar column. Periods arrive finished from `App`. */
function ScheduleView({
  day,
  periods,
  now = new Date(),
  selectedPeriod,
  onSelect,
  onTakeNote,
  onOpenNote,
}: ScheduleViewProps) {
  const selectedRef = useRef<HTMLLIElement>(null)

  // At `1h` the selected row can start off-screen.
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' })
    // Mount only: a one-off nudge, not a reaction to later selection changes.
  }, [])

  return (
    <div className="schedule-view">
      <h2 className="schedule-view__day">{formatDayHeading(day)}</h2>

      <ul className="schedule-view__periods" role="listbox" aria-label={formatDayHeading(day)}>
        {periods.map((period) => {
          const isSelected = period.start.getTime() === selectedPeriod?.start.getTime()

          return (
            <PeriodRow
              key={period.start.getTime()}
              ref={isSelected ? selectedRef : undefined}
              period={period}
              isCurrent={isCurrentPeriod(period, now)}
              isSelected={isSelected}
              onSelect={onSelect}
              onTakeNote={onTakeNote}
              onOpenNote={onOpenNote}
            />
          )
        })}
      </ul>

      <div className="schedule-view__boundary" data-testid="day-boundary">
        <span className="schedule-view__boundary-date">{formatDayHeading(nextDay(day))}</span>
        <span className="schedule-view__boundary-time">00:00</span>
      </div>
    </div>
  )
}

export default ScheduleView
