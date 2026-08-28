import type { Ref } from 'react'
import { noteExcerpt } from '../domain/notes'
import { formatPeriodLabel, formatPeriodStart, formatTimeOfDay } from '../domain/periods'
import type { Note, Period } from '../types'

interface PeriodRowProps {
  period: Period
  /** Whether the clock is inside this period — a fact about time, not about the user. */
  isCurrent: boolean
  /** Whether the user has this period selected. Drives the highlight and the Note button. */
  isSelected: boolean
  onSelect: (period: Period) => void
  onTakeNote: (period: Period) => void
  onOpenNote: (period: Period, note: Note) => void
  /** Set on the selected row so the view can scroll it into sight (React 19 ref-as-prop). */
  ref?: Ref<HTMLLIElement>
}

/**
 * One block of the day. The whole row selects; the Note and existing-note buttons sit inside it
 * and stop the click from bubbling, so pressing one never re-fires selection.
 *
 * Rows are `option`s of the day's listbox so selection is exposed through `aria-selected` rather
 * than through styling alone. The row carries its own `aria-label`, so the buttons nested in it
 * don't end up in its accessible name.
 */
function PeriodRow({
  period,
  isCurrent,
  isSelected,
  onSelect,
  onTakeNote,
  onOpenNote,
  ref,
}: PeriodRowProps) {
  const select = () => onSelect(period)

  return (
    <li
      ref={ref}
      role="option"
      aria-label={formatPeriodLabel(period)}
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
        {formatPeriodStart(period)}
      </span>

      <span className="period-row__notes">
        {period.notes.map((note) => (
          <button
            key={note.id}
            type="button"
            className="period-row__note"
            onClick={(event) => {
              event.stopPropagation()
              onOpenNote(period, note)
            }}
          >
            <span className="period-row__note-time">{formatTimeOfDay(note.occursAt)}</span>{' '}
            {noteExcerpt(note.content)}
          </button>
        ))}
      </span>

      {isSelected && (
        <button
          type="button"
          className="period-row__take-note"
          onClick={(event) => {
            event.stopPropagation()
            onTakeNote(period)
          }}
        >
          Note
        </button>
      )}
    </li>
  )
}

export default PeriodRow
