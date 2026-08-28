import { useEffect, useRef } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { formatPeriodLabel } from '../domain/periods'
import type { Note, Period } from '../types'
import NoteEditor from './NoteEditor'

interface NoteDialogProps {
  /** `null` closes the dialog. */
  period: Period | null
  /** `null` for a new note. */
  note: Note | null
  onSave: (markdown: string) => void
  onClose: () => void
}

/** New and existing notes share one editable view: only a note's `occursAt` slot is fixed. */
function NoteDialog({ period, note, onSave, onClose }: NoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const editorRef = useRef<MDXEditorMethods>(null)

  useEffect(() => {
    if (period && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [period])

  if (!period) {
    return null
  }

  return (
    <dialog ref={dialogRef} className="note-dialog" onCancel={onClose} onClose={onClose}>
      <h2 className="note-dialog__title">{formatPeriodLabel(period)}</h2>

      {/* MDXEditor ignores a changed `markdown` prop once mounted, so remount it per note. */}
      <NoteEditor key={note?.id ?? 'new'} ref={editorRef} markdown={note?.content ?? ''} />

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
