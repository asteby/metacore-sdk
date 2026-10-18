// @vitest-environment happy-dom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdleReset, type UseIdleResetResult } from './use-idle-reset'
import { useWakeLock, type UseWakeLockResult } from './use-wake-lock'
import { VirtualKeyboard } from './virtual-keyboard'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('useIdleReset', () => {
  it('warns, then resets; activity restarts the countdown', () => {
    vi.useFakeTimers()
    const onReset = vi.fn()
    let state!: UseIdleResetResult
    function C() {
      state = useIdleReset(10, 3, onReset)
      return null
    }
    act(() => root.render(<C />))
    act(() => vi.advanceTimersByTime(6000))
    expect(state.warning).toBe(false)
    act(() => vi.advanceTimersByTime(2000))
    expect(state.warning).toBe(true)
    expect(state.secondsLeft).toBe(2)

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    expect(state.warning).toBe(false)
    act(() => vi.advanceTimersByTime(9000))
    expect(onReset).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1500))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(state.warning).toBe(false)
  })

  it('resets on activity even if a handler stops propagation', () => {
    vi.useFakeTimers()
    const onReset = vi.fn()
    function C() {
      useIdleReset(10, 3, onReset)
      return <button data-b onPointerDown={(e) => e.stopPropagation()} />
    }
    act(() => root.render(<C />))
    act(() => vi.advanceTimersByTime(8000))
    const b = host.querySelector('[data-b]')!
    act(() => {
      const ev = new Event('pointerdown', { bubbles: true })
      ev.stopPropagation = ev.stopPropagation.bind(ev)
      b.addEventListener('pointerdown', (e) => e.stopPropagation())
      b.dispatchEvent(ev)
    })
    act(() => vi.advanceTimersByTime(5000))
    expect(onReset).not.toHaveBeenCalled()
  })

  it('is disabled with seconds <= 0', () => {
    vi.useFakeTimers()
    const onReset = vi.fn()
    function C() {
      useIdleReset(0, 0, onReset)
      return null
    }
    act(() => root.render(<C />))
    act(() => vi.advanceTimersByTime(60000))
    expect(onReset).not.toHaveBeenCalled()
  })
})

describe('useWakeLock', () => {
  it('is a no-op when unsupported', () => {
    let state!: UseWakeLockResult
    function C() {
      state = useWakeLock()
      return null
    }
    act(() => root.render(<C />))
    expect(state).toEqual({ supported: false, active: false })
  })

  it('acquires on mount and releases on unmount', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() })
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    let state!: UseWakeLockResult
    function C() {
      state = useWakeLock()
      return null
    }
    await act(async () => root.render(<C />))
    expect(request).toHaveBeenCalledWith('screen')
    expect(state.active).toBe(true)
    act(() => root.unmount())
    expect(release).toHaveBeenCalled()
    delete (navigator as { wakeLock?: unknown }).wakeLock
    root = createRoot(host)
  })
})

describe('VirtualKeyboard interaction', () => {
  it('types, shifts once, and backspaces through onValueChange', () => {
    const seen: string[] = []
    function C() {
      const [v, setV] = React.useState('')
      seen.push(v)
      return <VirtualKeyboard layout='text' value={v} onValueChange={setV} />
    }
    act(() => root.render(<C />))
    const press = (key: string) =>
      act(() => {
        host.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!.click()
      })
    press('h')
    press('shift')
    press('i')
    press('i')
    expect(seen.at(-1)).toBe('hIi')
    press('backspace')
    expect(seen.at(-1)).toBe('hI')
  })

  it('fires onEnter and exposes shift state via aria-pressed', () => {
    const onEnter = vi.fn()
    act(() => root.render(<VirtualKeyboard layout='email' onEnter={onEnter} />))
    const shift = host.querySelector<HTMLButtonElement>('[data-key="shift"]')!
    act(() => shift.click())
    expect(shift.getAttribute('aria-pressed')).toBe('true')
    act(() => host.querySelector<HTMLButtonElement>('[data-key="enter"]')!.click())
    expect(onEnter).toHaveBeenCalled()
  })
})
