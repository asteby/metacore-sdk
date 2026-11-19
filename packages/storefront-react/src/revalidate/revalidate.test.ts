import { describe, expect, it } from 'vitest'
import { createStoreRevalidation, type RevalidateArgs } from './index.js'

const args = (over: Partial<RevalidateArgs> = {}): RevalidateArgs => ({
  currentUrl: new URL('https://tienda.example/mx/productos/x'),
  nextUrl: new URL('https://tienda.example/mx/productos/x'),
  defaultShouldRevalidate: true,
  ...over,
})
const rev = createStoreRevalidation({ skipActions: () => ['/mx/carrito', '/mx/boletin', null, undefined] })

describe('skipOnCartAction', () => {
  it('no revalida tras una acción del carrito ni del boletín', () => {
    expect(rev.skipOnCartAction(args({ formAction: '/mx/carrito', formMethod: 'post' }))).toBe(false)
    expect(rev.skipOnCartAction(args({ formAction: '/mx/boletin', formMethod: 'post' }))).toBe(false)
  })
  it('las demás acciones y la navegación siguen la regla por omisión', () => {
    expect(rev.skipOnCartAction(args({ formAction: '/mx/cuenta', formMethod: 'post' }))).toBe(true)
    expect(rev.skipOnCartAction(args())).toBe(true)
    expect(rev.skipOnCartAction(args({ defaultShouldRevalidate: false }))).toBe(false)
  })
  it('lee las rutas en cada decisión (el mercado cambia por petición)', () => {
    let market = 'mx'
    const r = createStoreRevalidation({ skipActions: () => [`/${market}/carrito`] })
    expect(r.skipOnCartAction(args({ formAction: '/mx/carrito' }))).toBe(false)
    market = 'us'
    expect(r.skipOnCartAction(args({ formAction: '/mx/carrito' }))).toBe(true)
    expect(r.skipOnCartAction(args({ formAction: '/us/carrito' }))).toBe(false)
  })
})

describe('skipOnSearchOnlyChange', () => {
  it('cambiar solo la query de la misma ruta (filtrar, ordenar, paginar) no revalida root', () => {
    expect(rev.skipOnSearchOnlyChange(args({ nextUrl: new URL('https://tienda.example/mx/productos/x?orden=precio') }))).toBe(false)
  })
  it('acciones, cambio de ruta y revalidación explícita siguen la regla por omisión', () => {
    expect(rev.skipOnSearchOnlyChange(args({ formMethod: 'post', nextUrl: new URL('https://tienda.example/mx/productos/x?a=1') }))).toBe(true)
    expect(rev.skipOnSearchOnlyChange(args({ nextUrl: new URL('https://tienda.example/mx/colecciones') }))).toBe(true)
    expect(rev.skipOnSearchOnlyChange(args())).toBe(true)
  })
})
