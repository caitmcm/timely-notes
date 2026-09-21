import { useEffect, useRef } from 'react'
import SchedulePicker from './SchedulePicker'
import { CloseIcon } from './icons'
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
 *
 * The dialog element is the backdrop; the panel inside it holds the padding, so a click that lands
 * on the dialog itself came from outside the drawer.
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
    <dialog
      ref={dialogRef}
      className="menu-drawer"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
    >
      <div className="menu-drawer__panel">
        <div className="menu-drawer__header">
          <h2 className="menu-drawer__title">Menu</h2>
          <button
            type="button"
            className="menu-drawer__close"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <SchedulePicker selected={selected} onChange={onChangeSchedule} />
      </div>
    </dialog>
  )
}

export default MenuDrawer
