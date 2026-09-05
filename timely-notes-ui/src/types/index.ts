/** Period spans a Schedule can have, in hours. Each divides 24 evenly. */
export type SpanHours = 1 | 3 | 6

/** Per the design doc, the short name *is* the spanning-period identifier. */
export type ScheduleShortName = 's1' | 's3' | 's6'

export interface Schedule {
  shortName: ScheduleShortName
  spanHours: SpanHours
  /** Shown on the picker: `1h` / `3h` / `6h`. */
  label: string
}

declare const dayKey: unique symbol

/**
 * A calendar day as `YYYY-MM-DD` — the wire form *is* the in-memory form. Branded so a bare string
 * cannot stand in for one: the whole point is that a day is never an instant. Fixed-width ISO, so
 * equality and ordering are lexicographic and the same in every timezone.
 */
export type DayKey = string & { readonly [dayKey]: unique symbol }

/**
 * A note is addressed by its Schedule, its day and its period, and by nothing else. `createdAt` and
 * `modifiedAt` are the *server's* audit stamps and never place it.
 */
export interface Note {
  day: DayKey
  /** 1-based period of that day: on `s3`, 09:00–12:00 is 4. */
  ordinal: number
  content: string
  createdAt: Date
  modifiedAt: Date
}

/** One block of a day, and the one note it may hold. Carries no `Date`: the ordinal is the address. */
export interface Period {
  ordinal: number
  note: Note | null
}
