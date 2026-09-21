import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildPeriods } from '../domain/periods'
import { toDayKey } from '../domain/days'
import ScheduleView, { type DayView } from './ScheduleView'

const day = (dayOfMonth: number) => toDayKey(`2026-08-${dayOfMonth}`)
const now = new Date(2026, 7, 25, 20, 20)

const dayView = (dayOfMonth: number, isLoading = false): DayView => ({
  day: day(dayOfMonth),
  periods: buildPeriods(3),
  isLoading,
})

/** The three days App always renders: the anchor and its neighbours. */
const threeDays = [dayView(24), dayView(25), dayView(26)]

/** The window one step on, and one step back: consecutive windows abut. */
const laterDays = [dayView(27), dayView(28), dayView(29)]
const earlierDays = [dayView(21), dayView(22), dayView(23)]

function renderView(overrides: Partial<React.ComponentProps<typeof ScheduleView>> = {}) {
  const props = {
    days: threeDays,
    spanHours: 3 as const,
    now,
    selectedDay: day(25),
    selectedOrdinal: 7,
    onSelect: vi.fn(),
    onOpenNote: vi.fn(),
    onShowEarlier: vi.fn(),
    onShowLater: vi.fn(),
    ...overrides,
  }

  const view = render(<ScheduleView {...props} />)

  return { ...view, props }
}

/** The day-level scrolls only: a section is scrolled to an edge, a row to the nearest one. */
const toDays = (scrollIntoView: ReturnType<typeof vi.fn>) =>
  scrollIntoView.mock.calls.filter(([options]) => options?.block === 'start' || options?.block === 'end')

const section = (dayOfMonth: number) =>
  document.querySelector(`[data-day="${day(dayOfMonth)}"]`) as HTMLElement

/** jsdom has no `scrollIntoView` at all, so a spy is what makes the scrolls countable. */
function watchScrolling() {
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView

  return { scrollIntoView }
}

describe('ScheduleView', () => {
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('renders one day section per day, in order, in the one scroll container', () => {
    renderView()

    expect(screen.getAllByRole('listbox').map((list) => list.getAttribute('aria-label'))).toEqual([
      '24/08/2026',
      '25/08/2026',
      '26/08/2026',
    ])
    expect(screen.getByTestId('schedule-scroll')).toContainElement(section(24))
  })

  // Navigation is the header's, above this component entirely — except the two arrows, which page
  // the window and therefore have to scroll with it.
  it('carries no navigation of its own but the two arrows', () => {
    renderView()

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument()
  })

  // The day sections still nudge their own selected row into view; what must not happen on mount
  // is a jump to the edge of a day.
  it('does not scroll a day into view on mount — that belongs to the selected row', () => {
    const { scrollIntoView } = watchScrolling()

    renderView()

    expect(toDays(scrollIntoView)).toHaveLength(0)
  })

  it('scrolls to the anchor when the window jumps somewhere unconnected', () => {
    const { scrollIntoView } = watchScrolling()
    const { rerender, props } = renderView()

    rerender(<ScheduleView {...props} days={[dayView(14), dayView(15), dayView(16)]} />)

    expect(toDays(scrollIntoView)).toHaveLength(1)
    expect(toDays(scrollIntoView)[0][0]).toEqual({ block: 'start' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(section(15))
  })

  it('does not scroll when the window stands still', () => {
    const { scrollIntoView } = watchScrolling()
    const { rerender, props } = renderView()

    rerender(<ScheduleView {...props} selectedDay={day(26)} selectedOrdinal={3} />)

    expect(toDays(scrollIntoView)).toHaveLength(0)
  })

  it('gives the selection to its own day, and to no other', () => {
    renderView({ selectedDay: day(26), selectedOrdinal: 3 })

    const selected = screen.getAllByRole('option', { selected: true })

    expect(selected).toHaveLength(1)
    expect(section(26)).toContainElement(selected[0])
    expect(selected[0]).toHaveAccessibleName('06:00 – 09:00')
  })

  it('draws no selection at all when its day is outside the window', () => {
    renderView({ selectedDay: day(14), selectedOrdinal: 3 })

    expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0)
  })

  it('names the day a row belongs to when it is selected or opened', async () => {
    const { props } = renderView()

    await userEvent.click(within(section(24)).getAllByRole('option')[0])
    expect(props.onSelect).toHaveBeenCalledWith(day(24), { ordinal: 1, note: null })

    await userEvent.click(within(section(25)).getByRole('button', { name: 'Note' }))
    expect(props.onOpenNote).toHaveBeenCalledWith(day(25), { ordinal: 7, note: null })
  })

  describe('the arrows', () => {
    it('puts one at either end of the scroll container, named twice over', () => {
      renderView()

      const scroller = screen.getByTestId('schedule-scroll')
      const earlier = screen.getByRole('button', { name: 'Earlier days' })
      const later = screen.getByRole('button', { name: 'Later days' })

      expect(scroller.firstElementChild).toBe(earlier)
      expect(scroller.lastElementChild).toBe(later)
      expect(earlier).toHaveAttribute('title', 'Earlier days')
      expect(later).toHaveAttribute('title', 'Later days')
    })

    it('asks the app to step the window, and decides nothing itself', async () => {
      const { props } = renderView()

      await userEvent.click(screen.getByRole('button', { name: 'Later days' }))
      expect(props.onShowLater).toHaveBeenCalledOnce()

      await userEvent.click(screen.getByRole('button', { name: 'Earlier days' }))
      expect(props.onShowEarlier).toHaveBeenCalledOnce()
    })

    it('scrolls the first of the new days to the top after a step forward', () => {
      const { scrollIntoView } = watchScrolling()
      const { rerender, props } = renderView()

      rerender(<ScheduleView {...props} days={laterDays} />)

      expect(toDays(scrollIntoView)).toHaveLength(1)
      expect(toDays(scrollIntoView)[0][0]).toEqual({ block: 'start' })
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(section(27))
    })

    // Reading continues upwards into the day just before the one left, so it is the *last* of the
    // new three that is brought into view, and at the end of the scroller rather than the top.
    it('scrolls the last of the new days into view at the end after a step back', () => {
      const { scrollIntoView } = watchScrolling()
      const { rerender, props } = renderView()

      rerender(<ScheduleView {...props} days={earlierDays} />)

      expect(toDays(scrollIntoView)).toHaveLength(1)
      expect(toDays(scrollIntoView)[0][0]).toEqual({ block: 'end' })
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(section(23))
    })
  })
})
