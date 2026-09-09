import { useCallback, useEffect, useRef, useState } from 'react'
import { isBlank } from '../domain/notes'

/** Quiet this long after the last change, and the buffer is written. */
const DEBOUNCE_MS = 2_000

/** However continuous the typing, never further than this from safety. */
const CEILING_MS = 10_000

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

interface UseNoteAutosaveOptions {
  /** Writes the buffer to the period the caller bound this hook to. Idempotent, so a retry is free. */
  save: (content: string, signal: AbortSignal) => Promise<unknown>
  /** Removes that period's note. No signal: it is issued as the dialog is torn down. */
  remove: () => Promise<unknown>
  /** What the period already holds. Its emptiness is also how the hook knows whether a note exists. */
  initialContent: string
  /** `useNow`'s, so the status line's stamp is still the app's one clock read. */
  readNow: () => Date
}

export interface NoteAutosave {
  status: SaveStatus
  /** When this browser last wrote successfully; `null` until it has. */
  savedAt: Date | null
  onChange: (markdown: string) => void
  /** Write now if there is anything to write. Never deletes — this is the tab-hidden path. */
  flush: () => Promise<void>
  /** The close path: flush, then delete the note if it is blank. */
  finish: () => Promise<void>
}

/**
 * Keeps one period's note saved as it is written. There is a single write and no "does this exist
 * yet" state: the upsert makes creating and replacing the same request, so a note swept out from
 * under an open dialog is simply re-created by the next save.
 */
export function useNoteAutosave({
  save,
  remove,
  initialContent,
  readNow,
}: UseNoteAutosaveOptions): NoteAutosave {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const content = useRef(initialContent)
  const written = useRef(initialContent)

  // Whether the address holds a note at all — what decides that clearing is worth writing.
  const exists = useRef(!isBlank(initialContent))
  const removed = useRef(false)

  const inFlight = useRef<Promise<void> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtySince = useRef<number | null>(null)
  const mounted = useRef(true)

  // Replaced rather than only aborted on unmount, so the teardown's own final write is not the
  // request the teardown cancels.
  const controller = useRef(new AbortController())

  // Held in a ref so the timer and the teardown call the current ones without re-arming on identity.
  const latest = useRef({ save, remove, readNow })

  useEffect(() => {
    latest.current = { save, remove, readNow }
  })

  /** Dirty, and either a note is there to change or there is content worth creating one for. */
  const hasSomethingToSay = () =>
    content.current !== written.current && (exists.current || !isBlank(content.current))

  const write = useCallback(async () => {
    if (!hasSomethingToSay()) {
      return
    }

    const sending = content.current

    const attempt = (async () => {
      if (mounted.current) {
        setStatus('saving')
      }

      try {
        await latest.current.save(sending, controller.current.signal)
        written.current = sending
        exists.current = true

        if (mounted.current) {
          setStatus('saved')
          setSavedAt(latest.current.readNow())
        }
      } catch {
        // Left dirty on purpose: the next beat or flush retries it, and nothing is dropped.
        if (mounted.current) {
          setStatus('failed')
        }
      }
    })()

    inFlight.current = attempt
    await attempt
    inFlight.current = null
    dirtySince.current = null
  }, [])

  // The next beat re-arms the one after it, so the scheduler reaches itself through a ref.
  const rearm = useRef<() => void>(() => {})

  const schedule = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    if (!hasSomethingToSay()) {
      return
    }

    const at = Date.now()
    dirtySince.current ??= at

    // Whichever comes first: quiet for a debounce, or a ceiling since the buffer went dirty.
    const untilCeiling = dirtySince.current + CEILING_MS - at
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, untilCeiling))

    timer.current = setTimeout(() => {
      timer.current = null

      // A change arriving mid-save queues rather than racing it; the settle re-schedules.
      if (inFlight.current) {
        return
      }

      void write().then(() => rearm.current())
    }, delay)
  }, [write])

  useEffect(() => {
    rearm.current = schedule
  })

  const onChange = useCallback(
    (markdown: string) => {
      content.current = markdown
      schedule()
    },
    [schedule],
  )

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    if (inFlight.current) {
      await inFlight.current
    }

    await write()
  }, [write])

  const finish = useCallback(async () => {
    await flush()

    // Blank with nothing ever written is nothing at all; and one delete per note, ever.
    if (removed.current || !exists.current || !isBlank(content.current)) {
      return
    }

    removed.current = true

    try {
      await latest.current.remove()
    } catch {
      // Best-effort by design: the note is already empty on the server, and no read route shows it.
    }
  }, [flush])

  const closing = useRef(finish)

  useEffect(() => {
    closing.current = finish
  })

  useEffect(() => {
    // Set here, not only cleared below: StrictMode's double-invoke tears the hook down and builds
    // it again, and a flag only ever cleared would leave every later save unable to report itself.
    mounted.current = true

    return () => {
      mounted.current = false

      if (timer.current) {
        clearTimeout(timer.current)
      }

      controller.current.abort()
      controller.current = new AbortController()

      // Fire-and-forget: the thing being torn down must not be able to cancel its own last word.
      void closing.current()
    }
  }, [])

  return { status, savedAt, onChange, flush, finish }
}
