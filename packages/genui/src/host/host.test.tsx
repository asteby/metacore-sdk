// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  GenUIBody,
  SourceDeniedError,
  createActionHandler,
  createHistoryUrlAdapter,
  isSafeInternalPath,
  type GenUIBodyDoc,
  type GenUIHostAdapter,
  type SourceResolver,
} from '../index'

afterEach(cleanup)

const ui = (blocks: unknown[], data?: Record<string, unknown>): GenUIBodyDoc => ({ data, blocks }) as GenUIBodyDoc
const scope = { addon: 'test', page: 'p1' }

describe('GenUIBody sources', () => {
  it('draws sources from the host resolver and isolates a failing one', async () => {
    const resolver: SourceResolver = {
      resolve: async ({ name }) => {
        if (name === 'kpi') return [{ total: 55 }]
        if (name === 'sales') return [{ day: 'L', total: 3 }, { day: 'M', total: 5 }]
        if (name === 'secret') throw new SourceDeniedError()
        throw new Error('boom')
      },
    }
    render(
      <GenUIBody
        scope={scope}
        host={{ sources: resolver }}
        ui={ui(
          [
            { type: 'metric', label: 'Pedidos', source: 'data.kpi', field: 'total' },
            { type: 'chart', kind: 'bar', x: 'day', series: [{ key: 'total', label: 'Total' }], source: 'data.sales', summary: 'Ventas por dia' },
            { type: 'metric', label: 'Roto', source: 'data.broken', field: 'total' },
          ],
          { kpi: { q: 't:orders' }, sales: { q: 't:orders' }, broken: { q: 't:x' } },
        )}
      />,
    )
    await waitFor(() => expect(screen.getByText('55')).toBeTruthy())
    expect(screen.getByText('Pedidos')).toBeTruthy()
    // La fuente rota no tumba lo demas.
    expect(document.body.textContent).toContain('Ventas por dia')
  })

  it('without a resolver declared sources are denied, never invented', async () => {
    render(<GenUIBody scope={scope} host={{}} ui={ui([{ type: 'metric', label: 'X', source: 'data.k', field: 'v' }], { k: { q: 't:a' } })} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/acceso|datos/i))
  })

  it('uses the denied label for denials and offers retry for failures', async () => {
    let calls = 0
    const resolver: SourceResolver = {
      resolve: async () => {
        calls++
        if (calls === 1) throw new Error('boom')
        return [{ v: 7 }]
      },
    }
    render(<GenUIBody scope={scope} host={{ sources: resolver }} ui={ui([{ type: 'metric', label: 'X', source: 'data.k', field: 'v' }], { k: { q: 't:a' } })} />)
    await waitFor(() => expect(document.body.textContent).toMatch(/No se pudieron/))
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy())
  })
})

describe('GenUIBody host bridges', () => {
  it('loads a lazy block only when the document uses its type', async () => {
    const lazy = vi.fn(async () => undefined)
    const host: GenUIHostAdapter = { lazyBlocks: { map: lazy } }
    render(<GenUIBody scope={scope} host={host} ui={ui([{ type: 'text', text: 'hola' }])} />)
    expect(screen.getByText('hola')).toBeTruthy()
    expect(lazy).not.toHaveBeenCalled()
    cleanup()
    render(<GenUIBody scope={scope} host={host} loadingFallback={<p>cargando</p>} ui={ui([{ type: 'map', id: 'm', fallback: 'mapa', points: { lat_field: 'lat', lng_field: 'lng', label_field: 'n' }, source: 'data.m' }], { m: { inline: [] } })} />)
    await waitFor(() => expect(lazy).toHaveBeenCalledTimes(1))
  })

  it('only hands safe internal paths to the host navigation', () => {
    const onNavigate = vi.fn()
    render(
      <GenUIBody
        scope={scope}
        host={{ onNavigate }}
        ui={ui([{ type: 'card', title: 'c', actions: [{ do: 'navigate', label: 'ir', route: { path: '/m/orders' } }] }])}
      />,
    )
    fireEvent.click(screen.getByText('ir'))
    expect(onNavigate).toHaveBeenCalledWith('/m/orders')
  })

  it('connects and disconnects the page bus', () => {
    const off = vi.fn()
    const connectBus = vi.fn(() => off)
    const { unmount } = render(<GenUIBody scope={scope} host={{ connectBus }} ui={ui([{ type: 'text', text: 'x' }])} />)
    expect(connectBus).toHaveBeenCalledTimes(1)
    expect(connectBus.mock.calls[0]![1]).toEqual(scope)
    unmount()
    expect(off).toHaveBeenCalled()
  })
})

describe('createActionHandler', () => {
  const req = (action: Record<string, unknown>) => ({ action })
  it('allows navigate to internal paths and emit of listed ids only', () => {
    const onNavigate = vi.fn()
    const onEmit = vi.fn()
    const onBlocked = vi.fn()
    const h = createActionHandler({ onNavigate, onEmit, onBlocked, emitIds: ['aby.guide'] })
    h(req({ do: 'navigate', route: { path: '/m/x' } }))
    h(req({ do: 'navigate', route: { path: 'https://evil.test' } }))
    h(req({ do: 'navigate', route: { path: '//evil.test' } }))
    h(req({ do: 'emit', id: 'aby.guide', params: { id: 'g' } }))
    h(req({ do: 'emit', id: 'other' }))
    h(req({ do: 'invoke', target: 'x' }))
    h(req({ do: 'submit', to: 'create' }))
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onEmit).toHaveBeenCalledWith('aby.guide', { id: 'g' }, expect.anything())
    expect(onBlocked.mock.calls.map((c) => c[1])).toEqual(['path', 'path', 'emit_id', 'verb', 'verb'])
  })

  it('isSafeInternalPath rejects schemes, protocol-relative and control chars', () => {
    expect(isSafeInternalPath('/a/b?x=1')).toBe(true)
    for (const bad of ['javascript:alert(1)', 'https://x', '//x', '/\\x', '', 'a/b', '/a\nb']) expect(isSafeInternalPath(bad)).toBe(false)
  })
})

describe('createHistoryUrlAdapter', () => {
  it('writes raw scalar strings, reads both forms and skips no-op writes', () => {
    const replace = vi.fn()
    const history = { location: { pathname: '/p', search: '?s.view=map&x=1', hash: '' }, replace }
    const a = createHistoryUrlAdapter(history)
    expect(a.read().get('s.view')).toBe('"map"')
    const next = a.read()
    next.set('s.view', '"list"')
    a.write(next)
    expect(replace).toHaveBeenCalledWith('/p?s.view=list&x=1')
    act(() => {})
  })
})
