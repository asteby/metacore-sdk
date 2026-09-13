// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useResource } from '../use-resource'

describe('useResource stuck flag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is not stuck before the threshold elapses', () => {
    const fetcher = vi.fn(() => new Promise<string>(() => {}))
    const { result } = renderHook(() =>
      useResource(fetcher, [], { stuckAfterMs: 8_000 }),
    )

    expect(result.current.isLoading).toBe(true)
    expect(result.current.stuck).toBe(false)

    act(() => {
      vi.advanceTimersByTime(7_999)
    })
    expect(result.current.stuck).toBe(false)
  })

  it('flips stuck once loading is sustained past the threshold', () => {
    const fetcher = vi.fn(() => new Promise<string>(() => {}))
    const { result } = renderHook(() =>
      useResource(fetcher, [], { stuckAfterMs: 8_000 }),
    )

    act(() => {
      vi.advanceTimersByTime(8_000)
    })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.stuck).toBe(true)
  })

  it('never gets stuck when the fetch resolves before the threshold', async () => {
    let resolveFetch: (value: string) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const { result } = renderHook(() =>
      useResource(fetcher, [], { stuckAfterMs: 8_000 }),
    )

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.stuck).toBe(false)

    await act(async () => {
      resolveFetch('data')
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBe('data')
    expect(result.current.stuck).toBe(false)

    act(() => {
      vi.advanceTimersByTime(8_000)
    })
    expect(result.current.stuck).toBe(false)
  })

  it('clears stuck and restarts the timer on refetch', () => {
    const fetcher = vi.fn(() => new Promise<string>(() => {}))
    const { result } = renderHook(() =>
      useResource(fetcher, [], { stuckAfterMs: 8_000 }),
    )

    act(() => {
      vi.advanceTimersByTime(8_000)
    })
    expect(result.current.stuck).toBe(true)

    act(() => {
      result.current.refetch()
    })
    expect(result.current.stuck).toBe(false)

    act(() => {
      vi.advanceTimersByTime(7_999)
    })
    expect(result.current.stuck).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.stuck).toBe(true)
  })
})
