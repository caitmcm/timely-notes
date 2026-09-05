// Declared here rather than pulling Node's globals into the app's own type environment.
declare const process: { env: Record<string, string | undefined> }

/**
 * Runs `assert` with the process in `zone`. Node applies a `process.env.TZ` change to every `Date`
 * built afterwards, which is the only way to prove a local-fields conversion is not a UTC one.
 * Returns a promise when `assert` does, so the zone outlives an awaited body.
 */
export function inTimezone(zone: string, assert: () => void): void
export function inTimezone(zone: string, assert: () => Promise<void>): Promise<void>
export function inTimezone(
  zone: string,
  assert: () => void | Promise<void>,
): void | Promise<void> {
  const held = process.env.TZ
  const restore = () => {
    process.env.TZ = held
  }

  process.env.TZ = zone

  try {
    const running = assert()

    if (running instanceof Promise) {
      return running.finally(restore)
    }
  } catch (failure) {
    restore()
    throw failure
  }

  restore()
}

/** East and west of Greenwich: a UTC-shaped slip lands on the wrong day in one of them. */
export const EITHER_SIDE_OF_GREENWICH = ['Pacific/Auckland', 'America/Los_Angeles']
