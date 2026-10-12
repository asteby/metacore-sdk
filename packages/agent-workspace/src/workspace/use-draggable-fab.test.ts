import { describe, expect, it } from 'vitest'
import { bottomLeftFabPosition } from './use-draggable-fab'

// FabPosition is right-anchored; "bottom-left" is a right offset derived from
// the viewport width (FAB is 48px, edge margin 24px).
describe('bottomLeftFabPosition', () => {
  it('coloca el botón en la esquina inferior izquierda para el ancho dado', () => {
    expect(bottomLeftFabPosition(1366)).toEqual({ bottom: 24, right: 1366 - 48 - 24 })
  })

  it('nunca cae por debajo del margen en viewports estrechos', () => {
    expect(bottomLeftFabPosition(100)).toEqual({ bottom: 24, right: 28 })
    expect(bottomLeftFabPosition(50)).toEqual({ bottom: 24, right: 24 })
  })
})
