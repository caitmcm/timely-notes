import { act, render, screen } from '@testing-library/react'
import { buildPeriods } from '../domain/periods'
import { intersect, isObserved, observerOf } from '../test/intersection'
import ScheduleView, { type DayView } from './ScheduleView'

const day = (dayOfMonth: number) => new Date(2026, 7, dayOfMonth).getTime()
const now = new Date(2026, 7, 25, 20, 20)

const dayView = (dayOfMonth: number, isLoading = false): DayView => ({
  dayStart: day(dayOfMonth),
  periods: buildPeriods(new Date(day(dayOfMonth)), 3),
  isLoading,
})

const sentinels = () => [...document.querySelectorAll('.schedule-view__sentinel')]

function renderView(overrides: Partial<React.ComponentProps<typeof ScheduleView>> = {}) {
  const props = {
    days: [dayView(25)],
    now,
    focusDayStart: day(25),
    selectedPeriod: undefined,
    onSelect: vi.fn(),
    onTakeNote: vi.fn(),
    onOpenNote: vi.fn(),
    onReachStart: vi.fn(),
    onReachEnd: vi.fn(),
    onAnchorDay: vi.fn(),
    ...overrides,
  }

  const view = render(<ScheduleView {...props} />)

  return { ...view, props }
}

const section = (dayOfMonth: number) =>
  document.querySelector(`[data-day="${day(dayOfMonth)}"]`) as HTMLElement

describe('ScheduleView', () => {
  it('renders one day section per day, in order', () => {
    renderView({ days: [dayView(24), dayView(25), dayView(26)] })

    expect(screen.getAllByRole('listbox').map((list) => list.getAttribute('aria-label'))).toEqual([
      '24/08/2026',
      '25/08/2026',
      '26/08/2026',
    ])
  })

  it('observes its sentinels and its days against the scroll container', () => {
    renderView()

    expect(observerOf(sentinels()[0])?.root).toBe(screen.getByTestId('schedule-scroll'))
    expect(isObserved(section(25))).toBe(true)
  })

  it('asks for an earlier day when the top sentinel comes into view', () => {
    const { props } = renderView()

    act(() => intersect(sentinels()[0], true))

    expect(props.onReachStart).toHaveBeenCalledTimes(1)
    expect(props.onReachEnd).not.toHaveBeenCalled()
  })

  it('asks for a later day when the bottom sentinel comes into view', () => {
    const { props } = renderView()

    act(() => intersect(sentinels()[1], true))

    expect(props.onReachEnd).toHaveBeenCalledTimes(1)
  })

  it('asks for nothing when a sentinel leaves the viewport', () => {
    const { props } = renderView()

    act(() => intersect(sentinels()[1], false))

    expect(props.onReachEnd).not.toHaveBeenCalled()
  })

  it('reports the earliest day in the viewport, and only when it changes', () => {
    const onAnchorDay = vi.fn()
    renderView({ days: [dayView(24), dayView(25), dayView(26)], onAnchorDay })

    act(() => intersect(section(25), true))
    act(() => intersect(section(26), true))

    expect(onAnchorDay.mock.calls).toEqual([[day(25)]])

    act(() => intersect(section(24), true))

    expect(onAnchorDay.mock.calls).toEqual([[day(25)], [day(24)]])
  })

  it('moves the anchor on as days scroll out of the viewport', () => {
    const { props } = renderView({ days: [dayView(24), dayView(25)] })
    act(() => intersect(section(24), true))
    act(() => intersect(section(25), true))

    act(() => intersect(section(24), false))

    expect(props.onAnchorDay).toHaveBeenLastCalledWith(day(25))
  })

  it('disconnects its observer on unmount', () => {
    const { unmount } = renderView()
    const sentinel = sentinels()[0]

    unmount()

    expect(isObserved(sentinel)).toBe(false)
  })

  it('holds the reading position when a day is prepended above it', () => {
    const { rerender, props } = renderView({ days: [dayView(25)] })
    const container = screen.getByTestId('schedule-scroll')
    // jsdom lays nothing out, so the growth a prepended section causes has to be stated.
    let scrollHeight = 600
    Object.defineProperty(container, 'scrollHeight', { get: () => scrollHeight })
    container.scrollTop = 0
    rerender(<ScheduleView {...props} days={[dayView(25)]} />)

    scrollHeight = 1200
    rerender(<ScheduleView {...props} days={[dayView(24), dayView(25)]} />)

    expect(container.scrollTop).toBe(600)
  })

  it('leaves the scroll position alone when a day is appended below', () => {
    const { rerender, props } = renderView({ days: [dayView(25)] })
    const container = screen.getByTestId('schedule-scroll')
    let scrollHeight = 600
    Object.defineProperty(container, 'scrollHeight', { get: () => scrollHeight })
    container.scrollTop = 120

    scrollHeight = 1200
    rerender(<ScheduleView {...props} days={[dayView(25), dayView(26)]} />)

    expect(container.scrollTop).toBe(120)
  })

  it('does not scroll on mount — that belongs to the selected row', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderView()

    expect(scrollIntoView).not.toHaveBeenCalled()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('scrolls to the focus day when it moves', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender, props } = renderView({ days: [dayView(25), dayView(26)] })

    rerender(<ScheduleView {...props} days={[dayView(25), dayView(26)]} focusDayStart={day(26)} />)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('gives the selection to the day that holds it, and to no other', () => {
    const days = [dayView(25), dayView(26)]
    renderView({ days, selectedPeriod: days[1].periods[2] })

    const selected = screen.getAllByRole('option', { selected: true })

    expect(selected).toHaveLength(1)
    expect(section(26)).toContainElement(selected[0])
  })
})
