import { describe, expect, it } from 'vitest'
import {
  humanizeModuleKey,
  moduleLabelFromMeta,
  registerModuleLabel,
  registerModuleLabels,
} from './visual'

describe('moduleLabelFromMeta: el origen es el nombre traducido del addon', () => {
  it('usa metadata.addon_name del servidor en vez de humanizar la clave', () => {
    // Antes: "Channel Orders" (la clave humanizada) en una UI en español.
    expect(moduleLabelFromMeta({ addon_key: 'channel_orders', addon_name: 'Pedidos de canal' })).toBe(
      'Pedidos de canal',
    )
  })

  it('el nombre registrado por el host (idioma del visor) gana a addon_name y sirve a avisos ya guardados', () => {
    registerModuleLabels({ stored_before_fix: 'Tienda en línea', ignored: undefined })
    expect(moduleLabelFromMeta({ addon_key: 'stored_before_fix' })).toBe('Tienda en línea')
    expect(moduleLabelFromMeta({ addon_key: 'stored_before_fix', addon_name: 'Online Shop' })).toBe(
      'Tienda en línea',
    )
  })

  it('apartado y module explícitos mandan sobre todo', () => {
    registerModuleLabel('whatsapp_x', 'Registrado')
    expect(moduleLabelFromMeta({ addon_key: 'whatsapp_x', apartado: 'WhatsApp' })).toBe('WhatsApp')
    expect(moduleLabelFromMeta({ addon_key: 'whatsapp_x', module: 'Mensajes' })).toBe('Mensajes')
  })

  it('sin nombre conocido cae a la clave humanizada, nunca a la cruda', () => {
    expect(moduleLabelFromMeta({ addon_key: 'unknown_addon_key' })).toBe('Unknown Addon Key')
    expect(moduleLabelFromMeta({ addon_key: 'some-pos_terminal' })).toBe('Some POS Terminal')
  })

  it('los nombres integrados antiguos solo son respaldo', () => {
    expect(moduleLabelFromMeta({ addon_key: 'warehouse' })).toBe('Almacén')
    expect(moduleLabelFromMeta({ addon_key: 'warehouse', addon_name: 'Warehouse' })).toBe('Warehouse')
  })

  it('sin clave ni nombre no hay chip', () => {
    expect(moduleLabelFromMeta({})).toBe('')
  })
})

describe('humanizeModuleKey', () => {
  it('title-case con acrónimos', () => {
    expect(humanizeModuleKey('channel_orders')).toBe('Channel Orders')
    expect(humanizeModuleKey('pos')).toBe('POS')
    expect(humanizeModuleKey('fiscal_mexico')).toBe('Fiscal Mexico')
  })
})
