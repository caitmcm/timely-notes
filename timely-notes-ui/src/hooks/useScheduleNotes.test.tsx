import { act, render, screen, waitFor } from '@testing-library/react'
import { eachDay, toDayKey } from '../domain/days'
import { SCHEDULES } from '../domain/schedules'
import type { DayKey, Note, Schedule } from '../types'
import { useScheduleNotes } from './useScheduleNotes'

const s3 = SCHEDULES[1]
const s6 = SCHEDULES[2]

const day = (dayOfMonth: number) => toDayKey(`2026-08-${String(dayOfMonth).padStart(2, '0')}`)

const writtenAt = new Date(2026, 7, 28, 9, 12).toISOString()

const wireNote = (dayOfMonth: number) => ({
  day: day(dayOfMonth),
  periodOrdinal: 4,
  content: `d${dayOfMonth}`,
  createdAt: writtenAt,
  modifiedAt: writtenAt,
})

/** One note a day across the whole of August, so any window has something in it. */
const august = Array.from({ length: 31 }, (_, index) => wireNote(index + 1))

interface Window {
  shortName: string
  from: string
  to: string
}

const windowOf = (url: string): Window => {
  const parsed = new URL(url, 'http://localhost')

  return {
    shortName: parsed.pathname.split('/')[3],
    from: parsed.searchParams.get('searchFrom')!,
    to: parsed.searchParams.get('searchTo')!,
  }
}

