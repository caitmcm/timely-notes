import { useEffect, useRef, type Ref } from 'react'
import { formatDayHeading, isCurrentPeriod } from '../domain/periods'
import type { Note, Period } from '../types'
import PeriodRow from './PeriodRow'

interface DaySectionProps {
  day: Date
  periods: Period[]
  /** Injected so tests are deterministic — never read the clock inside the component. */
  now: Date
  /** `undefined` unless the selected period falls on this day. */
  selectedPeriod: Period | undefined
  /** The rows render regardless; the day is readable and scrollable before its notes land. */
  isLoading: boolean
  onSelect: (period: Period) => void
  onTakeNote: (period: Period) => void
  onOpenNote: (period: Period, note: Note) => void
  /** Set by the scrolling view so it can observe and scroll to this day (React 19 ref-as-prop). */
  ref?: Ref<HTMLElement>
}

/** One day as a calendar column. Periods arrive finished from `App`. */
function DaySection({
  day,
  periods,
  now,
  selectedPeriod,
  isLoading,
  onSelect,
  onTakeNote,
  onOpenNote,
  ref,
}: DaySectionProps) {
  const selectedRef = useRef<HTMLLIElement>(null)
  const heading = formatDayHeading(day)

  // At `1h` the selected row can start off-screen.
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'nearest' })
    // Mount only: a one-off nudge, not a reaction to later selection changes.
  }, [])

  return (
    <section ref={ref} className="day-section" data-day={day.getTime()}>
      <h2 className="day-section__day">
        {heading}
        {isLoading && (
          <span className="day-section__loading" role="status">
            Loading notes…
          </span>
        )}
      </h2>

      <ul className="day-section__periods" role="listbox" aria-label={heading}>
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
    </section>
  )
}

export default DaySection
