import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const section = (day: Date) =>
  document.querySelector(`[data-day="${day.getTime()}"]`) as HTMLElement

/** August 2026, the month the frozen clock sits in. */
const august = (dayOfMonth: number) => new Date(2026, 7, dayOfMonth)

/** A period row on one particular day — the same slot exists on all three rendered days. */
const row = (dayOfMonth: number, name: string) =>
  within(section(august(dayOfMonth))).getByRole('option', { name })

const headings = () => screen.getAllByRole('listbox').map((list) => list.getAttribute('aria-label'))

/** The rollover notice, which comes and goes — unlike the toolbar's Go to today, which never does. */
const rolloverNotice = () => screen.queryByText(/^It is now /)

const goToToday = () => screen.getByRole('button', { name: 'Go to today' })

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

  it('renders exactly three days and asks for them in one call, half-open', async () => {
    const fetchMock = stubFetch()

    renderApp()

    await waitFor(() => expect(requests(fetchMock)).toHaveLength(1))
    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    const { searchParams } = requests(fetchMock)[0]
    expect(new Date(searchParams.get('searchFrom')!)).toEqual(august(24))
    expect(new Date(searchParams.get('searchTo')!)).toEqual(august(27))
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

    await screen.findByRole('button', { name: /Morning block/ })

    // Fixture createdAt is 28/08 09:12; the row must show the 09:00 slot on the 25th instead.
    expect(row(25, '09:00 – 12:00')).toContainElement(
      screen.getByRole('button', { name: /^09:00 Morning block/ }),
    )
  })

  it('refetches with the new short name when the schedule changes', async () => {
    const fetchMock = stubFetch({ s3: s3Notes, s6: [] })
    renderApp()
    await screen.findByRole('button', { name: /Afternoon block/ })

    await userEvent.click(screen.getByRole('button', { name: '6h' }))

    await waitFor(() => expect(requestedShortNames(fetchMock)).toContain('s6'))
    expect(screen.getAllByRole('option')).toHaveLength(12)
  })

  it('shows an error instead of a blank page when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i)
    expect(screen.getAllByRole('option')).toHaveLength(24)
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

    await userEvent.click(row(25, '06:00 – 09:00'))

    const selected = screen.getByRole('option', { selected: true })
    expect(selected).toHaveAccessibleName('06:00 – 09:00')
    expect(selected).toContainElement(screen.getByRole('button', { name: 'Note' }))
    expect(row(25, '18:00 – 21:00')).toHaveAttribute('aria-current', 'time')
  })

  it('does not open the editor when a row is merely selected', async () => {
    stubFetch()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(row(25, '06:00 – 09:00'))

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

    await screen.findByRole('button', { name: /Morning block/ })

    expect(row(25, '09:00 – 12:00')).toContainElement(
      screen.getByRole('button', { name: /Morning block/ }),
    )
    expect(row(25, '15:00 – 18:00')).toContainElement(
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

  // The window moves one day on, and days already held are kept, so a rollover asks only for the
  // one day it has never seen.
  it('follows the clock over midnight: the window moves on, one more fetch, one new day', async () => {
    const fetchMock = await mountAt(dayBefore(23, 59))
    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])

    await advance(2 * 60_000)

    expect(headings()).toEqual(['25/08/2026', '26/08/2026', '27/08/2026'])
    expect(selectedName()).toBe('00:00 – 03:00')
    expect(requests(fetchMock)).toHaveLength(2)
    const { searchParams } = requests(fetchMock)[1]
    expect(new Date(searchParams.get('searchFrom')!)).toEqual(new Date(2026, 7, 27))
    expect(new Date(searchParams.get('searchTo')!)).toEqual(new Date(2026, 7, 28))
  })

  it('stays put over midnight once the user has selected a row', async () => {
    const fetchMock = await mountAt(dayBefore(23, 59))
    await click(row(25, '06:00 – 09:00'))

    await advance(2 * 60_000)

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    expect(selectedName()).toBe('06:00 – 09:00')
    expect(section(august(25))).toContainElement(screen.getByRole('option', { selected: true }))
    // The new day is one of the three on show, so the marker moves on to it while the view stays.
    expect(currentName()).toBe('00:00 – 03:00')
    expect(section(august(26))).toContainElement(
      screen.getAllByRole('option').find((option) => option.getAttribute('aria-current') === 'time')!,
    )
    expect(requests(fetchMock)).toHaveLength(1)
  })

  it('leaves an open dialog alone over midnight', async () => {
    await mountAt(dayBefore(23, 59))
    await click(screen.getByRole('button', { name: 'Note' }))
    expect(screen.getByRole('heading', { name: '21:00 – 00:00' })).toBeInTheDocument()

    await advance(2 * 60_000)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '21:00 – 00:00' })).toBeInTheDocument()
    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
  })

  // The control itself is always there; only the notice explaining it comes and goes.
  it('notices the rollover only under a committed view', async () => {
    await mountAt(dayBefore(23, 59))
    expect(rolloverNotice()).not.toBeInTheDocument()

    await click(row(25, '06:00 – 09:00'))
    await advance(2 * 60_000)

    expect(rolloverNotice()).toHaveTextContent('26/08/2026')
    expect(goToToday()).toBeInTheDocument()
  })

  it('shows no notice when the view followed the clock by itself', async () => {
    await mountAt(dayBefore(23, 59))

    await advance(2 * 60_000)

    expect(rolloverNotice()).not.toBeInTheDocument()
  })

  it('moves the view to the current day when Go to today is pressed', async () => {
    const fetchMock = await mountAt(dayBefore(23, 59))
    await click(row(25, '06:00 – 09:00'))
    await advance(2 * 60_000)

    await click(goToToday())
    await act(async () => {})

    expect(headings()).toEqual(['25/08/2026', '26/08/2026', '27/08/2026'])
    expect(selectedName()).toBe('00:00 – 03:00')
    expect(rolloverNotice()).not.toBeInTheDocument()
    expect(requests(fetchMock)).toHaveLength(2)
  })

  it('leaves the view alone when Go to today is pressed on the current day', async () => {
    const fetchMock = await mountAt(dayBefore(20, 20))

    await click(goToToday())
    await act(async () => {})

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    expect(selectedName()).toBe('18:00 – 21:00')
    expect(requests(fetchMock)).toHaveLength(1)
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
    await click(row(25, '06:00 – 09:00'))

    await click(screen.getByRole('button', { name: 'Note' }))
    await click(screen.getByRole('button', { name: 'Save' }))

    expect(log).toHaveBeenCalledWith(expect.anything(), new Date(2026, 7, 25, 6))
    log.mockRestore()
  })
})

