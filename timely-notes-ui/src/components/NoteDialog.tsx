import { useEffect, useRef } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { formatPeriodLabel } from '../domain/periods'
import type { DayKey, Period, SpanHours } from '../types'
import NoteEditor from './NoteEditor'

/** The address the dialog is open on, and the period's note if it has one. */
export interface NoteSlot {
  day: DayKey
  period: Period
}

interface NoteDialogProps {
  /** `null` closes the dialog. */
  slot: NoteSlot | null
  spanHours: SpanHours
  onSave: (markdown: string) => void
  onClose: () => void
}

/** The one note of a period, new or existing — the address is what fixes which. */
function NoteDialog({ slot, spanHours, onSave, onClose }: NoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const editorRef = useRef<MDXEditorMethods>(null)

  useEffect(() => {
    if (slot && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [slot])

  if (!slot) {
    return null
  }

  return (
    <dialog ref={dialogRef} className="note-dialog" onCancel={onClose} onClose={onClose}>
      <h2 className="note-dialog__title">{formatPeriodLabel(slot.period, spanHours)}</h2>

      {/* MDXEditor ignores a changed `markdown` prop once mounted, so remount it per address. */}
      <NoteEditor
        key={`${slot.day}:${slot.period.ordinal}`}
        ref={editorRef}
        markdown={slot.period.note?.content ?? ''}
      />

      <div className="note-dialog__actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(editorRef.current?.getMarkdown() ?? '')
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </dialog>
  )
}

export default NoteDialog
