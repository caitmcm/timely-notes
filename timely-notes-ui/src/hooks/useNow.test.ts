import { act, render } from '@testing-library/react'
import { createElement, useEffect } from 'react'
import { useNow } from './useNow'

const MINUTE = 60_000

const at = (hour: number, minute = 0, second = 0) =>
  new Date(2026, 7, 25, hour, minute, second)

let renders: Date[] = []
let readNow: () => Date = () => new Date()

function Probe({ frozen }: { frozen?: Date }) {
  const clock = useNow(frozen)

  // Published from an effect, not during render: a probe still has to obey the rules of hooks.
  useEffect(() => {
    renders.push(clock.now)
    readNow = clock.readNow
  })

  return null
}

const renderProbe = (frozen?: Date) => render(createElement(Probe, { frozen }))

/** The distinct instants `now` has held, in order — one per replacement, not per render. */
const ticks = () => [...new Set(renders.map((instant) => instant.getTime()))].map((ms) => new Date(ms))

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** A suspended tab: the wall clock moves on while no timer fires. */
const suspendUntil = (instant: Date) => vi.setSystemTime(instant)

const setVisibility = (state: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

const fire = async (dispatch: () => void) => {
  await act(async () => {
    dispatch()
  })
}

describe('useNow', () => {
  beforeEach(() => {
    renders = []
    vi.useFakeTimers()
    vi.setSystemTime(at(12))
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  describe('frozen', () => {
    it('holds the given instant and registers nothing', async () => {
      const frozen = at(20, 20)
      renderProbe(frozen)

      await advance(3 * 60 * MINUTE)
      await fire(() => document.dispatchEvent(new Event('visibilitychange')))
      await fire(() => window.dispatchEvent(new Event('focus')))

      expect(ticks()).toEqual([frozen])
      expect(vi.getTimerCount()).toBe(0)
    })

    it('reads the frozen instant from readNow too', async () => {
      const frozen = at(20, 20)
      renderProbe(frozen)

      await advance(5_000)

      expect(readNow()).toEqual(frozen)
    })
  })

  describe('ticking', () => {
    it('replaces now once as the wall clock crosses a minute, and not before', async () => {
      renderProbe()

      await advance(MINUTE - 1)
      expect(ticks()).toEqual([at(12)])

      await advance(1)
      expect(ticks()).toEqual([at(12), at(12, 1)])
    })

    it('ticks on the boundary, not one minute after mounting', async () => {
      vi.setSystemTime(at(12, 0, 30))
      renderProbe()

      await advance(20_000)
      expect(ticks()).toEqual([at(12, 0, 30)])

      await advance(10_000)
      await advance(30_000)
      expect(ticks()).toEqual([at(12, 0, 30), at(12, 1)])
    })

    it('recomputes the delay from the clock, so a late tick does not push the next one late', async () => {
      renderProbe()

      // One uneven jump, as a throttled background tab would produce.
      await advance(2.5 * MINUTE)
      expect(ticks().at(-1)).toEqual(at(12, 2))

      await advance(0.5 * MINUTE)
      expect(ticks().at(-1)).toEqual(at(12, 3))
      expect(ticks().every((tick) => tick.getSeconds() === 0)).toBe(true)
    })
  })

  describe('resynchronising', () => {
    it('catches up the moment a hidden tab becomes visible, without waiting for a timer', async () => {
      renderProbe()
      setVisibility('hidden')

      suspendUntil(at(15, 30, 20))
      setVisibility('visible')
      await fire(() => document.dispatchEvent(new Event('visibilitychange')))

      expect(ticks().at(-1)).toEqual(at(15, 30, 20))
    })

    it('ignores a visibilitychange that hid the tab', async () => {
      renderProbe()

      setVisibility('hidden')
      suspendUntil(at(15, 30, 20))
      await fire(() => document.dispatchEvent(new Event('visibilitychange')))

      expect(ticks()).toEqual([at(12)])
    })

    it('catches up on window focus', async () => {
      renderProbe()

      suspendUntil(at(15, 30, 20))
      await fire(() => window.dispatchEvent(new Event('focus')))

      expect(ticks().at(-1)).toEqual(at(15, 30, 20))
    })

    it('keeps ticking on the minute after a resync', async () => {
      renderProbe()

      suspendUntil(at(15, 30, 20))
      await fire(() => window.dispatchEvent(new Event('focus')))
      await advance(40_000)

      expect(ticks().at(-1)).toEqual(at(15, 31))
    })
  })

  it('reads the exact instant between ticks', async () => {
    renderProbe()

    await advance(5_000)

    expect(ticks().at(-1)).toEqual(at(12))
    expect(readNow()).toEqual(at(12, 0, 5))
  })

  it('stops the timer and both listeners on unmount', async () => {
    const { unmount } = renderProbe()

    unmount()
    const settled = renders.length

    await advance(5 * MINUTE)
    await fire(() => document.dispatchEvent(new Event('visibilitychange')))
    await fire(() => window.dispatchEvent(new Event('focus')))

    expect(vi.getTimerCount()).toBe(0)
    expect(renders).toHaveLength(settled)
  })
})
