import { dayOfMonth, isInMonth } from '../domain/months'
import type { DayKey } from '../types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGridProps {
  /** Whole weeks, Monday first — built by `App` from `monthGrid`. */
  weeks: DayKey[][]
  /** The month on show; the days either side of it are dimmed but still pickable. */
  monthStart: DayKey
  currentDay: DayKey
  focusDay: DayKey
  countFor: (day: DayKey) => number
  onPickDay: (day: DayKey) => void
}

/** The month as a grid of day numbers, marked where the Schedule has notes. */
function MonthGrid({
  weeks,
  monthStart,
  currentDay,
  focusDay,
  countFor,
  onPickDay,
}: MonthGridProps) {
  return (
    <div className="month-grid">
      <div className="month-grid__weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="month-grid__weekday">
            {weekday}
          </span>
        ))}
      </div>

      <div className="month-grid__days">
        {weeks.flat().map((day) => {
          const count = countFor(day)
          const date = dayOfMonth(day)
          const label =
            count > 0 ? `${date}, ${count} note${count === 1 ? '' : 's'}` : `${date}`

          return (
            <button
              key={day}
              type="button"
              className="month-grid__day"
              data-day={day}
              data-outside={!isInMonth(day, monthStart) || undefined}
              aria-label={label}
              aria-current={day === currentDay ? 'date' : undefined}
              aria-pressed={day === focusDay}
              onClick={() => onPickDay(day)}
            >
              {date}
              {count > 0 && <span className="month-grid__marker" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default MonthGrid
