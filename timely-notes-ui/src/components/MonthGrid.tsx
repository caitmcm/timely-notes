import { isInMonth } from '../domain/months'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGridProps {
  /** Whole weeks of local day starts, Monday first — built by `App` from `monthGrid`. */
  weeks: number[][]
  /** The month on show; the days either side of it are dimmed but still pickable. */
  monthStart: number
  currentDayStart: number
  focusDayStart: number
  countFor: (dayStart: number) => number
  onPickDay: (dayStart: number) => void
}

/** The month as a grid of day numbers, marked where the Schedule has notes. */
function MonthGrid({
  weeks,
  monthStart,
  currentDayStart,
  focusDayStart,
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
        {weeks.flat().map((dayStart) => {
          const count = countFor(dayStart)
          const dayOfMonth = new Date(dayStart).getDate()
          const label = count > 0 ? `${dayOfMonth}, ${count} note${count === 1 ? '' : 's'}` : `${dayOfMonth}`

          return (
            <button
              key={dayStart}
              type="button"
              className="month-grid__day"
              data-day={dayStart}
              data-outside={!isInMonth(dayStart, monthStart) || undefined}
              aria-label={label}
              aria-current={dayStart === currentDayStart ? 'date' : undefined}
              aria-pressed={dayStart === focusDayStart}
              onClick={() => onPickDay(dayStart)}
            >
              {dayOfMonth}
              {count > 0 && <span className="month-grid__marker" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default MonthGrid
