import { deleteNote, getNoteDaysBySchedule, getNotesBySchedule, saveNote } from './notesApi'
import { toDayKey } from '../domain/days'
import { EITHER_SIDE_OF_GREENWICH, inTimezone } from '../test/timezone'

/** The default window App sends: yesterday, to the day after tomorrow — half-open. */
const searchFrom = toDayKey('2026-08-24')
const searchTo = toDayKey('2026-08-27')

const wireNote = (overrides: Record<string, unknown> = {}) => ({
  day: '2026-08-25',
  periodOrdinal: 6,
  content: 'Afternoon block: wired up FastEndpoints.',
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

  it('sends both bounds as the plain days it was given', async () => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    const { searchParams } = calledUrl(fetchMock).parsed
    expect(searchParams.get('searchFrom')).toBe('2026-08-24')
    expect(searchParams.get('searchTo')).toBe('2026-08-27')
  })

  it('leaves nothing in the query needing an escape', async () => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    const { raw } = calledUrl(fetchMock)
    expect(raw.slice(raw.indexOf('?'))).not.toMatch(/%/)
  })

  // There is nothing left in the request an offset could change; this is what says so.
  it.each(EITHER_SIDE_OF_GREENWICH)('asks for the same URL in %s', async (zone) => {
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)
    const here = calledUrl(fetchMock).raw

    let there = ''
    await inTimezone(zone, async () => {
      await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)
      there = fetchMock.mock.calls[1][0]
    })

    expect(there).toBe(here)
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = stubFetch()
    const { signal } = new AbortController()

    await getNotesBySchedule('s1', searchFrom, searchTo, signal)

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal })
  })

  it('maps the payload to a note addressed by its day and period', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote()])))

    const notes = await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    expect(notes).toHaveLength(1)
    expect(notes[0].ordinal).toBe(6)
    expect(notes[0].content).toBe('Afternoon block: wired up FastEndpoints.')
  })

  // No Date round-trip anywhere in the client: `new Date('2026-08-25')` is UTC midnight.
  it.each(EITHER_SIDE_OF_GREENWICH)('carries the day through verbatim in %s', async (zone) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote()])))

    let day = ''
    await inTimezone(zone, async () => {
      const [note] = await getNotesBySchedule(
        's3',
        searchFrom,
        searchTo,
        new AbortController().signal,
      )
      day = note.day
    })

    expect(day).toBe('2026-08-25')
  })

  it('parses the audit stamps, which are the only instants left', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote()])))

    const [note] = await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    expect(note.createdAt).toBeInstanceOf(Date)
    expect(note.createdAt.toISOString()).toBe('2026-08-28T08:12:33.000Z')
    expect(note.modifiedAt).toBeInstanceOf(Date)
  })

  it('rejects a day the server could not have sent, rather than passing it on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote({ day: '25/08/2026' })])))

    await expect(
      getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal),
    ).rejects.toThrow(/day/i)
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

describe('getNoteDaysBySchedule', () => {
  const gridFrom = toDayKey('2026-08-31')
  const gridTo = toDayKey('2026-10-05')

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the note-days route for the given short name', async () => {
    const fetchMock = stubFetch()

    await getNoteDaysBySchedule('s3', gridFrom, gridTo, new AbortController().signal)

    expect(calledUrl(fetchMock).parsed.pathname).toBe('/api/schedules/s3/note-days')
  })

  it('sends both bounds as plain days, with nothing to escape', async () => {
    const fetchMock = stubFetch()

    await getNoteDaysBySchedule('s1', gridFrom, gridTo, new AbortController().signal)

    const { raw, parsed } = calledUrl(fetchMock)
    expect(parsed.searchParams.get('searchFrom')).toBe('2026-08-31')
    expect(parsed.searchParams.get('searchTo')).toBe('2026-10-05')
    expect(raw.slice(raw.indexOf('?'))).not.toMatch(/%/)
  })

  it('carries each day through verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([{ day: '2026-09-03', count: 2 }])))

    const days = await getNoteDaysBySchedule('s1', gridFrom, gridTo, new AbortController().signal)

    expect(days).toEqual([{ day: '2026-09-03', count: 2 }])
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = stubFetch()
    const { signal } = new AbortController()

    await getNoteDaysBySchedule('s1', gridFrom, gridTo, signal)

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal })
  })

  it('rejects on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    await expect(
      getNoteDaysBySchedule('s1', gridFrom, gridTo, new AbortController().signal),
    ).rejects.toThrow(/500/)
  })
})

describe('the API origin', () => {
  const gridFrom = toDayKey('2026-08-31')
  const gridTo = toDayKey('2026-10-05')

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('calls the same origin when no API origin is configured', async () => {
    vi.stubEnv('VITE_API_BASE_URL', undefined)
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    expect(calledUrl(fetchMock).raw).toMatch(/^\/api\//)
  })

  it('calls the configured API origin when one is set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.net')
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    const { parsed } = calledUrl(fetchMock)
    expect(parsed.origin).toBe('https://api.example.net')
    expect(parsed.pathname).toBe('/api/schedules/s3/notes')
  })

  it('sends the note-days route to the configured origin too', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.net')
    const fetchMock = stubFetch()

    await getNoteDaysBySchedule('s1', gridFrom, gridTo, new AbortController().signal)

    const { parsed } = calledUrl(fetchMock)
    expect(parsed.origin).toBe('https://api.example.net')
    expect(parsed.pathname).toBe('/api/schedules/s1/note-days')
  })

  // The value is pasted into a deployment setting by hand; a trailing slash is the likely typo.
  it('tolerates a trailing slash on the configured origin', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.net/')
    const fetchMock = stubFetch()

    await getNotesBySchedule('s3', searchFrom, searchTo, new AbortController().signal)

    expect(calledUrl(fetchMock).parsed.pathname).toBe('/api/schedules/s3/notes')
  })
})

