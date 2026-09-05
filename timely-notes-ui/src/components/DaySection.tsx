import { useEffect, useRef, type Ref } from 'react'
import { formatDayHeading, isCurrentPeriod } from '../domain/periods'
import type { DayKey, Period, SpanHours } from '../types'
import PeriodRow from './PeriodRow'

interface DaySectionProps {
  day: DayKey
  periods: Period[]
  spanHours: SpanHours
  /** Injected so tests are deterministic — never read the clock inside the component. */
  now: Date
  /** `null` unless the selection falls on this day. */
  selectedOrdinal: number | null
  /** The rows render regardless; the day is readable and scrollable before its notes land. */
  isLoading: boolean
  onSelect: (period: Period) => void
  onOpenNote: (period: Period) => void
  /** Set by the scrolling view so it can observe and scroll to this day (React 19 ref-as-prop). */
  ref?: Ref<HTMLElement>
}

/** One day as a calendar column. Periods arrive finished from `App`. */
function DaySection({
  day,
  periods,
  spanHours,
  now,
  selectedOrdinal,
  isLoading,
  onSelect,
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
    <section ref={ref} className="day-section" data-day={day}>
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
          const isSelected = period.ordinal === selectedOrdinal

          return (
            <PeriodRow
              key={period.ordinal}
              ref={isSelected ? selectedRef : undefined}
              period={period}
              spanHours={spanHours}
              isCurrent={isCurrentPeriod(period, day, now, spanHours)}
              isSelected={isSelected}
              onSelect={onSelect}
              onOpenNote={onOpenNote}
            />
          )
        })}
      </ul>
    </section>
  )
}

export default DaySection