/**
 * The bounded view and the calendar that navigates it. `ScrollingSchedule.MD`'s growth and anchor
 * tests are gone with the machinery they covered: there is no observer, no sentinel and no range.
 */
describe('App — calendar navigation', () => {
  /** Answers both routes like the API: the notes route honours the window, note-days counts them. */
  function stubApi(notes: ReturnType<typeof wireNote>[] = s3Notes) {
    const fetchMock = vi.fn(async (url: string) => {
      const parsed = new URL(url, 'http://localhost')
      const from = new Date(parsed.searchParams.get('searchFrom')!).getTime()
      const to = new Date(parsed.searchParams.get('searchTo')!).getTime()
      const inWindow = notes.filter((note) => {
        const at = new Date(note.occursAt).getTime()

        return at >= from && at < to
      })

      if (parsed.pathname.endsWith('/note-days')) {
        const counts = new Map<number, number>()

        for (const note of inWindow) {
          const at = new Date(note.occursAt)
          const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
          counts.set(day, (counts.get(day) ?? 0) + 1)
        }

        return {
          ok: true,
          status: 200,
          json: async () =>
            [...counts].map(([day, count]) => ({ day: new Date(day).toISOString(), count })),
        } as Response
      }

      return { ok: true, status: 200, json: async () => inWindow } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
  }

  const noteRequests = (fetchMock: ReturnType<typeof stubApi>) =>
    requests(fetchMock).filter((url) => url.pathname.endsWith('/notes'))

  const countRequests = (fetchMock: ReturnType<typeof stubApi>) =>
    requests(fetchMock).filter((url) => url.pathname.endsWith('/note-days'))

  const windowOf = (url: URL) => [
    new Date(url.searchParams.get('searchFrom')!),
    new Date(url.searchParams.get('searchTo')!),
  ]

  const openCalendar = async () =>
    userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the focus day and its two neighbours, and nothing more', async () => {
    stubApi()
    renderApp()

    await screen.findByRole('option', { selected: true })

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
  })

  it('requests no counts until the calendar is opened', async () => {
    const fetchMock = stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })

    expect(countRequests(fetchMock)).toHaveLength(0)

    await openCalendar()

    await waitFor(() => expect(countRequests(fetchMock)).toHaveLength(1))
  })

  it('opens on the month holding the focus day, marked where notes are', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await openCalendar()

    expect(screen.getByText('August 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '25, 2 notes' })).toBeInTheDocument(),
    )
  })

  it('re-points the view at a day picked in another month, in one request', async () => {
    const fetchMock = stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()
    const before = noteRequests(fetchMock).length

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    expect(headings()).toEqual(['14/07/2026', '15/07/2026', '16/07/2026'])
    await waitFor(() => expect(noteRequests(fetchMock)).toHaveLength(before + 1))
    expect(windowOf(noteRequests(fetchMock)[before])).toEqual([
      new Date(2026, 6, 14),
      new Date(2026, 6, 17),
    ])
  })

  it('selects the first period of a day picked in the past', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    const selected = screen.getByRole('option', { selected: true })
    expect(selected).toHaveAccessibleName('00:00 – 03:00')
    expect(section(new Date(2026, 6, 15))).toContainElement(selected)
  })

  it('notices a calendar jump, and closes the calendar', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    expect(rolloverNotice()).not.toBeInTheDocument()

    await openCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    expect(rolloverNotice()).toHaveTextContent('25/08/2026')
    expect(screen.queryByText('July 2026')).not.toBeInTheDocument()
  })

  it('offers Go to today in the toolbar wherever the view is', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    expect(goToToday()).toBeInTheDocument()

    await openCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    expect(goToToday()).toBeInTheDocument()
  })

  it('picking the current day is Go to today', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    // Reopened on the month it was sent to, so today is one month on from there.
    await openCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await userEvent.click(screen.getByRole('button', { name: /^25(,|$)/ }))

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    expect(screen.getByRole('option', { selected: true })).toHaveAccessibleName('18:00 – 21:00')
    expect(rolloverNotice()).not.toBeInTheDocument()
  })

  it('goes back to the current three days from a jump', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    await userEvent.click(goToToday())

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
  })

  it('asks for nothing between here and a day jumped to', async () => {
    const fetchMock = stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: '15' }))

    await waitFor(() => expect(noteRequests(fetchMock)).toHaveLength(2))
    expect(noteRequests(fetchMock).map(windowOf)).toEqual([
      [august(24), august(27)],
      [new Date(2026, 6, 14), new Date(2026, 6, 17)],
    ])
  })

  it('keeps the calendar open across a schedule change and re-asks for the counts', async () => {
    const fetchMock = stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()
    await waitFor(() => expect(countRequests(fetchMock)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: '6h' }))

    expect(screen.getByText('August 2026')).toBeInTheDocument()
    await waitFor(() =>
      expect(countRequests(fetchMock).map((url) => url.pathname.split('/')[3])).toEqual([
        's3',
        's6',
      ]),
    )
  })

  it('asks for a month grid once, however often it is paged back to', async () => {
    const fetchMock = stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()
    await waitFor(() => expect(countRequests(fetchMock)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(countRequests(fetchMock)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))

    expect(countRequests(fetchMock)).toHaveLength(2)
  })

  it('closes on Escape and leaves the view where it was', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await openCalendar()

    fireEvent(document.querySelector('dialog')!, new Event('cancel'))

    expect(screen.queryByText('August 2026')).not.toBeInTheDocument()
    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
  })

  it('puts a note on the day it occurs on, not on the day in view', async () => {
    const tomorrowsNote = {
      ...wireNote('s3-tomorrow', 9, 'Tomorrow: the create endpoint.'),
      occursAt: new Date(2026, 7, 26, 9).toISOString(),
    }
    stubApi([...s3Notes, tomorrowsNote])
    renderApp()

    const tomorrow = await screen.findByRole('button', { name: /Tomorrow: the create endpoint/ })

    expect(section(august(26))).toContainElement(tomorrow)
    expect(section(august(25))).not.toContainElement(tomorrow)
  })

  it('says a day is loading until its notes land, without hiding its rows', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    renderApp()

    expect(within(section(august(26))).getByRole('status')).toHaveTextContent(/loading notes/i)
    expect(within(section(august(26))).getAllByRole('option')).toHaveLength(8)
  })

  it('moves the selection onto another day when a row there is chosen', async () => {
    stubApi()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(row(26, '06:00 – 09:00'))

    const selected = screen.getAllByRole('option', { selected: true })
    expect(selected).toHaveLength(1)
    expect(section(august(26))).toContainElement(selected[0])
  })
})
