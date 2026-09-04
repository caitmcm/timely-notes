import { render, screen, waitFor } from '@testing-library/react'
import { monthGrid, monthStartOf } from '../domain/months'
import { SCHEDULES } from '../domain/schedules'
import type { Schedule } from '../types'
import { useNoteDays } from './useNoteDays'

const s1 = SCHEDULES[0]
const s3 = SCHEDULES[1]

const day = (year: number, month: number, dayOfMonth: number) =>
  new Date(year, month, dayOfMonth).getTime()

const september = monthGrid(monthStartOf(day(2026, 8, 17)))
const october = monthGrid(monthStartOf(day(2026, 9, 17)))

const gridBounds = (grid: number[][]) => ({ from: grid[0][0], to: grid.at(-1)!.at(-1)! })

interface Window {
  shortName: string
  from: number
  to: number
}

const windowOf = (url: string): Window => {
  const parsed = new URL(url, 'http://localhost')

  return {
    shortName: parsed.pathname.split('/')[3],
    from: new Date(parsed.searchParams.get('searchFrom')!).getTime(),
    to: new Date(parsed.searchParams.get('searchTo')!).getTime(),
  }
}

/** Answers like the API: one count per day in the window that has notes, days with none omitted. */
function stubFetch(counted: Record<number, number> = { [day(2026, 8, 3)]: 2 }) {
  const fetchMock = vi.fn(async (url: string) => {
    const { from, to } = windowOf(url)

    return {
      ok: true,
      status: 200,
      json: async () =>
        Object.entries(counted)
          .map(([dayStart, count]) => ({ dayStart: Number(dayStart), count }))
          .filter((entry) => entry.dayStart >= from && entry.dayStart < to)
          .map((entry) => ({ day: new Date(entry.dayStart).toISOString(), count: entry.count })),
    } as Response
  })
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** Holds every response open, so a request can be aborted before it settles. */
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

const windows = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.map((call) => windowOf(call[0] as string))

interface ProbeProps {
  schedule: Schedule
  grid: number[][]
  enabled: boolean
}

function Probe({ schedule, grid, enabled }: ProbeProps) {
  const { from, to } = gridBounds(grid)
  const { countFor, isLoading, error } = useNoteDays(schedule, from, to, enabled)

  return (
    <ul data-testid="grid" data-loading={isLoading}>
      {error && <li data-testid="error">{error}</li>}
      {grid.flat().map((dayStart) => (
        <li key={dayStart} data-testid={`day-${dayStart}`}>
          {countFor(dayStart)}
        </li>
      ))}
    </ul>
  )
}

const cell = (dayStart: number) => screen.getByTestId(`day-${dayStart}`)

describe('useNoteDays', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests nothing at all while it is disabled', () => {
    const fetchMock = stubFetch()

    render(<Probe schedule={s1} grid={september} enabled={false} />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('grid')).toHaveAttribute('data-loading', 'false')
  })

  it('requests the whole grid once when enabled and exposes the counts', async () => {
    const fetchMock = stubFetch()

    render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(cell(day(2026, 8, 3))).toHaveTextContent('2'))
    const { from, to } = gridBounds(september)
    expect(windows(fetchMock)).toEqual([
      { shortName: 's1', from, to: new Date(to).setDate(new Date(to).getDate() + 1) },
    ])
  })

  it('answers 0 for a day with no notes', async () => {
    stubFetch()

    render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(cell(day(2026, 8, 3))).toHaveTextContent('2'))
    expect(cell(day(2026, 8, 4))).toHaveTextContent('0')
  })

  it('reports loading until the grid lands', async () => {
    stubHeldFetch()

    render(<Probe schedule={s1} grid={september} enabled />)

    expect(screen.getByTestId('grid')).toHaveAttribute('data-loading', 'true')
  })

  it('requests only the new grid when the month moves, and nothing when it moves back', async () => {
    const fetchMock = stubFetch({ [day(2026, 8, 3)]: 2, [day(2026, 9, 6)]: 1 })
    const { rerender } = render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(cell(day(2026, 8, 3))).toHaveTextContent('2'))
    rerender(<Probe schedule={s1} grid={october} enabled />)
    await waitFor(() => expect(cell(day(2026, 9, 6))).toHaveTextContent('1'))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    rerender(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(cell(day(2026, 8, 3))).toHaveTextContent('2'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops the cache and refetches under the new Schedule', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(cell(day(2026, 8, 3))).toHaveTextContent('2'))
    rerender(<Probe schedule={s3} grid={september} enabled />)

    await waitFor(() => expect(windows(fetchMock).map((asked) => asked.shortName)).toContain('s3'))
  })

  it('aborts the old Schedule request, and never renders its counts', async () => {
    const held = stubHeldFetch()
    const { rerender } = render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(held).toHaveLength(1))
    rerender(<Probe schedule={s3} grid={september} enabled />)

    await waitFor(() => expect(held[0].signal.aborted).toBe(true))
    expect(cell(day(2026, 8, 3))).toHaveTextContent('0')
  })

  it('aborts on unmount and updates no state afterwards', async () => {
    const held = stubHeldFetch()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(held).toHaveLength(1))
    unmount()

    expect(held[0].signal.aborted).toBe(true)
    held[0].release()
    await Promise.resolve()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('surfaces an error without wiping the counts already held', async () => {
    const fetchMock = stubFetch()
    const { rerender } = render(<Probe schedule={s1} grid={september} enabled />)

    await waitFor(() => expect(cell(day(2026, 8, 3))).toHaveTextContent('2'))
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    rerender(<Probe schedule={s1} grid={october} enabled />)

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent(/calendar/i))
    rerender(<Probe schedule={s1} grid={september} enabled />)
    expect(cell(day(2026, 8, 3))).toHaveTextContent('2')
  })
})
