import { StrictMode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { useNoteAutosave } from './useNoteAutosave'

const DEBOUNCE_MS = 2_000
const CEILING_MS = 10_000

const FROZEN_NOW = new Date('2026-08-25T20:20:00+01:00')

/** The clock read useNow hands down; the hook never builds a Date of its own. */
const readNow = () => FROZEN_NOW

const stubs = () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const remove = vi.fn().mockResolvedValue(undefined)

  return { save, remove }
}

/** Just the contents written, in order — the signal is asserted on its own, once. */
const contentsSaved = (save: { mock: { calls: unknown[][] } }) =>
  save.mock.calls.map((call) => call[0])

const setup = (overrides: Partial<Parameters<typeof useNoteAutosave>[0]> = {}) => {
  const { save, remove } = stubs()
  const view = renderHook(() =>
    useNoteAutosave({ save, remove, initialContent: '', readNow, ...overrides }),
  )

  return { save, remove, ...view }
}

/** Fake timers only advance when told to; a settled promise still needs a turn of the loop. */
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

const change = async (view: { result: { current: { onChange: (m: string) => void } } }, markdown: string) => {
  await act(async () => {
    view.result.current.onChange(markdown)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNoteAutosave', () => {
  it('writes nothing on mount, however long it is left alone', async () => {
    const { save, remove } = setup()

    await advance(CEILING_MS * 30)

    expect(save).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('writes nothing on mount under StrictMode’s double-invoked effects', async () => {
    const { save } = stubs()
    const remove = vi.fn()

    renderHook(() => useNoteAutosave({ save, remove, initialContent: '', readNow }), {
      wrapper: StrictMode,
    })
    await advance(CEILING_MS * 3)

    expect(save).not.toHaveBeenCalled()
  })

  it('writes once, to the one address, on the first non-empty beat', async () => {
    const view = setup()

    await change(view, 'First words.')
    await advance(DEBOUNCE_MS)

    expect(view.save).toHaveBeenCalledTimes(1)
    expect(view.save).toHaveBeenCalledWith('First words.', expect.any(AbortSignal))
  })

  // The hook has one write and no "does this exist yet" state; this is that absence, asserted.
  it('makes the second write the same call as the first', async () => {
    const view = setup()

    await change(view, 'First.')
    await advance(DEBOUNCE_MS)
    await change(view, 'Second.')
    await advance(DEBOUNCE_MS)

    expect(contentsSaved(view.save)).toEqual(['First.', 'Second.'])
  })

  it('never saves a buffer that has only ever been blank', async () => {
    const view = setup()

    await change(view, '   ')
    await advance(DEBOUNCE_MS)
    await change(view, '')
    await advance(CEILING_MS * 2)

    expect(view.save).not.toHaveBeenCalled()
  })

  it('waits for typing to stop, then carries the latest content', async () => {
    const view = setup()

    await change(view, 'One')
    await advance(DEBOUNCE_MS - 500)
    await change(view, 'One two')
    await advance(DEBOUNCE_MS - 500)

    expect(view.save).not.toHaveBeenCalled()

    await advance(500)

    expect(view.save).toHaveBeenCalledTimes(1)
    expect(view.save).toHaveBeenCalledWith('One two', expect.any(AbortSignal))
  })

  it('forces a save every ten seconds of continuous typing', async () => {
    const view = setup()

    for (let second = 1; second <= 25; second += 1) {
      await change(view, `word ${second}`)
      await advance(1_000)
    }

    // ~10s and ~20s: never more than a ceiling from safety, without a save per keystroke.
    expect(view.save.mock.calls.length).toBe(2)
  })

  it('never writes an unchanged buffer', async () => {
    const view = setup({ initialContent: 'Already saved.' })

    await change(view, 'Already saved.')
    await advance(CEILING_MS * 3)

    expect(view.save).not.toHaveBeenCalled()
  })

  it('treats a buffer that returns to its last-saved content as clean', async () => {
    const view = setup()

    await change(view, 'Written.')
    await advance(DEBOUNCE_MS)
    await change(view, 'Written and then some.')
    await change(view, 'Written.')
    await advance(CEILING_MS * 2)

    expect(view.save).toHaveBeenCalledTimes(1)
  })

  it('saves the clearing of a written note like any other change', async () => {
    const view = setup()

    await change(view, 'Written.')
    await advance(DEBOUNCE_MS)
    await change(view, '')
    await advance(DEBOUNCE_MS)

    expect(contentsSaved(view.save)).toEqual(['Written.', ''])
    expect(view.remove).not.toHaveBeenCalled()

    await advance(CEILING_MS * 3)

    expect(view.save).toHaveBeenCalledTimes(2)
  })

  it('says nothing about a note that was never written', async () => {
    const view = setup()

    await change(view, '')
    await advance(CEILING_MS * 2)

    expect(view.save).not.toHaveBeenCalled()
    expect(view.remove).not.toHaveBeenCalled()
  })

  it('just writes again when the note has been swept from under it', async () => {
    const view = setup()

    await change(view, 'Written.')
    await advance(DEBOUNCE_MS)
    // The store forgot it; the upsert re-creates it at the same address, so nothing here changes.
    await change(view, 'Written again.')
    await advance(DEBOUNCE_MS)

    expect(view.save).toHaveBeenLastCalledWith('Written again.', expect.any(AbortSignal))
    expect(view.result.current.status).toBe('saved')
  })

  describe('flush', () => {
    it('writes immediately when dirty', async () => {
      const view = setup()

      await change(view, 'Mid-sentence.')
      await act(async () => {
        await view.result.current.flush()
      })

      expect(view.save).toHaveBeenCalledWith('Mid-sentence.', expect.any(AbortSignal))
    })

    it('is a no-op when clean', async () => {
      const view = setup({ initialContent: 'Unchanged.' })

      await act(async () => {
        await view.result.current.flush()
      })

      expect(view.save).not.toHaveBeenCalled()
    })

    // The tab-hidden path: the user switched away, they are coming back.
    it('writes a blank buffer empty and never removes it', async () => {
      const view = setup()

      await change(view, 'Written.')
      await advance(DEBOUNCE_MS)
      await change(view, '')
      await act(async () => {
        await view.result.current.flush()
      })

      expect(view.save).toHaveBeenLastCalledWith('', expect.any(AbortSignal))
      expect(view.remove).not.toHaveBeenCalled()
    })
  })

  describe('finish', () => {
    it('flushes before it removes, so a failed delete still leaves the emptiness saved', async () => {
      const order: string[] = []
      const save = vi.fn().mockImplementation(async () => {
        order.push('save')
      })
      const remove = vi.fn().mockImplementation(async () => {
        order.push('remove')
      })
      const view = renderHook(() => useNoteAutosave({ save, remove, initialContent: '', readNow }))

      await act(async () => {
        view.result.current.onChange('Written.')
      })
      await advance(DEBOUNCE_MS)
      await act(async () => {
        view.result.current.onChange('')
      })
      await act(async () => {
        await view.result.current.finish()
      })

      expect(order).toEqual(['save', 'save', 'remove'])
    })

    it('removes nothing when the buffer is blank and nothing was ever written', async () => {
      const view = setup()

      await change(view, '')
      await act(async () => {
        await view.result.current.finish()
      })

      expect(view.save).not.toHaveBeenCalled()
      expect(view.remove).not.toHaveBeenCalled()
    })

    it('leaves a non-blank note alone', async () => {
      const view = setup()

      await change(view, 'Kept.')
      await act(async () => {
        await view.result.current.finish()
      })

      expect(view.save).toHaveBeenCalledWith('Kept.', expect.any(AbortSignal))
      expect(view.remove).not.toHaveBeenCalled()
    })

    it('runs on unmount, so a dialog torn down from above still deletes a blank note', async () => {
      const view = setup()

      await change(view, 'Written.')
      await advance(DEBOUNCE_MS)
      await change(view, '')

      await act(async () => {
        view.unmount()
      })

      expect(view.save).toHaveBeenLastCalledWith('', expect.any(AbortSignal))
      expect(view.remove).toHaveBeenCalledTimes(1)
    })

    it('writes a dirty non-blank buffer on unmount', async () => {
      const view = setup()

      await change(view, 'Half-written.')

      await act(async () => {
        view.unmount()
      })

      expect(view.save).toHaveBeenCalledWith('Half-written.', expect.any(AbortSignal))
      expect(view.remove).not.toHaveBeenCalled()
    })

    it('issues exactly one delete however many times it is asked', async () => {
      const view = setup()

      await change(view, 'Written.')
      await advance(DEBOUNCE_MS)
      await change(view, '')
      await act(async () => {
        await view.result.current.finish()
      })
      await act(async () => {
        view.unmount()
      })

      expect(view.remove).toHaveBeenCalledTimes(1)
      // And it does not then re-save the period it has just deleted.
      expect(view.save).toHaveBeenCalledTimes(2)
    })
  })

  it('runs one request at a time, and the last content wins', async () => {
    let release: () => void = () => {}
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const remove = vi.fn().mockResolvedValue(undefined)
    const view = renderHook(() => useNoteAutosave({ save, remove, initialContent: '', readNow }))

    await act(async () => {
      view.result.current.onChange('First.')
    })
    await advance(DEBOUNCE_MS)
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      view.result.current.onChange('Second.')
    })
    await advance(DEBOUNCE_MS)

    // Still one: the change arriving mid-save queues rather than racing.
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
    })
    await advance(DEBOUNCE_MS)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('Second.', expect.any(AbortSignal))
  })

  describe('status', () => {
    it('starts idle and reports a successful write', async () => {
      const view = setup()

      expect(view.result.current.status).toBe('idle')

      await change(view, 'Written.')
      await advance(DEBOUNCE_MS)

      expect(view.result.current.status).toBe('saved')
      expect(view.result.current.savedAt).toBeInstanceOf(Date)
    })

    it('keeps a failed write dirty and retries it on the next beat', async () => {
      const save = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(undefined)
      const remove = vi.fn().mockResolvedValue(undefined)
      const view = renderHook(() => useNoteAutosave({ save, remove, initialContent: '', readNow }))

      await act(async () => {
        view.result.current.onChange('Written.')
      })
      await advance(DEBOUNCE_MS)

      expect(view.result.current.status).toBe('failed')

      await act(async () => {
        await view.result.current.flush()
      })

      expect(save).toHaveBeenCalledTimes(2)
      expect(view.result.current.status).toBe('saved')
    })

    it('does not retry a failed delete, and does not let it block the close', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      const remove = vi.fn().mockRejectedValue(new Error('offline'))
      const view = renderHook(() => useNoteAutosave({ save, remove, initialContent: '', readNow }))

      await act(async () => {
        view.result.current.onChange('Written.')
      })
      await advance(DEBOUNCE_MS)
      await act(async () => {
        view.result.current.onChange('')
      })

      await act(async () => {
        await expect(view.result.current.finish()).resolves.toBeUndefined()
      })
      await advance(CEILING_MS * 2)

      expect(remove).toHaveBeenCalledTimes(1)
    })
  })
  it('issues the closing delete with no signal, so the teardown cannot cancel it', async () => {
    const view = setup()

    await change(view, 'Written.')
    await advance(DEBOUNCE_MS)
    await change(view, '')

    await act(async () => {
      view.unmount()
    })

    expect(view.remove).toHaveBeenCalledWith()
  })

  it('sends the teardown write on a controller the teardown did not abort', async () => {
    const view = setup()

    await change(view, 'Half-written.')
    await act(async () => {
      view.unmount()
    })

    const [, signal] = view.save.mock.calls.at(-1) as [string, AbortSignal]
    expect(signal.aborted).toBe(false)
  })

  it('updates no state after unmount', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = setup()

    await change(view, 'Half-written.')
    await act(async () => {
      view.unmount()
    })
    await advance(CEILING_MS * 2)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
  it('issues the closing delete with no signal, so the teardown cannot cancel it', async () => {
    const view = setup()

    await change(view, 'Written.')
    await advance(DEBOUNCE_MS)
    await change(view, '')

    await act(async () => {
      view.unmount()
    })

    expect(view.remove).toHaveBeenCalledWith()
  })

  it('sends the teardown write on a controller the teardown did not abort', async () => {
    const view = setup()

    await change(view, 'Half-written.')
    await act(async () => {
      view.unmount()
    })

    const [, signal] = view.save.mock.calls.at(-1) as [string, AbortSignal]
    expect(signal.aborted).toBe(false)
  })

  it('updates no state after unmount', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = setup()

    await change(view, 'Half-written.')
    await act(async () => {
      view.unmount()
    })
    await advance(CEILING_MS * 2)

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
  // The bug the integrated lane caught: StrictMode tears the hook down and builds it again, and a
  // mounted flag that was only ever cleared left every later save silently unable to report itself.
  it('still reports its status after StrictMode has remounted it', async () => {
    const { save, remove } = stubs()
    const view = renderHook(
      () => useNoteAutosave({ save, remove, initialContent: '', readNow }),
      { wrapper: StrictMode },
    )

    await act(async () => {
      view.result.current.onChange('Written under StrictMode.')
    })
    await advance(DEBOUNCE_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(view.result.current.status).toBe('saved')
    expect(view.result.current.savedAt).toEqual(FROZEN_NOW)
  })
})
