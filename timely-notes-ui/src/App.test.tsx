import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

/** 20:20 on 25/08/2026 — the instant the mockup is drawn at. */
const now = new Date(2026, 7, 25, 20, 20)

const iso = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute).toISOString()

/** The write time is a different day throughout: only `occursAt` decides where a note lands. */
const writtenAt = new Date(2026, 7, 28, 9, 12).toISOString()

const wireNote = (id: string, hour: number, content: string) => ({
  id,
  content,
  occursAt: iso(hour),
  createdAt: writtenAt,
  modifiedAt: writtenAt,
})

/** The API answers newest-first, so the fixtures do too. */
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

    // The fixtures' createdAt is 28/08 09:12; the row shows the 09:00 slot it occurs in.
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
