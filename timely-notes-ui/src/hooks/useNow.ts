import { useCallback, useEffect, useState } from 'react'

const MINUTE_MS = 60_000

/**
 * The app's only read of the clock. `now` is replaced as the wall clock crosses each minute —
 * nothing in the app is finer-grained — while `readNow()` gives the exact instant for a one-off
 * stamp that must not be up to a minute stale. Passing `frozen` pins both and registers nothing.
 */
export function useNow(frozen?: Date): { now: Date; readNow: () => Date } {
  const frozenAt = frozen?.getTime()
  const [now, setNow] = useState(() => (frozenAt === undefined ? new Date() : new Date(frozenAt)))

  useEffect(() => {
    if (frozenAt !== undefined) {
      return
    }

    let timeout: ReturnType<typeof setTimeout>

    // Delay recomputed from the clock each time, so ticks can't accumulate drift and realign
    // themselves for free after a DST change or a sleep.
    const schedule = () => {
      timeout = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, MINUTE_MS - (Date.now() % MINUTE_MS))
    }

    // Timers are throttled in a background tab and stop entirely in a suspended one, so a tab that
    // wakes is holding a stale instant until it is told to look again.
    const resync = () => {
      if (document.visibilityState !== 'visible') {
        return
      }

      setNow(new Date())
      clearTimeout(timeout)
      schedule()
    }

    schedule()
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)

    return () => {
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [frozenAt])

  const readNow = useCallback(
    () => (frozenAt === undefined ? new Date() : new Date(frozenAt)),
    [frozenAt],
  )

  return { now: frozenAt === undefined ? now : new Date(frozenAt), readNow }
}
