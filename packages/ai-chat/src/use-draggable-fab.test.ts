import { describe, expect, it } from 'vitest'
import { bottomLeftFabPosition, computePanelLayout } from './use-draggable-fab'

describe('bottomLeftFabPosition', () => {
  it('places the FAB bottom-left for the given width', () => {
    expect(bottomLeftFabPosition(1366)).toEqual({ bottom: 24, right: 1366 - 48 - 24 })
  })

  it('never falls below the margin on narrow viewports', () => {
    expect(bottomLeftFabPosition(100)).toEqual({ bottom: 24, right: 28 })
    expect(bottomLeftFabPosition(50)).toEqual({ bottom: 24, right: 24 })
  })
})

describe('computePanelLayout', () => {
  const viewport = { width: 1280, height: 800 }
  it('opens above a FAB in the bottom-right corner and stays on screen', () => {
    const l = computePanelLayout({ bottom: 24, right: 24 }, viewport)
    expect(l.opensAbove).toBe(true)
    expect(l.width).toBe(400)
    expect(l.height).toBeGreaterThanOrEqual(280)
    expect(l.bottom + l.height).toBeLessThanOrEqual(viewport.height)
  })
  it('shrinks the panel width on phones', () => {
    expect(computePanelLayout({ bottom: 24, right: 24 }, { width: 360, height: 700 }).width).toBe(328)
  })
})
