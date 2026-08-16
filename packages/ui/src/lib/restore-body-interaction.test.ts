/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  restoreBodyInteraction,
  scheduleRestoreBodyInteraction,
} from './restore-body-interaction'

describe('restoreBodyInteraction', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.style.pointerEvents = ''
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
    document.body.removeAttribute('data-scroll-locked')
    document.documentElement.removeAttribute('data-scroll-locked')
  })

  it('clears a stuck pointer-events lock on body', () => {
    document.body.style.pointerEvents = 'none'
    document.body.style.overflow = 'hidden'
    document.body.setAttribute('data-scroll-locked', '')
    document.body.style.paddingRight = '15px'

    restoreBodyInteraction()

    expect(document.body.style.pointerEvents).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
    expect(document.body.style.paddingRight).toBe('')
  })

  it('does not unlock while another dialog overlay is still open', () => {
    const overlay = document.createElement('div')
    overlay.setAttribute('data-slot', 'dialog-overlay')
    overlay.setAttribute('data-state', 'open')
    document.body.appendChild(overlay)
    document.body.style.pointerEvents = 'none'

    restoreBodyInteraction()

    expect(document.body.style.pointerEvents).toBe('none')
  })

  it('scheduleRestoreBodyInteraction eventually clears the lock', async () => {
    vi.useFakeTimers()
    document.body.style.pointerEvents = 'none'
    scheduleRestoreBodyInteraction()
    await vi.runAllTimersAsync()
    expect(document.body.style.pointerEvents).toBe('')
    vi.useRealTimers()
  })
})
