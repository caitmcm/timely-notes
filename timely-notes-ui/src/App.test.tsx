import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toDayKey } from './domain/days'
import type { DayKey } from './types'
import App from './App'

// MDXEditor emits no change event under jsdom, so typing into it here could never reach autosave.
// It stands in as a plain textbox; its real behaviour is asserted in the Playwright lane.
vi.mock('./components/NoteEditor', () => ({
  default: ({
    markdown,
    onChange,
  }: {
    markdown: string
    onChange?: (markdown: string) => void
  }) => (
    <textarea
      aria-label="Note"
      defaultValue={markdown}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

/** The instant the mockup is drawn at. */
const now = new Date(2026, 7, 25, 20, 20)

/** August 2026, the month the frozen clock sits in. */
const august = (dayOfMonth: number) => toDayKey(`2026-08-${String(dayOfMonth).padStart(2, '0')}`)

/** The audit stamps are a different day throughout: only the period places a note. */
const writtenAt = new Date(2026, 7, 28, 9, 12).toISOString()

const wireNote = (day: DayKey, periodOrdinal: number, content: string) => ({
  day,
  periodOrdinal,
  content,
  createdAt: writtenAt,
  modifiedAt: writtenAt,
})

/** Newest-first, as the API answers: `s3`'s p6 is 15:00–18:00 and p4 is 09:00–12:00. */
const s3Notes = [
  wireNote(august(25), 6, 'Afternoon block: wired up FastEndpoints.'),
  wireNote(august(25), 4, 'Morning block: drafted the TDD plan.'),
]

function stubFetch(byShortName: Record<string, unknown[]> = { s3: s3Notes }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname } = new URL(url, 'http://localhost')
    const shortName = pathname.split('/')[3]

    if (init?.method === 'DELETE') {
      return { ok: true, status: 204 } as Response
    }

    if (init?.method === 'PUT') {
      // Like the real upsert: the note it answers with is the one the URL addressed.
      const [, , , , , day, period] = pathname.split('/')
      const { content } = JSON.parse(init.body as string)

      return {
        ok: true,
        status: 201,
        json: async () => wireNote(toDayKey(day), Number(period.slice(1)), content),
      } as Response
    }

    return { ok: true, status: 200, json: async () => byShortName[shortName] ?? [] } as Response
  })
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** The write requests made, as `METHOD /day/pOrdinal` — the address, which is the whole point. */
const writes = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT' || init?.method === 'DELETE')
    .map(([url, init]) => {
      const segments = new URL(url as string, 'http://localhost').pathname.split('/')

      return `${init!.method} ${segments[5]}/${segments[6]}`
    })

/** Types into the stand-in editor. The debounce is real time here, so Done is what flushes it. */
const write = async (markdown: string) => {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: markdown },
    })
  })
}

const renderApp = () => render(<App now={now} />)

/** The URLs fetch was called with, parsed. */
const requests = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map((call) => new URL(call[0] as string, 'http://localhost'))

const requestedShortNames = (fetchMock: ReturnType<typeof stubFetch>) =>
  requests(fetchMock).map((url) => url.pathname.split('/')[3])

const bounds = (url: URL) => [
  url.searchParams.get('searchFrom')!,
  url.searchParams.get('searchTo')!,
]

