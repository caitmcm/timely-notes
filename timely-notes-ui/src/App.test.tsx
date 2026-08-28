import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

/** The instant the mockup is drawn at. */
const now = new Date(2026, 7, 25, 20, 20)

const iso = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute).toISOString()

/** `createdAt` is a different day throughout: only `occursAt` decides where a note lands. */
const writtenAt = new Date(2026, 7, 28, 9, 12).toISOString()

const wireNote = (id: string, hour: number, content: string) => ({
  id,
  content,
  occursAt: iso(hour),
  createdAt: writtenAt,
  modifiedAt: writtenAt,
})

/** Newest-first, as the API answers. */
const s3Notes = [
  wireNote('s3-afternoon', 15, 'Afternoon block: wired up FastEndpoints.'),
  wireNote('s3-morning', 9, 'Morning block: drafted the TDD plan.'),
]

function stubFetch(byShortName: Record<string, unknown[]> = { s3: s3Notes }) {
  const fetchMock = vi.fn(async (url: string) => {
    const shortName = new URL(url, 'http://localhost').pathname.split('/')[3]

    return { ok: true, status: 200, json: async () => byShortName[shortName] ?? [] } as Response
  })
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

const renderApp = () => render(<App now={now} />)

/** The URLs fetch was called with, parsed. */
const requests = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map((call) => new URL(call[0] as string, 'http://localhost'))

const requestedShortNames = (fetchMock: ReturnType<typeof stubFetch>) =>
  requests(fetchMock).map((url) => url.pathname.split('/')[3])

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the default schedule on mount', async () => {
    const fetchMock = stubFetch()

    renderApp()

    await waitFor(() => expect(requestedShortNames(fetchMock)).toContain('s3'))
    expect(screen.getByRole('button', { name: '3h', pressed: true })).toBeInTheDocument()
  })

  it('asks for a three-day window: yesterday, today and tomorrow, half-open', async () => {
    const fetchMock = stubFetch()

    renderApp()

    await waitFor(() => expect(requests(fetchMock)).toHaveLength(1))
    const { searchParams } = requests(fetchMock)[0]
    expect(new Date(searchParams.get('searchFrom')!)).toEqual(new Date(2026, 7, 24))
    expect(new Date(searchParams.get('searchTo')!)).toEqual(new Date(2026, 7, 27))
  })

  it('fetches once per schedule change, not once per render', async () => {
    const fetchMock = stubFetch({ s3: s3Notes, s6: [] })
    renderApp()
    await screen.findByRole('button', { name: /Afternoon block/ })

    await userEvent.click(screen.getByRole('button', { name: '6h' }))

    await waitFor(() => expect(requestedShortNames(fetchMock)).toEqual(['s3', 's6']))
  })

  it('places notes by occursAt even when they were written on another day', async () => {
    stubFetch()
    renderApp()

    const morning = await screen.findByRole('option', { name: '09:00 – 12:00' })

    // Fixture createdAt is 28/08 09:12; the row must show the 09:00 slot instead.
    expect(morning).toContainElement(screen.getByRole('button', { name: /^09:00 Morning block/ }))
  })

  it('refetches with the new short name when the schedule changes', async () => {
    const fetchMock = stubFetch({ s3: s3Notes, s6: [] })
    renderApp()
    await screen.findByRole('button', { name: /Afternoon block/ })

    await userEvent.click(screen.getByRole('button', { name: '6h' }))

    await waitFor(() => expect(requestedShortNames(fetchMock)).toContain('s6'))
    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('shows an error instead of a blank page when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
    expect(screen.getAllByRole('option')).toHaveLength(8)
  })

  it('selects the period holding the current time on load, and puts the Note button there', async () => {
    stubFetch()
    renderApp()

    const selected = await screen.findByRole('option', { selected: true })

    expect(selected).toHaveAccessibleName('18:00 – 21:00')
    expect(selected).toHaveAttribute('aria-current', 'time')
    expect(selected).toContainElement(screen.getByRole('button', { name: 'Note' }))
  })

  it('moves selection and the Note button when another row is clicked', async () => {
    stubFetch()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(screen.getByRole('option', { name: '06:00 – 09:00' }))

    const selected = screen.getByRole('option', { selected: true })
    expect(selected).toHaveAccessibleName('06:00 – 09:00')
    expect(selected).toContainElement(screen.getByRole('button', { name: 'Note' }))
    expect(screen.getByRole('option', { name: '18:00 – 21:00' })).toHaveAttribute(
      'aria-current',
      'time',
    )
  })

  it('does not open the editor when a row is merely selected', async () => {
    stubFetch()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(screen.getByRole('option', { name: '06:00 – 09:00' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a blank dialog titled with the selected period when Note is pressed', async () => {
    stubFetch()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '18:00 – 21:00' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })

  it('lists fetched notes against their periods, oldest-first', async () => {
    stubFetch()
    renderApp()

    const morning = await screen.findByRole('option', { name: '09:00 – 12:00' })

    expect(morning).toContainElement(screen.getByRole('button', { name: /Morning block/ }))
    expect(screen.getByRole('option', { name: '15:00 – 18:00' })).toContainElement(
      screen.getByRole('button', { name: /Afternoon block/ }),
    )
  })

  it('opens an existing note with its content loaded', async () => {
    stubFetch()
    renderApp()

    await userEvent.click(await screen.findByRole('button', { name: /Morning block/ }))

    expect(screen.getByRole('heading', { name: '09:00 – 12:00' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveTextContent('Morning block: drafted the TDD plan.')
  })

  it('opens blank when taking a note straight after closing an existing one', async () => {
    stubFetch()
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: /Morning block/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    expect(screen.getByRole('heading', { name: '18:00 – 21:00' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveTextContent('')
  })

  it('logs the markdown and closes when an note is saved', async () => {
    stubFetch()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    renderApp()
    await screen.findByRole('option', { selected: true })
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(log).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    log.mockRestore()
  })

  it('keeps the selection on the current period after switching schedule', async () => {
    stubFetch({ s3: s3Notes, s1: [] })
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(screen.getByRole('button', { name: '1h' }))

    await waitFor(() =>
      expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('20:00 – 21:00'),
    )
  })
})

/**
 * Mounted without a `now` prop, so the hook's timer runs. Every assertion here is about the clock
 * moving, which the frozen-prop suite above deliberately cannot see.
 */
describe('App — live clock', () => {
  const dayBefore = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute)

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  /** fireEvent, not userEvent: userEvent's own delays deadlock against the faked timers. */
  const click = async (element: HTMLElement) => {
    fireEvent.click(element)
    await act(async () => {})
  }

  /** Mount at `startAt` and let the mount fetch settle. */
  const mountAt = async (startAt: Date) => {
    vi.setSystemTime(startAt)
    const fetchMock = stubFetch()
    render(<App />)
    await act(async () => {})

    return fetchMock
  }

  const selectedName = () =>
    screen.getByRole('option', { selected: true }).getAttribute('aria-label')

  const currentName = () =>
    screen
      .getAllByRole('option')
      .find((row) => row.getAttribute('aria-current') === 'time')
      ?.getAttribute('aria-label')

  it('does not refetch as the clock ticks', async () => {
    const fetchMock = await mountAt(dayBefore(20, 20))

    await advance(10 * 60_000)

    expect(requests(fetchMock)).toHaveLength(1)
  })

  it('moves the current-period marker across a period boundary without a reload', async () => {
    await mountAt(dayBefore(20, 59))
    expect(currentName()).toBe('18:00 – 21:00')

    await advance(2 * 60_000)

    expect(currentName()).toBe('21:00 – 00:00')
  })

  it('carries the selection along with the marker while the view is untouched', async () => {
    await mountAt(dayBefore(20, 59))
    expect(selectedName()).toBe('18:00 – 21:00')

    await advance(2 * 60_000)

    expect(selectedName()).toBe('21:00 – 00:00')
  })

  it('does not scroll the view again when the selection follows the clock', async () => {
    // jsdom has no scrollIntoView at all, so the mount-only effect needs one to count.
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await mountAt(dayBefore(20, 59))
    const onMount = scrollIntoView.mock.calls.length
    expect(onMount).toBe(1)

    await advance(2 * 60_000)

    expect(scrollIntoView).toHaveBeenCalledTimes(onMount)
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('follows the clock over midnight: new heading, new window, one more fetch', async () => {
    const fetchMock = await mountAt(dayBefore(23, 59))
    expect(screen.getByRole('heading', { name: '25/08/2026' })).toBeInTheDocument()

    await advance(2 * 60_000)

    expect(screen.getByRole('heading', { name: '26/08/2026' })).toBeInTheDocument()
    expect(selectedName()).toBe('00:00 – 03:00')
    expect(requests(fetchMock)).toHaveLength(2)
    const { searchParams } = requests(fetchMock)[1]
    expect(new Date(searchParams.get('searchFrom')!)).toEqual(new Date(2026, 7, 25))
    expect(new Date(searchParams.get('searchTo')!)).toEqual(new Date(2026, 7, 28))
  })

  it('stays put over midnight once the user has selected a row', async () => {
    const fetchMock = await mountAt(dayBefore(23, 59))
    await click(screen.getByRole('option', { name: '06:00 – 09:00' }))

    await advance(2 * 60_000)

    expect(screen.getByRole('heading', { name: '25/08/2026' })).toBeInTheDocument()
    expect(selectedName()).toBe('06:00 – 09:00')
    expect(currentName()).toBeUndefined()
    expect(requests(fetchMock)).toHaveLength(1)
  })

  it('leaves an open dialog alone over midnight', async () => {
    await mountAt(dayBefore(23, 59))
    await click(screen.getByRole('button', { name: 'Note' }))
    expect(screen.getByRole('heading', { name: '21:00 – 00:00' })).toBeInTheDocument()

    await advance(2 * 60_000)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '21:00 – 00:00' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '25/08/2026' })).toBeInTheDocument()
  })

  it('offers Go to today only after the day has rolled under a committed view', async () => {
    await mountAt(dayBefore(23, 59))
    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument()

    await click(screen.getByRole('option', { name: '06:00 – 09:00' }))
    await advance(2 * 60_000)

    expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('26/08/2026')
  })

  it('shows no notice when the view followed the clock by itself', async () => {
    await mountAt(dayBefore(23, 59))

    await advance(2 * 60_000)

    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument()
  })

  it('moves the view to the current day when Go to today is pressed', async () => {
    const fetchMock = await mountAt(dayBefore(23, 59))
    await click(screen.getByRole('option', { name: '06:00 – 09:00' }))
    await advance(2 * 60_000)

    await click(screen.getByRole('button', { name: 'Go to today' }))
    await act(async () => {})

    expect(screen.getByRole('heading', { name: '26/08/2026' })).toBeInTheDocument()
    expect(selectedName()).toBe('00:00 – 03:00')
    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument()
    expect(requests(fetchMock)).toHaveLength(2)
  })

  it('stamps a new note with the instant the dialog opened, on the day that is current then', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await mountAt(dayBefore(23, 59))
    await advance(6 * 60_000)

    await click(screen.getByRole('button', { name: 'Note' }))
    await advance(10 * 60_000)
    await click(screen.getByRole('button', { name: 'Save' }))

    expect(log).toHaveBeenCalledWith(expect.anything(), new Date(2026, 7, 26, 0, 5))
    log.mockRestore()
  })

  it('stamps a note taken in a slot that is not the live one with that slot start', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await mountAt(dayBefore(20, 20))
    await click(screen.getByRole('option', { name: '06:00 – 09:00' }))

    await click(screen.getByRole('button', { name: 'Note' }))
    await click(screen.getByRole('button', { name: 'Save' }))

    expect(log).toHaveBeenCalledWith(expect.anything(), new Date(2026, 7, 25, 6))
    log.mockRestore()
  })
})
