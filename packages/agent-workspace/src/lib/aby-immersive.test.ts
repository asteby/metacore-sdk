import { describe, expect, it } from 'vitest'
import { COPILOT_HIDDEN_ON_IMMERSIVE, immersiveCopilotEnabled } from './aby-immersive'

// Aby is mounted by the immersive route for operator workstations, and kept
// off customer-facing / passive displays, where a staff copilot (and the
// incoming-call banners its provider renders) must not appear.
describe('immersiveCopilotEnabled', () => {
  it('habilita el copiloto en estaciones de operador', () => {
    expect(immersiveCopilotEnabled('pos')).toBe(true)
    expect(immersiveCopilotEnabled('purchases')).toBe(true)
    expect(immersiveCopilotEnabled('bi')).toBe(true)
  })

  it('lo oculta en kiosco de clientes y pantalla de cocina', () => {
    expect(immersiveCopilotEnabled('kiosk')).toBe(false)
    expect(immersiveCopilotEnabled('kds')).toBe(false)
  })

  it('sin clave de addon no monta nada', () => {
    expect(immersiveCopilotEnabled(undefined)).toBe(false)
    expect(immersiveCopilotEnabled('')).toBe(false)
  })

  it('la lista de exclusión es explícita y pequeña', () => {
    expect([...COPILOT_HIDDEN_ON_IMMERSIVE].sort()).toEqual(['kds', 'kiosk'])
  })
})