const section = (day: DayKey) => document.querySelector(`[data-day="${day}"]`) as HTMLElement

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
    expect(bounds(requests(fetchMock)[0])).toEqual(['2026-08-24', '2026-08-27'])
  })

  it('fetches once per schedule change, not once per render', async () => {
    const fetchMock = stubFetch({ s3: s3Notes, s6: [] })
    renderApp()
    await screen.findByText(/Afternoon block/)

    await userEvent.click(screen.getByRole('button', { name: '6h' }))

    await waitFor(() => expect(requestedShortNames(fetchMock)).toEqual(['s3', 's6']))
  })

  it('places a note by its period, not by the day it was written on', async () => {
    stubFetch()
    renderApp()

    await screen.findByText(/Morning block/)

    // The fixture's audit stamps are 28/08 09:12; the note belongs to p4 of the 25th.
    expect(row(25, '09:00 – 12:00')).toHaveTextContent('Morning block')
  })

  it('refetches with the new short name when the schedule changes', async () => {
    const fetchMock = stubFetch({ s3: s3Notes, s6: [] })
    renderApp()
    await screen.findByText(/Afternoon block/)

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
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('shows each fetched note as text against its own period, and nothing else', async () => {
    stubFetch()
    renderApp()

    await screen.findByText(/Morning block/)

    expect(row(25, '09:00 – 12:00')).toHaveTextContent('Morning block')
    expect(row(25, '15:00 – 18:00')).toHaveTextContent('Afternoon block')
    // The selected row's own button is the only one in the whole view.
    expect(screen.getAllByRole('button', { name: 'Note' })).toHaveLength(1)
  })

  // The defect this feature closes: the row said one thing and its button addressed another.
  it('opens the selected period’s own note, with its content', async () => {
    stubFetch()
    renderApp()
    await screen.findByText(/Morning block/)

    await userEvent.click(row(25, '09:00 – 12:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    expect(screen.getByRole('heading', { name: '09:00 – 12:00' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Morning block: drafted the TDD plan.')
  })

  it('leaves the row holding one entry after its note has been opened', async () => {
    stubFetch()
    renderApp()
    await screen.findByText(/Morning block/)

    await userEvent.click(row(25, '09:00 – 12:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(within(row(25, '09:00 – 12:00')).getAllByText(/Morning block/)).toHaveLength(1)
  })

  it('opens blank on an empty period straight after closing one that held a note', async () => {
    stubFetch()
    renderApp()
    await screen.findByText(/Morning block/)
    await userEvent.click(row(25, '09:00 – 12:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    await userEvent.click(row(25, '18:00 – 21:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    expect(screen.getByRole('heading', { name: '18:00 – 21:00' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('writes the note to the period it was opened on, then closes', async () => {
    const fetchMock = stubFetch()
    renderApp()
    await screen.findByRole('option', { selected: true })
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    await write('Written in the live slot.')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(writes(fetchMock)).toEqual(['PUT 2026-08-25/p7'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens and closes an untouched note without writing anything at all', async () => {
    const fetchMock = stubFetch()
    renderApp()
    await screen.findByRole('option', { selected: true })

    await userEvent.click(screen.getByRole('button', { name: 'Note' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(writes(fetchMock)).toEqual([])
  })

  it('clears the row as the empty write lands, and deletes the note on close', async () => {
    const fetchMock = stubFetch()
    renderApp()
    await screen.findByText(/Morning block/)
    await userEvent.click(row(25, '09:00 – 12:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))

    await write('')

    // Behind the still-open dialog: the empty PUT is what does it, not the close. The wait is
    // the real debounce — these tests run on real timers, so it is the two seconds the user waits.
    await waitFor(
      () =>
        expect(
          within(row(25, '09:00 – 12:00')).queryByText(/Morning block/),
        ).not.toBeInTheDocument(),
      { timeout: 4_000 },
    )

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(writes(fetchMock)).toEqual(['PUT 2026-08-25/p4', 'DELETE 2026-08-25/p4'])
  })

  it('leaves the row empty even when the delete fails', async () => {
    const fetchMock = stubFetch()
    renderApp()
    await screen.findByText(/Morning block/)
    await userEvent.click(row(25, '09:00 – 12:00'))
    await userEvent.click(screen.getByRole('button', { name: 'Note' }))
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? ({ ok: false, status: 500 } as Response)
        : ({ ok: true, status: 200, json: async () => wireNote(august(25), 4, '') } as Response),
    )

    await write('')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(within(row(25, '09:00 – 12:00')).queryByText(/Morning block/)).not.toBeInTheDocument()
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
  const onThe25th = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute)

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
      .find((option) => option.getAttribute('aria-current') === 'time')
      ?.getAttribute('aria-label')

  it('does not refetch as the clock ticks', async () => {
    const fetchMock = await mountAt(onThe25th(20, 20))

    await advance(10 * 60_000)

    expect(requests(fetchMock)).toHaveLength(1)
  })

  it('moves the current-period marker across a period boundary without a reload', async () => {
    await mountAt(onThe25th(20, 59))
    expect(currentName()).toBe('18:00 – 21:00')

    await advance(2 * 60_000)

    expect(currentName()).toBe('21:00 – 00:00')
  })

  it('carries the selection along with the marker while the view is untouched', async () => {
    await mountAt(onThe25th(20, 59))
    expect(selectedName()).toBe('18:00 – 21:00')

    await advance(2 * 60_000)

    expect(selectedName()).toBe('21:00 – 00:00')
  })

  it('does not scroll the view again when the selection follows the clock', async () => {
    // jsdom has no scrollIntoView at all, so the mount-only effect needs one to count.
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await mountAt(onThe25th(20, 59))
    const onMount = scrollIntoView.mock.calls.length
    expect(onMount).toBe(1)

    await advance(2 * 60_000)

    expect(scrollIntoView).toHaveBeenCalledTimes(onMount)
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  // The window moves one day on, and days already held are kept, so a rollover asks only for the
  // one day it has never seen.
  it('follows the clock over midnight: the window moves on, one more fetch, one new day', async () => {
    const fetchMock = await mountAt(onThe25th(23, 59))
    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])

    await advance(2 * 60_000)

    expect(headings()).toEqual(['25/08/2026', '26/08/2026', '27/08/2026'])
    expect(selectedName()).toBe('00:00 – 03:00')
    expect(requests(fetchMock)).toHaveLength(2)
    expect(bounds(requests(fetchMock)[1])).toEqual(['2026-08-27', '2026-08-28'])
  })

  it('stays put over midnight once the user has selected a row', async () => {
    const fetchMock = await mountAt(onThe25th(23, 59))
    await click(row(25, '06:00 – 09:00'))

    await advance(2 * 60_000)

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    expect(selectedName()).toBe('06:00 – 09:00')
    expect(section(august(25))).toContainElement(screen.getByRole('option', { selected: true }))
    // The new day is one of the three on show, so the marker moves on to it while the view stays.
    expect(currentName()).toBe('00:00 – 03:00')
    expect(section(august(26))).toContainElement(
      screen
        .getAllByRole('option')
        .find((option) => option.getAttribute('aria-current') === 'time')!,
    )
    expect(requests(fetchMock)).toHaveLength(1)
  })

  it('leaves an open dialog alone over midnight', async () => {
    await mountAt(onThe25th(23, 59))
    await click(screen.getByRole('button', { name: 'Note' }))
    expect(screen.getByRole('heading', { name: '21:00 – 00:00' })).toBeInTheDocument()

    await advance(2 * 60_000)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '21:00 – 00:00' })).toBeInTheDocument()
    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
  })

  // The control itself is always there; only the notice explaining it comes and goes.
  it('notices the rollover only under a committed view', async () => {
    await mountAt(onThe25th(23, 59))
    expect(rolloverNotice()).not.toBeInTheDocument()

    await click(row(25, '06:00 – 09:00'))
    await advance(2 * 60_000)

    expect(rolloverNotice()).toHaveTextContent('26/08/2026')
    expect(goToToday()).toBeInTheDocument()
  })

  it('shows no notice when the view followed the clock by itself', async () => {
    await mountAt(onThe25th(23, 59))

    await advance(2 * 60_000)

    expect(rolloverNotice()).not.toBeInTheDocument()
  })

  it('moves the view to the current day when Go to today is pressed', async () => {
    const fetchMock = await mountAt(onThe25th(23, 59))
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
    const fetchMock = await mountAt(onThe25th(20, 20))

    await click(goToToday())
    await act(async () => {})

    expect(headings()).toEqual(['24/08/2026', '25/08/2026', '26/08/2026'])
    expect(selectedName()).toBe('18:00 – 21:00')
    expect(requests(fetchMock)).toHaveLength(1)
  })

  it('addresses a new note by the day that is current when the dialog opens', async () => {
    const fetchMock = await mountAt(onThe25th(23, 59))
    await advance(6 * 60_000)

    await click(screen.getByRole('button', { name: 'Note' }))
    await advance(10 * 60_000)
    await write('Begun just after midnight.')
    await click(screen.getByRole('button', { name: 'Done' }))

    expect(writes(fetchMock)).toEqual(['PUT 2026-08-26/p1'])
  })

  it('addresses a note in a slot that is not the live one by that slot', async () => {
    const fetchMock = await mountAt(onThe25th(20, 20))
    await click(row(25, '06:00 – 09:00'))

    await click(screen.getByRole('button', { name: 'Note' }))
    await write('Written into an earlier block.')
    await click(screen.getByRole('button', { name: 'Done' }))

    expect(writes(fetchMock)).toEqual(['PUT 2026-08-25/p3'])
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
      const [from, to] = bounds(parsed)
      const inWindow = notes.filter((note) => note.day >= from && note.day < to)

      if (parsed.pathname.endsWith('/note-days')) {
        const counts = new Map<string, number>()

        for (const note of inWindow) {
          counts.set(note.day, (counts.get(note.day) ?? 0) + 1)
        }

        return {
          ok: true,
          status: 200,
          json: async () => [...counts].map(([day, count]) => ({ day, count })),
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

  const openCalendar = async () => userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

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
    expect(bounds(noteRequests(fetchMock)[before])).toEqual(['2026-07-14', '2026-07-17'])
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
    expect(section(toDayKey('2026-07-15'))).toContainElement(selected)
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
    expect(noteRequests(fetchMock).map(bounds)).toEqual([
      ['2026-08-24', '2026-08-27'],
      ['2026-07-14', '2026-07-17'],
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

  it('puts a note on the day it is addressed to, not on the day in view', async () => {
    const tomorrowsNote = wireNote(august(26), 4, 'Tomorrow: the create endpoint.')
    stubApi([...s3Notes, tomorrowsNote])
    renderApp()

    const tomorrow = await screen.findByText(/Tomorrow: the create endpoint/)

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
