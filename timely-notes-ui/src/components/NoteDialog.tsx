import { useCallback, useEffect, useRef } from 'react'
import type { MDXEditorMethods } from '@mdxeditor/editor'
import { formatPeriodLabel, formatTimeOfDay } from '../domain/periods'
import { useNoteAutosave } from '../hooks/useNoteAutosave'
import type { DayKey, Note, Period, SpanHours } from '../types'
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
  /** Writes a period's note. Given the address, because the body outlives `slot` by a teardown. */
  save: (day: DayKey, ordinal: number, content: string, signal: AbortSignal) => Promise<Note>
  /** Deletes it. No signal: it is issued as this component is torn down. */
  remove: (day: DayKey, ordinal: number) => Promise<void>
  /** `useNow`'s, so the saved-at stamp is still the app's one clock read. */
  readNow: () => Date
  onClose: () => void
}

/** The one note of a period, new or existing — the address is what fixes which. */
function NoteDialog({ slot, spanHours, save, remove, readNow, onClose }: NoteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (slot && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [slot])

  if (!slot) {
    return null
  }

  return (
    // Escape closes; the body's teardown is what still saves and deletes, exactly as Done does.
    <dialog ref={dialogRef} className="note-dialog" onCancel={onClose} onClose={onClose}>
      <h2 className="note-dialog__title">{formatPeriodLabel(slot.period, spanHours)}</h2>

      {/* Keyed per address: a new period is a new buffer *and* a new autosave, so the one it
          replaces is finished off by its own unmount. */}
      <NoteBody
        key={`${slot.day}:${slot.period.ordinal}`}
        slot={slot}
        save={save}
        remove={remove}
        readNow={readNow}
        onClose={onClose}
      />
    </dialog>
  )
}

type NoteBodyProps = Omit<NoteDialogProps, 'slot' | 'spanHours'> & { slot: NoteSlot }

function NoteBody({ slot, save, remove, readNow, onClose }: NoteBodyProps) {
  const editorRef = useRef<MDXEditorMethods>(null)
  const initialContent = slot.period.note?.content ?? ''
  const { day, period } = slot

  // Bound here rather than in `App`, whose `dialogSlot` is already null by the time this unmounts.
  const saveHere = useCallback(
    (content: string, signal: AbortSignal) => save(day, period.ordinal, content, signal),
    [save, day, period.ordinal],
  )
  const removeHere = useCallback(
    () => remove(day, period.ordinal),
    [remove, day, period.ordinal],
  )

  const { status, savedAt, onChange, flush, finish } = useNoteAutosave({
    save: saveHere,
    remove: removeHere,
    initialContent,
    readNow,
  })

  // Read after an await, when the render that set `status` has already happened.
  const latestStatus = useRef(status)

  useEffect(() => {
    latestStatus.current = status
  })

  const doneAttempts = useRef(0)

  useEffect(() => {
    // Switching tabs is when the debounce is most likely to be mid-wait. Neither is a close we can
    // serve: both flush and stop, leaving a blank note as a record no read route returns.
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
      }
    }
    const flushOnUnload = () => {
      void flush()
    }

    document.addEventListener('visibilitychange', flushIfHidden)
    window.addEventListener('pagehide', flushOnUnload)

    return () => {
      document.removeEventListener('visibilitychange', flushIfHidden)
      window.removeEventListener('pagehide', flushOnUnload)
    }
  }, [flush])

  const done = async () => {
    doneAttempts.current += 1
    await finish()

    // A first failure holds the dialog open over text that is not saved; a second Done is a decision.
    if (latestStatus.current === 'failed' && doneAttempts.current === 1) {
      return
    }

    onClose()
  }

  return (
    <>
      <NoteEditor ref={editorRef} markdown={initialContent} onChange={onChange} />

      <div className="note-dialog__actions">
        <p className="note-dialog__status" role="status">
          {statusLine(status, savedAt)}
        </p>
        <button type="button" onClick={() => void done()}>
          Done
        </button>
      </div>
    </>
  )
}

/** The client's clock, saying when *this browser* last succeeded — never the response's stamp. */
function statusLine(status: string, savedAt: Date | null): string {
  if (status === 'saving') {
    return 'Saving…'
  }

  if (status === 'failed') {
    return 'Not saved — retrying'
  }

  return savedAt ? `Saved ${formatTimeOfDay(savedAt)}` : ''
}

export default NoteDialog
