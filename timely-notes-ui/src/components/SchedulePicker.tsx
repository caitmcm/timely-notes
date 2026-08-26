import { SCHEDULES } from '../domain/schedules'
import type { ScheduleShortName } from '../types'

interface SchedulePickerProps {
  selected: ScheduleShortName
  onChange: (shortName: ScheduleShortName) => void
}

/** Segmented control choosing which Schedule the day is divided by. */
function SchedulePicker({ selected, onChange }: SchedulePickerProps) {
  return (
    <div className="schedule-picker" role="group" aria-label="Schedule">
      {SCHEDULES.map((schedule) => (
        <button
          key={schedule.shortName}
          type="button"
          className="schedule-picker__option"
          aria-pressed={schedule.shortName === selected}
          onClick={() => onChange(schedule.shortName)}
        >
          {schedule.label}
        </button>
      ))}
    </div>
  )
}

export default SchedulePicker
