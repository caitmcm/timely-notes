/**
 * Days are epoch ms of a **local midnight** — the key the scrolling view, the note cache and the
 * fetch window all share. Arithmetic goes through local clock fields, never through 86 400 000 ms,
 * so a daylight-saving day still lands on midnight.
 */

export function dayStartOf(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
}

export function addDays(dayStart: number, days: number): number {
  const at = new Date(dayStart)

  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + days).getTime()
}

/** Inclusive at both ends; empty when `last` is before `first`. */
export function eachDay(first: number, last: number): number[] {
  const days: number[] = []

  for (let day = first; day <= last; day = addDays(day, 1)) {
    days.push(day)
  }

  return days
}

/** Sorted, then split on every gap — so a run never spans a day already held. */
export function contiguousRuns(days: number[]): number[][] {
  const sorted = [...days].sort((a, b) => a - b)

  return sorted.reduce<number[][]>((runs, day) => {
    const run = runs.at(-1)

    if (run && addDays(run[run.length - 1], 1) === day) {
      run.push(day)
    } else {
      runs.push([day])
    }

    return runs
  }, [])
}

/** Splits a run into requestable chunks, so no window exceeds the server's maximum range. */
export function chunkRun(run: number[], maxDays: number): number[][] {
  const chunks: number[][] = []

  for (let index = 0; index < run.length; index += maxDays) {
    chunks.push(run.slice(index, index + maxDays))
  }

  return chunks
}

/** The day a note belongs to, by its `occursAt`. */
export function dayKeyOf(instant: Date): number {
  return dayStartOf(instant)
}
