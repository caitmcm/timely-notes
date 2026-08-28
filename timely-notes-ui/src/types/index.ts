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

/** Wire timestamps already parsed to `Date`. */
export interface Note {
  id: string
  content: string
  /** The slot the note is taken *for* — what the view places and orders it by. */
  occursAt: Date
  /** Audit stamp; never used for placement. */
  createdAt: Date
  /** Audit stamp; never used for placement. */
  modifiedAt: Date
}

/** One block of a day. Half-open: `start` inclusive, `end` exclusive. */
export interface Period {
  start: Date
  end: Date
  notes: Note[]
}
