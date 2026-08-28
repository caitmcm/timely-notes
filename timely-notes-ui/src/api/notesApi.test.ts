import { getNotesBySchedule } from './notesApi'

/** The default window App sends: yesterday's local midnight to the day after tomorrow's. */
const searchFrom = new Date(2026, 7, 24)
const searchTo = new Date(2026, 7, 27)

const wireNote = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  content: 'Afternoon block: wired up FastEndpoints.',
  occursAt: '2026-08-25T15:00:00+01:00',
  createdAt: '2026-08-28T09:12:33+01:00',
  modifiedAt: '2026-08-28T09:12:33+01:00',
  ...overrides,
})

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

const stubFetch = () => {
  const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
  vi.stubGlobal('fetch', fetchMock)

  return fetchMock
}

/** The raw URL fetch was called with, and the same URL parsed. */
const calledUrl = (fetchMock: ReturnType<typeof stubFetch>) => {
  const raw: string = fetchMock.mock.calls[0][0]

  return { raw, parsed: new URL(raw, 'http://localhost') }
}

describe('getNotesBySchedule', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the schedule notes route for the given short name', async () => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    expect(calledUrl(fetchMock).parsed.pathname).toBe('/api/schedules/s3/notes')
  })

  it('sends the window as searchFrom and searchTo query parameters', async () => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    const { searchParams } = calledUrl(fetchMock).parsed
    expect(new Date(searchParams.get('searchFrom')!).getTime()).toBe(searchFrom.getTime())
    expect(new Date(searchParams.get('searchTo')!).getTime()).toBe(searchTo.getTime())
  })

  it('serialises the bounds as ISO 8601 instants carrying their UTC offset', async () => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    const { searchParams } = calledUrl(fetchMock).parsed
    const offsetIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/
    expect(searchParams.get('searchFrom')).toMatch(offsetIso)
    expect(searchParams.get('searchTo')).toMatch(offsetIso)
  })

  it('percent-encodes the bounds, so a + offset is not read as a space', async () => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    const { raw } = calledUrl(fetchMock)
    expect(raw.slice(raw.indexOf('?'))).not.toMatch(/[+:]/)
    expect(raw).toContain('%3A')
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = stubFetch()
    const { signal } = new AbortController()

    await getNotesBySchedule('s1', searchFrom, searchTo, signal)

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal })
  })

  it('maps the JSON payload to notes with parsed dates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote()])))

    const notes = await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('11111111-1111-1111-1111-111111111111')
    expect(notes[0].content).toBe('Afternoon block: wired up FastEndpoints.')
    expect(notes[0].occursAt).toBeInstanceOf(Date)
    expect(notes[0].occursAt.toISOString()).toBe('2026-08-25T14:00:00.000Z')
    expect(notes[0].createdAt).toBeInstanceOf(Date)
    expect(notes[0].modifiedAt).toBeInstanceOf(Date)
  })

  it('keeps occursAt independent of createdAt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote()])))

    const [note] = await getNotesBySchedule(
      's3',
      searchFrom,
      searchTo,
      new AbortController().signal,
    )

    expect(note.occursAt.getTime()).not.toBe(note.createdAt.getTime())
  })

  it('rejects on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    await expect(
      getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal),
    ).rejects.toThrow(/500/)
  })
})
