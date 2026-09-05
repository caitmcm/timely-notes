import type { Ref } from 'react'
import { noteExcerpt } from '../domain/notes'
import { formatPeriodLabel, formatPeriodStart } from '../domain/periods'
import type { Period, SpanHours } from '../types'

interface PeriodRowProps {
  period: Period
  spanHours: SpanHours
  /** Whether the clock is inside this period, not whether the user picked it. */
  isCurrent: boolean
  /** Drives the highlight and the Note button. */
  isSelected: boolean
  onSelect: (period: Period) => void
  onOpenNote: (period: Period) => void
  /** Set on the selected row so the view can scroll it into sight (React 19 ref-as-prop). */
  ref?: Ref<HTMLLIElement>
}

/**
 * One block of the day, holding at most one note. The whole row selects, so the nested button stops
 * the click bubbling; the row carries its own `aria-label` so that button stays out of its
 * accessible name. The excerpt is text, never a second way in.
 */
function PeriodRow({
  period,
  spanHours,
  isCurrent,
  isSelected,
  onSelect,
  onOpenNote,
  ref,
}: PeriodRowProps) {
  const select = () => onSelect(period)

  return (
    <li
      ref={ref}
      role="option"
      aria-label={formatPeriodLabel(period, spanHours)}
      aria-selected={isSelected}
      aria-current={isCurrent ? 'time' : undefined}
      className={`period-row${isSelected ? ' period-row--selected' : ''}`}
      tabIndex={0}
      onClick={select}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          select()
        }
      }}
    >
      <span className="period-row__time" aria-hidden="true">
        {formatPeriodStart(period, spanHours)}
      </span>

      <span className="period-row__note">
        {period.note && noteExcerpt(period.note.content)}
      </span>

      {isSelected && (
        <button
          type="button"
          className="period-row__open-note"
          onClick={(event) => {
            event.stopPropagation()
            onOpenNote(period)
          }}
        >
          Note
        </button>
      )}
    </li>
  )
}

export default PeriodRow
