import { getNotesBySchedule } from './notesApi'

const wireNote = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  content: 'Afternoon block: wired up FastEndpoints.',
  createdAt: '2026-08-25T15:00:00+01:00',
  modifiedAt: '2026-08-25T15:00:00+01:00',
  ...overrides,
})

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

describe('getNotesBySchedule', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the schedule notes route for the given short name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await getNotesBySchedule('s3', new AbortController().signal)

    expect(fetchMock).toHaveBeenCalledWith('/api/schedules/s3/notes', expect.anything())
  })

  it('forwards the abort signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const { signal } = new AbortController()

    await getNotesBySchedule('s1', signal)

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal })
  })

  it('maps the JSON payload to notes with parsed dates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([wireNote()])))

    const notes = await getNotesBySchedule('s3', new AbortController().signal)

    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('11111111-1111-1111-1111-111111111111')
    expect(notes[0].content).toBe('Afternoon block: wired up FastEndpoints.')
    expect(notes[0].createdAt).toBeInstanceOf(Date)
    expect(notes[0].createdAt.toISOString()).toBe('2026-08-25T14:00:00.000Z')
    expect(notes[0].modifiedAt).toBeInstanceOf(Date)
  })

  it('rejects on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response),
    )

    await expect(getNotesBySchedule('s3', new AbortController().signal)).rejects.toThrow(/500/)
  })
})
