import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TOUCH_TOKENS,
  resolveTouchTokens,
  touchCss,
  touchCssVars,
} from './touch.js'

describe('touch tokens', () => {
  it('defaults to a 60px target', () => {
    expect(resolveTouchTokens()).toEqual(DEFAULT_TOUCH_TOKENS)
    expect(DEFAULT_TOUCH_TOKENS.minTarget).toBe(60)
  })

  it('merges partial input', () => {
    expect(resolveTouchTokens({ minTarget: 72 })).toEqual({ minTarget: 72, fontScale: 1.25 })
  })

  it('clamps out-of-range and ignores non-finite values', () => {
    expect(resolveTouchTokens({ minTarget: 10, fontScale: 9 })).toEqual({ minTarget: 44, fontScale: 2 })
    expect(resolveTouchTokens({ minTarget: 999 }).minTarget).toBe(160)
    expect(resolveTouchTokens({ minTarget: NaN, fontScale: Infinity })).toEqual(DEFAULT_TOUCH_TOKENS)
  })

  it('emits css variables', () => {
    expect(touchCssVars({ minTarget: 64, fontScale: 1.5 })).toEqual({
      '--touch-min-target': '64px',
      '--touch-font-scale': '1.5',
    })
    expect(touchCss(undefined, '.kiosk')).toBe('.kiosk{--touch-min-target:60px;--touch-font-scale:1.25}')
  })
})
