import { test as base, type Page } from '@playwright/test'
import { FROZEN_NOW, NOTES, WRITTEN_AT, inWindow, noteDaysFor, type WireNote } from './notes'
import { ScheduleView } from './ScheduleView'

const NOTES_ROUTE = '**/api/schedules/*/notes*'
// A second pattern is not optional: `notes*` does not match `note-days`, so one route would leave
// the calendar's requests escaping to a backend the stubbed lane does not run.
const NOTE_DAYS_ROUTE = '**/api/schedules/*/note-days*'
// A third: `*` stops at a separator, so `notes*` never reaches `/notes/2026-08-25/p4`.
const NOTE_ROUTE = '**/api/schedules/*/notes/*/*'

/** How far behind the frozen instant the clock starts — margin for the page load, not a wait. */
const INSTALL_LEAD_MS = 10 * 60 * 1000

const windowsOf = (requests: URL[]) => [
  ...new Set(
    requests.map(
      (url) =>
        `${url.pathname.split('/')[3]} ${url.searchParams.get('searchFrom')} ${url.searchParams.get('searchTo')}`,
    ),
  ),
]

/** A write the browser made, as the spec reads it: the verb, the address, and what was sent. */
export interface WriteRequest {
  method: 'PUT' | 'DELETE'
  shortName: string
  day: string
  ordinal: number
  url: string
  content?: string
}

/** Both read routes, stubbed from the fixtures and recording what the browser actually asked for. */
export class ApiStub {
  readonly notesRequests: URL[] = []
  readonly noteDayRequests: URL[] = []
  readonly writes: WriteRequest[] = []

  private notes: Record<string, WireNote[]> = { ...NOTES }
  private status = 200
  private delayMs = 0
  private failWrites: number | null = null

  /** Reply to everything with this status instead; the body is an empty problem document. */
  failWith(status: number) {
    this.status = status
  }

  /** Hold every reply back, so the loading state is observable. */
  delayBy(milliseconds: number) {
    this.delayMs = milliseconds
  }

  setNotes(shortName: string, notes: WireNote[]) {
    this.notes = { ...this.notes, [shortName]: notes }
  }

  /** Answer every write with this status instead, leaving the store alone. */
  failWritesWith(status: number) {
    this.failWrites = status
  }

  /** Take a note out from under an open dialog, as a prune would. */
  dropNote(shortName: string, day: string, ordinal: number) {
    this.notes = {
      ...this.notes,
      [shortName]: (this.notes[shortName] ?? []).filter(
        (note) => !(note.day === day && note.periodOrdinal === ordinal),
      ),
    }
  }

  /** What the store holds for a period — the assertion that it *became* something, not just was sent. */
  noteAt(shortName: string, day: string, ordinal: number): WireNote | undefined {
    return (this.notes[shortName] ?? []).find(
      (note) => note.day === day && note.periodOrdinal === ordinal,
    )
  }

  countAt(shortName: string, day: string, ordinal: number): number {
    return (this.notes[shortName] ?? []).filter(
      (note) => note.day === day && note.periodOrdinal === ordinal,
    ).length
  }

  get writeSummary(): string[] {
    return this.writes.map((write) => `${write.method} ${write.day}/p${write.ordinal}`)
  }

  get requests(): URL[] {
    return [...this.notesRequests, ...this.noteDayRequests]
  }

  /**
   * The distinct windows asked for, first seen first — `shortName searchFrom searchTo`. Counts go
   * through this rather than through the raw requests because `StrictMode` runs every effect twice
   * in dev, so the same window legitimately arrives twice; what the specs are asserting is that no
   * render and no clock tick asks for a *new* one.
   */
  get notesWindows(): string[] {
    return windowsOf(this.notesRequests)
  }

  get noteDayWindows(): string[] {
    return windowsOf(this.noteDayRequests)
  }