/** Answers like the API: the notes whose day is in the half-open window. */
function stubFetch(notes = august) {
  const fetchMock = vi.fn(async (url: string) => {
    const { from, to } = windowOf(url)

    return {
      ok: true,
      status: 200,
      json: async () => notes.filter((note) => note.day >= from && note.day < to),
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** Holds every response open, so overlapping requests can be settled deliberately. */
function stubHeldFetch() {
  const held: { url: string; signal: AbortSignal; release: () => void }[] = []

  const fetchMock = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init.signal!

        held.push({
          url,
          signal,
          release: () =>
            resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response),
        })
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
  )
  vi.stubGlobal('fetch', fetchMock)

  return held
}

const windows = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map((call) => windowOf(call[0] as string))

const byFrom = (asked: Window[]) => [...asked].sort((a, b) => a.from.localeCompare(b.from))

interface ProbeProps {
  schedule: Schedule
  from: DayKey
  to: DayKey
}

function Probe({ schedule, from, to }: ProbeProps) {
  const { notesFor, isLoaded, error } = useScheduleNotes(schedule, from, to)

  return (
    <ul>
      {error && <li data-testid="error">{error}</li>}
      {eachDay(from, to).map((value) => (
        <li key={value} data-testid={`day-${value}`} data-loaded={isLoaded(value)}>
          {notesFor(value)
            .map((note) => note.content)
            .join(',')}
        </li>
      ))}
    </ul>
  )
}

const dayCell = (dayOfMonth: number) => screen.getByTestId(`day-${day(dayOfMonth)}`)

describe('useScheduleNotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the wanted days in one window and buckets the answer by day', async () => {
    const fetchMock = stubFetch()

    render(<Probe schedule={s3} from={day(24)} to={day(26)} />)

    await waitFor(() => expect(dayCell(25)).toHaveTextContent('d25'))
    expect(windows(fetchMock)).toEqual([{ shortName: 's3', from: day(24), to: day(27) }])
    expect(dayCell(24)).toHaveTextContent('d24')
    expect(dayCell(26)).toHaveTextContent('d26')
  })

  it('requests only the new day when the range widens', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(26)} />)
    await waitFor(() => expect(dayCell(25)).toHaveTextContent('d25'))

    rerender(<Probe schedule={s3} from={day(24)} to={day(27)} />)

    await waitFor(() => expect(dayCell(27)).toHaveTextContent('d27'))
    expect(windows(fetchMock)).toHaveLength(2)
    expect(windows(fetchMock)[1]).toEqual({ shortName: 's3', from: day(27), to: day(28) })
  })

  it('issues no request when the range narrows, and keeps the dropped days cached', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(26)} />)
    await waitFor(() => expect(dayCell(25)).toHaveTextContent('d25'))

    rerender(<Probe schedule={s3} from={day(25)} to={day(25)} />)
    rerender(<Probe schedule={s3} from={day(24)} to={day(26)} />)

    expect(dayCell(24)).toHaveTextContent('d24')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('remembers a day that came back empty instead of asking again', async () => {
    const fetchMock = stubFetch([])
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(24)} />)
    await waitFor(() => expect(dayCell(24)).toHaveAttribute('data-loaded', 'true'))

    rerender(<Probe schedule={s3} from={day(24)} to={day(25)} />)

    await waitFor(() => expect(dayCell(25)).toHaveAttribute('data-loaded', 'true'))
    expect(windows(fetchMock)).toHaveLength(2)
    expect(windows(fetchMock)[1]).toEqual({ shortName: 's3', from: day(25), to: day(26) })
  })

  it('splits a range wider than the chunk into windows covering it exactly once', async () => {
    const fetchMock = stubFetch()

    render(<Probe schedule={s3} from={day(10)} to={day(21)} />)

    await waitFor(() => expect(dayCell(21)).toHaveTextContent('d21'))
    expect(byFrom(windows(fetchMock))).toEqual([
      { shortName: 's3', from: day(10), to: day(15) },
      { shortName: 's3', from: day(15), to: day(20) },
      { shortName: 's3', from: day(20), to: day(22) },
    ])
  })

  it('asks separately for each run of missing days, never spanning a cached gap', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(15)} to={day(15)} />)
    await waitFor(() => expect(dayCell(15)).toHaveTextContent('d15'))

    rerender(<Probe schedule={s3} from={day(14)} to={day(16)} />)

    await waitFor(() => expect(dayCell(16)).toHaveTextContent('d16'))
    expect(byFrom(windows(fetchMock).slice(1))).toEqual([
      { shortName: 's3', from: day(14), to: day(15) },
      { shortName: 's3', from: day(16), to: day(17) },
    ])
  })

  it('drops the cache and refetches under the new short name when the schedule changes', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(25)} />)
    await waitFor(() => expect(dayCell(24)).toHaveTextContent('d24'))

    rerender(<Probe schedule={s6} from={day(24)} to={day(25)} />)

    await waitFor(() => expect(windows(fetchMock)).toHaveLength(2))
    expect(windows(fetchMock)[1]).toEqual({ shortName: 's6', from: day(24), to: day(26) })
  })

  it('aborts the old schedule’s requests, and never shows their notes', async () => {
    const held = stubHeldFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(25)} />)
    await waitFor(() => expect(held).toHaveLength(1))

    rerender(<Probe schedule={s6} from={day(24)} to={day(25)} />)

    expect(held[0].signal.aborted).toBe(true)
    await waitFor(() => expect(held).toHaveLength(2))
    expect(held[1].signal.aborted).toBe(false)
    expect(dayCell(24)).toHaveAttribute('data-loaded', 'false')
  })

  it('lets requests in flight finish when the range changes under them', async () => {
    const held = stubHeldFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(24)} />)
    await waitFor(() => expect(held).toHaveLength(1))

    rerender(<Probe schedule={s3} from={day(24)} to={day(25)} />)
    await waitFor(() => expect(held).toHaveLength(2))

    expect(held.every((request) => request.signal.aborted)).toBe(false)
    await act(async () => {
      held.forEach((request) => request.release())
    })
    expect(dayCell(24)).toHaveAttribute('data-loaded', 'true')
    expect(dayCell(25)).toHaveAttribute('data-loaded', 'true')
  })

  it('aborts everything still in flight on unmount', async () => {
    const held = stubHeldFetch()
    const { unmount } = render(<Probe schedule={s3} from={day(24)} to={day(25)} />)
    await waitFor(() => expect(held).toHaveLength(1))

    unmount()

    expect(held[0].signal.aborted).toBe(true)
  })

  it('surfaces a failure without losing the days already loaded, and retries them later', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s3} from={day(24)} to={day(24)} />)
    await waitFor(() => expect(dayCell(24)).toHaveTextContent('d24'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    rerender(<Probe schedule={s3} from={day(24)} to={day(25)} />)

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/could not load/i))
    expect(dayCell(24)).toHaveTextContent('d24')

    vi.stubGlobal('fetch', fetchMock)
    rerender(<Probe schedule={s3} from={day(24)} to={day(26)} />)

    await waitFor(() => expect(dayCell(25)).toHaveTextContent('d25'))
  })

  it('reports a day as loaded only once its notes have landed', async () => {
    const held = stubHeldFetch()
    render(<Probe schedule={s3} from={day(24)} to={day(24)} />)
    await waitFor(() => expect(held).toHaveLength(1))

    expect(dayCell(24)).toHaveAttribute('data-loaded', 'false')

    await act(async () => {
      held[0].release()
    })

    expect(dayCell(24)).toHaveAttribute('data-loaded', 'true')
  })
})

