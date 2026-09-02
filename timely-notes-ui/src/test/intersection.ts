/**
 * jsdom has no `IntersectionObserver` and no layout, so the scrolling view's growth is driven from
 * tests through this stub rather than through a faked scroll position.
 */

class StubIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null
  readonly rootMargin: string
  readonly scrollMargin: string = '0px'
  readonly thresholds: readonly number[]
  readonly targets = new Set<Element>()

  private readonly callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.root = options?.root ?? null
    this.rootMargin = options?.rootMargin ?? '0px'
    this.thresholds = [options?.threshold ?? 0].flat()
    instances.add(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
    instances.delete(this)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  fire(target: Element, isIntersecting: boolean) {
    const entry = {
      target,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
    } as IntersectionObserverEntry

    this.callback([entry], this)
  }
}

const instances = new Set<StubIntersectionObserver>()

export function installIntersectionObserver() {
  globalThis.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof IntersectionObserver
}

export function resetIntersectionObservers() {
  instances.clear()
}

/** The live observer watching `target`, for asserting its root or that it was disconnected. */
export function observerOf(target: Element) {
  return [...instances].find((observer) => observer.targets.has(target))
}

export function isObserved(target: Element) {
  return observerOf(target) !== undefined
}

/** Reports `target` as entering or leaving the viewport, as a real observer would. */
export function intersect(target: Element, isIntersecting = true) {
  const observer = observerOf(target)

  if (!observer) {
    throw new Error('Nothing is observing that element.')
  }

  observer.fire(target, isIntersecting)
}
