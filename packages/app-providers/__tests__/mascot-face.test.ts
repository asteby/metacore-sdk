import { describe, expect, it, vi } from 'vitest'
import { createMascotFaceStore, pickMascotFace } from '../src/mascot-face'

describe('pickMascotFace', () => {
  it('is idle with no publishers and picks the most active state', () => {
    expect(pickMascotFace({})).toBe('idle')
    expect(pickMascotFace({ a: 'idle', b: 'thinking' })).toBe('thinking')
    expect(pickMascotFace({ a: 'speaking', b: 'thinking' })).toBe('speaking')
    expect(pickMascotFace({ a: 'speaking', b: 'error' })).toBe('error')
  })
})

describe('createMascotFaceStore', () => {
  it('a hidden idle pane cannot paint over a thinking one', () => {
    const s = createMascotFaceStore()
    s.setFace('widget', 'thinking')
    s.setFace('page', 'idle')
    expect(s.getState()).toBe('thinking')
  })

  it('falls back when the busiest publisher leaves', () => {
    const s = createMascotFaceStore()
    s.setFace('a', 'idle')
    s.setFace('b', 'speaking')
    s.clearFace('b')
    expect(s.getState()).toBe('idle')
    s.setFace('c', 'listening')
    s.clearFace('a')
    expect(s.getState()).toBe('listening')
  })

  it('notifies only when the resulting face changes', () => {
    const s = createMascotFaceStore()
    const l = vi.fn()
    const off = s.subscribe(l)
    s.setFace('a', 'thinking')
    expect(l).toHaveBeenCalledTimes(1)
    s.setFace('a', 'thinking') // same value
    s.setFace('b', 'idle') // does not change the winner
    s.clearFace('missing')
    expect(l).toHaveBeenCalledTimes(1)
    s.setFace('b', 'processing')
    expect(l).toHaveBeenCalledTimes(2)
    off()
    s.clearFace('b')
    expect(l).toHaveBeenCalledTimes(2)
  })

  it('stores are independent', () => {
    const a = createMascotFaceStore()
    const b = createMascotFaceStore()
    a.setFace('x', 'error')
    expect(b.getState()).toBe('idle')
  })
})
