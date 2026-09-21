import { useEffect, useRef } from 'react'
import SchedulePicker from './SchedulePicker'
import type { ScheduleShortName } from '../types'

interface MenuDrawerProps {
  isOpen: boolean
  selected: ScheduleShortName
  onChangeSchedule: (shortName: ScheduleShortName) => void
  onClose: () => void
}

/**
 * Settings, modal over the schedule and anchored to the left edge. A drawer in appearance, a dialog
 * in mechanism. It decides nothing — every press goes to `App`.
 */
function MenuDrawer({ isOpen, selected, onChangeSchedule, onClose }: MenuDrawerProps) {
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
    <dialog ref={dialogRef} className="menu-drawer" onCancel={onClose} onClose={onClose}>
      <h2 className="menu-drawer__title">Menu</h2>

      <SchedulePicker selected={selected} onChange={onChangeSchedule} />

      <div className="menu-drawer__actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  )
}

export default MenuDrawer