  async install(page: Page) {
    await page.route(NOTES_ROUTE, async (route, request) => {
      const url = new URL(request.url())
      this.notesRequests.push(url)

      await this.reply(route, (shortName, from, to) =>
        (this.notes[shortName] ?? []).filter((note) => inWindow(note.day, from, to)),
      )
    })

    await page.route(NOTE_DAYS_ROUTE, async (route, request) => {
      const url = new URL(request.url())
      this.noteDayRequests.push(url)

      await this.reply(route, (shortName, from, to) =>
        noteDaysFor((this.notes[shortName] ?? []).filter((note) => inWindow(note.day, from, to))),
      )
    })

    // Behaves like the real upsert, so a spec can assert what the store *became*, not only what
    // was sent: the same address twice is one note, 201 then 200.
    await page.route(NOTE_ROUTE, async (route, request) => {
      const { pathname } = new URL(request.url())
      const [, , , shortName, , day, period] = pathname.split('/')
      const ordinal = Number(period.slice(1))
      const method = request.method() as 'PUT' | 'DELETE'
      const content = method === 'PUT' ? JSON.parse(request.postData() ?? '{}').content : undefined

      this.writes.push({ method, shortName, day, ordinal, url: request.url(), content })

      if (this.failWrites !== null) {
        await route.fulfill({ status: this.failWrites, contentType: 'application/json', body: '{}' })

        return
      }

      const held = this.notes[shortName] ?? []
      const existing = held.find((note) => note.day === day && note.periodOrdinal === ordinal)

      if (method === 'DELETE') {
        this.dropNote(shortName, day, ordinal)
        await route.fulfill({ status: existing ? 204 : 404 })

        return
      }

      const written: WireNote = {
        day,
        periodOrdinal: ordinal,
        content: content ?? '',
        createdAt: existing?.createdAt ?? WRITTEN_AT,
        modifiedAt: WRITTEN_AT,
      }

      this.notes = {
        ...this.notes,
        [shortName]: [...held.filter((note) => note !== existing), written],
      }

      await route.fulfill({
        status: existing ? 200 : 201,
        contentType: 'application/json',
        body: JSON.stringify(written),
      })
    })
  }

  private async reply(
    route: Parameters<Parameters<Page['route']>[1]>[0],
    body: (shortName: string, searchFrom: string, searchTo: string) => unknown,
  ) {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    }

    if (this.status !== 200) {
      await route.fulfill({ status: this.status, contentType: 'application/json', body: '{}' })

      return
    }

    const url = new URL(route.request().url())
    const shortName = url.pathname.split('/')[3]
    const searchFrom = url.searchParams.get('searchFrom') ?? ''
    const searchTo = url.searchParams.get('searchTo') ?? ''

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body(shortName, searchFrom, searchTo)),
    })
  }
}

interface AppFixtures {
  api: ApiStub
  scheduleView: ScheduleView
  /** Everything the page logged, in order. Nothing in the app logs any more; kept for a stray one. */
  logs: string[]
}

/**
 * The stubbed lane: a clock frozen at 20:20 on 25/08/2026 and both read routes fulfilled from
 * fixtures. `install()` + `pauseAt()` rather than `setFixedTime`, because §4 fast-forwards across
 * midnight and that needs an installed clock.
 */
export const test = base.extend<AppFixtures>({
  page: async ({ page }, use) => {
    // Before the first navigation: `useNow` reads the clock on mount and keeps reading it. Installed
    // a little *behind* the frozen instant, so `open()` can pause forward onto it once the page is
    // up — until then the clock runs at wall speed, and a loaded worker takes seconds over the load.
    await page.clock.install({ time: new Date(FROZEN_NOW.getTime() - INSTALL_LEAD_MS) })

    await use(page)
  },

  api: [
    async ({ page }, use) => {
      const api = new ApiStub()
      await api.install(page)

      await use(api)
    },
    { auto: true },
  ],

  logs: async ({ page }, use) => {
    const logs: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'log') {
        logs.push(message.text())
      }
    })

    await use(logs)
  },

  scheduleView: async ({ page }, use) => {
    await use(new ScheduleView(page, FROZEN_NOW))
  },
})

/**
 * The integrated lane: the real API and the real proxy, so nothing is stubbed. The seed is anchored
 * to the API process's `DateTime.Today`, so the clock is frozen at a fixed *time of day* on
 * today's date — never on a fixed date, and never fast-forwarded across midnight.
 */
export const integratedTest = base.extend<{ frozenAt: Date; scheduleView: ScheduleView }>({
  frozenAt: async ({ browser }, use) => {
    // Asked of the browser, whose zone is the pinned one — Node's is not.
    const probe = await browser.newPage()
    const today = await probe.evaluate(() => {
      const at = new Date()

      return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 14, 20).getTime()
    })
    await probe.close()

    await use(new Date(today))
  },

  page: async ({ page, frozenAt }, use) => {
    await page.clock.install({ time: new Date(frozenAt.getTime() - INSTALL_LEAD_MS) })

    await use(page)
  },

  scheduleView: async ({ page, frozenAt }, use) => {
    await use(new ScheduleView(page, frozenAt))
  },
})

export { expect } from '@playwright/test'
