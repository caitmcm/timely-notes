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
  readonly writes: WriteRequest[] = []

  private notes: Record<string, WireNote[]> = { ...NOTES }

  get writeSummary(): string[] {
    return this.writes.map((write) => `${write.method} ${write.day}/p${write.ordinal}`)
  }

  async install(page: Page) {
    await page.route(NOTES_ROUTE, async (route, request) => {
      this.notesRequests.push(new URL(request.url()))

      await this.reply(route, (shortName, from, to) =>
        (this.notes[shortName] ?? []).filter((note) => inWindow(note.day, from, to)),
      )
    })

    await page.route(NOTE_DAYS_ROUTE, async (route) => {
      await this.reply(route, (shortName, from, to) =>
        noteDaysFor((this.notes[shortName] ?? []).filter((note) => inWindow(note.day, from, to))),
      )
    })

    // Behaves like the real upsert: the same address twice is one note, 201 then 200.
    await page.route(NOTE_ROUTE, async (route, request) => {
      const { pathname } = new URL(request.url())
      const [, , , shortName, , day, period] = pathname.split('/')
      const ordinal = Number(period.slice(1))
      const method = request.method() as 'PUT' | 'DELETE'
      const content = method === 'PUT' ? JSON.parse(request.postData() ?? '{}').content : undefined

      this.writes.push({ method, shortName, day, ordinal, url: request.url(), content })

      const held = this.notes[shortName] ?? []
      const existing = held.find((note) => note.day === day && note.periodOrdinal === ordinal)
      const others = held.filter((note) => note !== existing)

      if (method === 'DELETE') {
        this.notes = { ...this.notes, [shortName]: others }
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

      this.notes = { ...this.notes, [shortName]: [...others, written] }

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
}

/**
 * The stubbed lane: a clock frozen at 20:20 on 25/08/2026 and every route fulfilled from fixtures.
 * `install()` + `pauseAt()` rather than `setFixedTime`, because the note specs run the debounce
 * forward and that needs an installed clock.
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
