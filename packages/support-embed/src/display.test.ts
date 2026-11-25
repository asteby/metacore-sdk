import { describe, expect, it } from 'vitest'
import { asClamped, mergeSettings, normalizeSettings, parseProfileDisplay } from './display'
import { parseToFrame, parseToParent } from './protocol'
import { sanitizeProfile } from './profile'

describe('display', () => {
  it('acota numeros, acepta cadenas numericas de data-* y descarta lo demas', () => {
    expect(asClamped('480', 200, 2000)).toBe(480)
    expect(asClamped(5, 200, 2000)).toBe(200)
    expect(asClamped(99999, 200, 2000)).toBe(2000)
    expect(asClamped('12px', 200, 2000)).toBeUndefined()
    expect(asClamped(NaN, 200, 2000)).toBeUndefined()
    expect(asClamped({}, 200, 2000)).toBeUndefined()
  })

  it('normalizeSettings valida cada campo y mergeSettings deja ganar a la ultima capa definida', () => {
    expect(normalizeSettings({ mode: 'x', target: '', width: 'ancho', shape: 'round', label: 'a'.repeat(100) })).toEqual({ shape: 'round' })
    const s = mergeSettings({ mode: 'push', offset: 5 }, { mode: 'floating', offset: undefined })
    expect(s).toEqual({ mode: 'floating', offset: 5 })
  })

  it('parseProfileDisplay solo conserva valores validos', () => {
    expect(parseProfileDisplay({ display_mode: 'inline', inline_target: '#a', inline_height: 'alto', launcher_shape: 'circle' })).toEqual({
      display_mode: 'inline',
      inline_target: '#a',
    })
  })
})

describe('protocolo y perfil con campos de presentacion', () => {
  const base = { mcs: 1, t: 'profile', position: 'bottom-left', launcher: 'Ayuda', brand_color: '#0E7490', on_brand: '#ffffff' }

  it('el mensaje profile transporta los campos validos y descarta los invalidos sin rechazarlo', () => {
    expect(parseToParent({ ...base, display_mode: 'push', panel_width: 450, offset: 20, launcher_shape: 'rounded', launcher_label: 'Hola' })).toMatchObject({
      t: 'profile',
      display_mode: 'push',
      panel_width: 450,
      offset: 20,
      launcher_shape: 'rounded',
      launcher_label: 'Hola',
    })
    const msg = parseToParent({ ...base, display_mode: 'otro', inline_target: 7 })
    expect(msg).toMatchObject({ t: 'profile', position: 'bottom-left' })
    expect(msg).not.toHaveProperty('display_mode')
    expect(parseToParent({ ...base, position: 'top' })).toBeNull()
  })

  it('hello lleva el modo solo si es uno conocido', () => {
    expect(parseToFrame({ mcs: 1, t: 'hello', mode: 'inline' })).toMatchObject({ mode: 'inline' })
    expect(parseToFrame({ mcs: 1, t: 'hello', mode: 'raro' })).toMatchObject({ mode: undefined })
  })

  it('sanitizeProfile conserva la presentacion valida y es opcional', () => {
    expect(sanitizeProfile({ display_mode: 'inline', inline_target: '#chat', inline_height: 640 })).toMatchObject({
      display_mode: 'inline',
      inline_target: '#chat',
      inline_height: 640,
    })
    const plain = sanitizeProfile({ brand_color: '#0E7490' })
    expect(plain.display_mode).toBeUndefined()
    expect(plain.position).toBe('bottom-right')
  })
})