describe('saveNote', () => {
  const day = toDayKey('2026-08-25')

  const createdResponse = (body: unknown) =>
    ({ ok: true, status: 201, json: async () => body }) as Response

  /** A write answers with the one note it wrote, not with a list. */
  const stubSave = () => {
    const fetchMock = vi.fn().mockResolvedValue(createdResponse(wireNote({ periodOrdinal: 4 })))
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('PUTs to the period the note is addressed by', async () => {
    const fetchMock = stubSave()

    await saveNote('s3', day, 4, 'Written.', new AbortController().signal)

    const { parsed } = calledUrl(fetchMock)
    // Structural, so the assertion holds in any timezone: nothing here depends on an offset.
    const segments = parsed.pathname.split('/')
    expect(segments.slice(1, 4)).toEqual(['api', 'schedules', 's3'])
    expect(segments[4]).toBe('notes')
    expect(segments[5]).toBe(day)
    expect(segments[6]).toBe('p4')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT' })
  })

  it('leaves the path needing no escape, and gives it none', async () => {
    const fetchMock = stubSave()

    await saveNote('s3', day, 4, 'Written.', new AbortController().signal)

    expect(calledUrl(fetchMock).raw).not.toMatch(/%/)
  })

  // The address now decides *which* note, so a Date creeping back in would write to the wrong one.
  it.each(EITHER_SIDE_OF_GREENWICH)('PUTs to the identical URL in %s', async (zone) => {
    const fetchMock = stubSave()

    await saveNote('s3', day, 4, 'Written.', new AbortController().signal)
    const here = calledUrl(fetchMock).raw

    let there = ''
    await inTimezone(zone, async () => {
      await saveNote('s3', day, 4, 'Written.', new AbortController().signal)
      there = fetchMock.mock.calls[1][0]
    })

    expect(there).toBe(here)
  })

  it('sends a body carrying content and nothing else', async () => {
    const fetchMock = stubSave()

    await saveNote('s3', day, 4, 'Written.', new AbortController().signal)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ content: 'Written.' })
  })

  it('sends empty content as content, not as an omission', async () => {
    const fetchMock = stubSave()

    await saveNote('s3', day, 4, '', new AbortController().signal)

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: '' })
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = stubSave()
    const { signal } = new AbortController()

    await saveNote('s3', day, 4, 'Written.', signal)

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal })
  })

  // The client wanted a note in that period and it has one; which path the server took is its business.
  it.each([
    ['created', createdResponse],
    ['replaced', okResponse],
  ])('parses a %s response the same way', async (_outcome, respond) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(wireNote({ periodOrdinal: 4 }))))

    const note = await saveNote('s3', day, 4, 'Written.', new AbortController().signal)

    expect(note.day).toBe('2026-08-25')
    expect(note.ordinal).toBe(4)
    expect(note.createdAt).toBeInstanceOf(Date)
  })

  it('rejects on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    await expect(
      saveNote('s3', day, 4, 'Written.', new AbortController().signal),
    ).rejects.toThrow(/500/)
  })
})

describe('deleteNote', () => {
  const day = toDayKey('2026-08-25')

  const noContent = () => ({ ok: true, status: 204 }) as Response
  const notFound = () => ({ ok: false, status: 404 }) as Response

  const stubDelete = (response: Response = noContent()) => {
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    return fetchMock
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DELETEs the period, with no body', async () => {
    const fetchMock = stubDelete()

    await deleteNote('s3', day, 4)

    const segments = calledUrl(fetchMock).parsed.pathname.split('/')
    expect(segments[5]).toBe(day)
    expect(segments[6]).toBe('p4')
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })

  it('resolves on 204', async () => {
    stubDelete()

    await expect(deleteNote('s3', day, 4)).resolves.toBeUndefined()
  })

  // It is already gone, which is the outcome asked for.
  it('treats a 404 as success', async () => {
    stubDelete(notFound())

    await expect(deleteNote('s3', day, 4)).resolves.toBeUndefined()
  })

  it('rejects on any other failure', async () => {
    stubDelete({ ok: false, status: 500 } as Response)

    await expect(deleteNote('s3', day, 4)).rejects.toThrow(/500/)
  })

  it('is callable with no signal at all', async () => {
    const fetchMock = stubDelete()

    await deleteNote('s3', day, 4)

    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined()
  })

  it('forwards a signal when it is given one', async () => {
    const fetchMock = stubDelete()
    const { signal } = new AbortController()

    await deleteNote('s3', day, 4, signal)

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal })
  })
})
