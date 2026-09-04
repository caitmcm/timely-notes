import { useEffect, useRef } from 'react'
import { addMonths, formatMonthHeading } from '../domain/months'
import MonthGrid from './MonthGrid'

interface CalendarDialogProps {
  isOpen: boolean
  /** The month on show; the dialog holds no month state of its own. */
  monthStart: number
  weeks: number[][]
  currentDayStart: number
  focusDayStart: number
  countFor: (dayStart: number) => number
  /** The grid renders regardless: a marker is an extra, not what the calendar is for. */
  isLoading: boolean
  error: string | null
  onChangeMonth: (monthStart: number) => void
  onPickDay: (dayStart: number) => void
  onClose: () => void
}

/** The month view, modal over the schedule. It decides nothing — every press goes to `App`. */
function CalendarDialog({
  isOpen,
  monthStart,
  weeks,
  currentDayStart,
  focusDayStart,
  countFor,
  isLoading,
  error,
  onChangeMonth,
  onPickDay,
  onClose,
}: CalendarDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isOpen && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <dialog ref={dialogRef} className="calendar-dialog" onCancel={onClose} onClose={onClose}>
      <div className="calendar-dialog__header">
        <button type="button" onClick={() => onChangeMonth(addMonths(monthStart, -1))}>
          Previous month
        </button>
        <h2 className="calendar-dialog__title">{formatMonthHeading(monthStart)}</h2>
        <button type="button" onClick={() => onChangeMonth(addMonths(monthStart, 1))}>
          Next month
        </button>
      </div>

      {error && (
        <p className="calendar-dialog__status" role="alert">
          {error}
        </p>
      )}
      {isLoading && !error && (
        <p className="calendar-dialog__status" role="status">
          Loading notes…
        </p>
      )}

      <MonthGrid
        weeks={weeks}
        monthStart={monthStart}
        currentDayStart={currentDayStart}
        focusDayStart={focusDayStart}
        countFor={countFor}
        onPickDay={onPickDay}
      />

      <div className="calendar-dialog__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}

export default CalendarDialog
