/** The only period spans a Schedule can have, in hours. Each divides 24 evenly. */
export type SpanHours = 1 | 3 | 6

/** Short name of a Schedule. Per the design doc, it *is* the spanning-period identifier. */
export type ScheduleShortName = 's1' | 's3' | 's6'

/** A Schedule: a fixed spanning period that divides the day into equal blocks. */
export interface Schedule {
  shortName: ScheduleShortName
  spanHours: SpanHours
  /** Label shown on the Schedule picker: `1h` / `3h` / `6h`. */
  label: string
}

/** A note, as the UI holds it: wire timestamps already parsed to `Date`. */
export interface Note {
  id: string
  content: string
  /** The slot the note is taken *for* — what the view places and orders it by. */
  occursAt: Date
  /** Audit stamp: when the note was written. Never used for placement. */
  createdAt: Date
  /** Audit stamp: when the note was last written to. */
  modifiedAt: Date
}

/** One block of a day under a Schedule. Half-open: `start` inclusive, `end` exclusive. */
export interface Period {
  start: Date
  end: Date
  notes: Note[]
}