describe('useScheduleNotes cache edits', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const note = (dayOfMonth: number, ordinal: number, content: string): Note => ({
    day: day(dayOfMonth),
    ordinal,
    content,
    createdAt: new Date(writtenAt),
    modifiedAt: new Date(writtenAt),
  })

  /** Renders the day's notes as `ordinal:content`, so a replacement is distinguishable from a pair. */
  function EditProbe({ schedule, from, to }: ProbeProps) {
    const { notesFor, applyNote, removeNote } = useScheduleNotes(schedule, from, to)

    return (
      <div>
        <ul>
          {eachDay(from, to).map((value) => (
            <li key={value} data-testid={`day-${value}`}>
              {notesFor(value)
                .map((entry) => `${entry.ordinal}:${entry.content}`)
                .join(',')}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => applyNote(note(25, 4, 'replaced'))}>
          replace
        </button>
        <button type="button" onClick={() => applyNote(note(25, 9, 'added'))}>
          add
        </button>
        <button type="button" onClick={() => applyNote(note(25, 4, '   '))}>
          blank
        </button>
        <button type="button" onClick={() => applyNote(note(9, 4, 'uncached'))}>
          uncached
        </button>
        <button type="button" onClick={() => removeNote(day(25), 4)}>
          remove
        </button>
        <button type="button" onClick={() => removeNote(day(9), 4)}>
          remove uncached
        </button>
      </div>
    )
  }

  const press = async (name: string) => {
    await act(async () => {
      screen.getByRole('button', { name }).click()
    })
  }

  const renderCached = async () => {
    const fetchMock = stubFetch()
    render(<EditProbe schedule={s3} from={day(24)} to={day(26)} />)
    await waitFor(() => expect(dayCell(25)).toHaveTextContent('4:d25'))

    return fetchMock
  }

  it('puts a saved note in its day’s bucket without a refetch', async () => {
    const fetchMock = await renderCached()

    await press('add')

    expect(dayCell(25)).toHaveTextContent('4:d25,9:added')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The period *is* its identity, so a re-save replaces rather than accumulates.
  it('replaces a re-saved note in place, leaving no duplicate', async () => {
    await renderCached()

    await press('replace')

    expect(dayCell(25)).toHaveTextContent('4:replaced')
    expect(dayCell(25).textContent).not.toContain('d25')
  })

  it('takes a deleted note out of its bucket without a refetch', async () => {
    const fetchMock = await renderCached()

    await press('remove')

    expect(dayCell(25)).toHaveTextContent('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The rule is *don't display an empty note*, not *don't display one the server sent*.
  it('hides a note the moment it is applied blank, whatever the delete does', async () => {
    await renderCached()

    await press('blank')

    expect(dayCell(25)).toHaveTextContent('')
  })

  it('ignores a note whose day is not cached, leaving it to be fetched complete', async () => {
    const fetchMock = await renderCached()

    await press('uncached')
    await press('remove uncached')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(dayCell(24)).toHaveTextContent('4:d24')
  })
})
