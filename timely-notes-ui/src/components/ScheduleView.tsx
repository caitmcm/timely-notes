import { useEffect, useLayoutEffect, useRef } from 'react'
import { addDays } from '../domain/days'
import type { Note, Period } from '../types'
import DaySection from './DaySection'

/** How far beyond the ends of the container an edge counts as reached. */
const GROW_AHEAD_PX = 200

/** One rendered day: its local midnight, its finished periods, and whether its notes have landed. */
export interface DayView {
  dayStart: number
  periods: Period[]
  isLoading: boolean
}

interface ScheduleViewProps {
  days: DayView[]
  /** Injected so tests are deterministic — never read the clock inside the component. */
  now: Date
  /** The day the app is pointing at; scrolled to when it moves, never on mount. */
  focusDayStart: number
  selectedPeriod: Period | undefined
  onSelect: (period: Period) => void
  onTakeNote: (period: Period) => void
  onOpenNote: (period: Period, note: Note) => void
  /** The user has reached an edge: one more day is wanted in that direction. */
  onReachStart: () => void
  onReachEnd: () => void
  /** The earliest day now in the viewport — what the user is actually reading. */
  onAnchorDay: (dayStart: number) => void
}

/**
 * The continuous schedule: day sections in one scroll container, grown a day at a time by the
 * sentinels above and below. It reports where the user is and holds no domain state.
 */
function ScheduleView({
  days,
  now,
  focusDayStart,
  selectedPeriod,
  onSelect,
  onTakeNote,
  onOpenNote,
  onReachStart,
  onReachEnd,
  onAnchorDay,
}: ScheduleViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startSentinel = useRef<HTMLDivElement>(null)
  const endSentinel = useRef<HTMLDivElement>(null)
  const sections = useRef(new Map<number, HTMLElement>())

  const visible = useRef(new Set<number>())
  const anchor = useRef<number | null>(null)
  const previousFirst = useRef(days[0]?.dayStart)
  const previousHeight = useRef(0)
  const previousFocus = useRef(focusDayStart)

  // Read through a ref so a new handler identity never tears down the observer.
  const handlers = useRef({ onReachStart, onReachEnd, onAnchorDay })
  useEffect(() => {
    handlers.current = { onReachStart, onReachEnd, onAnchorDay }
  })

  const dayKeys = days.map((day) => day.dayStart).join(',')

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === startSentinel.current) {
            if (entry.isIntersecting) {
              handlers.current.onReachStart()
            }
          } else if (entry.target === endSentinel.current) {
            if (entry.isIntersecting) {
              handlers.current.onReachEnd()
            }
          } else {
            const dayStart = Number((entry.target as HTMLElement).dataset.day)

            if (entry.isIntersecting) {
              visible.current.add(dayStart)
            } else {
              visible.current.delete(dayStart)
            }
          }
        }

        if (visible.current.size === 0) {
          return
        }

        const earliest = Math.min(...visible.current)

        if (earliest !== anchor.current) {
          anchor.current = earliest
          handlers.current.onAnchorDay(earliest)
        }
      },
      // Margin, so a day is asked for before its edge is actually reached.
      { root: container, rootMargin: `${GROW_AHEAD_PX}px 0px` },
    )

    for (const element of [startSentinel.current, endSentinel.current, ...sections.current.values()]) {
      if (element) {
        observer.observe(element)
      }
    }

    return () => observer.disconnect()
  }, [dayKeys])

  // Prepending a day pushes everything below it down; put the reading position back where it was.
  useLayoutEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const first = days[0]?.dayStart
    const grewUpwards = first !== undefined && previousFirst.current !== undefined && first < previousFirst.current
    const height = container.scrollHeight

    if (grewUpwards) {
      container.scrollTop += height - previousHeight.current
    }

    previousFirst.current = first
    previousHeight.current = height
    // Every render: the container also grows as a day's notes land, and the next prepend measures
    // against that height, not against the one it had when the day list last changed.
  })

  // On a change only: the mount scroll belongs to the selected row, inside its day.
  useEffect(() => {
    if (previousFocus.current === focusDayStart) {
      return
    }

    previousFocus.current = focusDayStart
    sections.current.get(focusDayStart)?.scrollIntoView?.({ block: 'start' })
  }, [focusDayStart])

  return (
    <div className="schedule-view" ref={containerRef} data-testid="schedule-scroll">
      <div ref={startSentinel} className="schedule-view__sentinel" aria-hidden="true" />

      {days.map((day) => {
        const start = new Date(day.dayStart)
        const selectedStart = selectedPeriod?.start.getTime() ?? -1
        const holdsSelection =
          selectedStart >= day.dayStart && selectedStart < addDays(day.dayStart, 1)

        return (
          <DaySection
            key={day.dayStart}
            ref={(element) => {
              if (element) {
                sections.current.set(day.dayStart, element)
              } else {
                sections.current.delete(day.dayStart)
              }
            }}
            day={start}
            periods={day.periods}
            now={now}
            isLoading={day.isLoading}
            selectedPeriod={holdsSelection ? selectedPeriod : undefined}
            onSelect={onSelect}
            onTakeNote={onTakeNote}
            onOpenNote={onOpenNote}
          />
        )
      })}

      <div ref={endSentinel} className="schedule-view__sentinel" aria-hidden="true" />
    </div>
  )
}

export default ScheduleView
