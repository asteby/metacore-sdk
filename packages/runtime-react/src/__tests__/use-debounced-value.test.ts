// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from '../use-debounced-value'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lags behind the live value by the default search debounce', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value),
      { initialProps: { value: '' } },
    )
    expect(result.current).toBe('')

    rerender({ value: 'pi' })
    expect(result.current).toBe('')

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    })
    expect(result.current).toBe('')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('pi')
  })

  it('resets the timer when the value changes mid-debounce', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    )

    rerender({ value: 'ab' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'abc' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('abc')
  })
})
