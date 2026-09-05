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

/** The three days App always renders: the focus day and its neighbours. */
const threeDays = [dayView(24), dayView(25), dayView(26)]

function renderView(overrides: Partial<React.ComponentProps<typeof ScheduleView>> = {}) {
  const props = {
    days: threeDays,
    spanHours: 3 as const,
    now,
    focusDay: day(25),
    selectedOrdinal: 7,
    onSelect: vi.fn(),
    onOpenNote: vi.fn(),
    onOpenCalendar: vi.fn(),
    onGoToToday: vi.fn(),
    ...overrides,
  }

  const view = render(<ScheduleView {...props} />)

  return { ...view, props }
}

/** The day-level scrolls only: a section is scrolled to its start, a row to the nearest edge. */
const toDays = (scrollIntoView: ReturnType<typeof vi.fn>) =>
  scrollIntoView.mock.calls.filter(([options]) => options?.block === 'start')

const section = (dayOfMonth: number) =>
  document.querySelector(`[data-day="${day(dayOfMonth)}"]`) as HTMLElement

describe('ScheduleView', () => {
  it('renders one day section per day, in order, in the one scroll container', () => {
    renderView()

    expect(screen.getAllByRole('listbox').map((list) => list.getAttribute('aria-label'))).toEqual([
      '24/08/2026',
      '25/08/2026',
      '26/08/2026',
    ])
    expect(screen.getByTestId('schedule-scroll')).toContainElement(section(24))
  })

  it('renders one navigation toolbar, above the scroll and outside it', () => {
    const toolbar = within(renderView().container).getByRole('toolbar', { name: 'Navigate' })

    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Calendar', 'Go to today'])
    expect(screen.getByTestId('schedule-scroll')).not.toContainElement(toolbar)
  })

  it('opens the calendar from the toolbar', async () => {
    const { props } = renderView()

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(props.onOpenCalendar).toHaveBeenCalledTimes(1)
  })

  // Always offered, whichever day is in view: navigation that appears and disappears is a surprise.
  it('goes to today from the toolbar, on any day', async () => {
    const { props } = renderView({ focusDay: day(24) })

    await userEvent.click(screen.getByRole('button', { name: 'Go to today' }))

    expect(props.onGoToToday).toHaveBeenCalledTimes(1)
  })

  // The day sections still nudge their own selected row into view; what must not happen on mount
  // is a jump to the top of a day.
  it('does not scroll a day into view on mount — that belongs to the selected row', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderView()

    expect(toDays(scrollIntoView)).toHaveLength(0)
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('scrolls to the focus day when it moves', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender, props } = renderView()

    rerender(<ScheduleView {...props} focusDay={day(26)} />)

    expect(toDays(scrollIntoView)).toHaveLength(1)
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('gives the selection to the focus day, and to no other', () => {
    renderView({ focusDay: day(26), selectedOrdinal: 3 })

    const selected = screen.getAllByRole('option', { selected: true })

    expect(selected).toHaveLength(1)
    expect(section(26)).toContainElement(selected[0])
    expect(selected[0]).toHaveAccessibleName('06:00 – 09:00')
  })

  it('names the day a row belongs to when it is selected or opened', async () => {
    const { props } = renderView()

    await userEvent.click(within(section(24)).getAllByRole('option')[0])
    expect(props.onSelect).toHaveBeenCalledWith(day(24), { ordinal: 1, note: null })

    await userEvent.click(within(section(25)).getByRole('button', { name: 'Note' }))
    expect(props.onOpenNote).toHaveBeenCalledWith(day(25), { ordinal: 7, note: null })
  })
})
