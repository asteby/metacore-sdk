// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GenUIProvider, registerGenUIBlockRenderer } from '../index'
import {
  PageBlocks,
  PageProvider,
  PageView,
  createPageBus,
  defineBlock,
  getPath,
  isSafePath,
  parseAreas,
  registerPageBlock,
  resolveRef,
  sanitizeTrack,
  setPath,
  usePageContext,
  usePageEvent,
  type PageBlockDef,
  type UrlStateAdapter,
} from './index'
import fleet from '../../examples/fleet-map.page.json'

afterEach(cleanup)

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'conformance', 'valid')

describe('page state helpers', () => {
  it('only accepts safe paths and never touches prototypes', () => {
    expect(isSafePath('filters.presence')).toBe(true)
    for (const bad of ['', '__proto__', 'a.constructor', 'a..b', 'a.prototype.x', '1a']) expect(isSafePath(bad)).toBe(false)
    expect(setPath({}, '__proto__.x', 1)).toEqual({})
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    expect(setPath({ a: { b: 1 } }, 'a.c', 2)).toEqual({ a: { b: 1, c: 2 } })
    expect(getPath({ a: { b: 3 } }, 'a.b')).toBe(3)
    expect(getPath({}, 'toString')).toBeUndefined()
  })

  it('resolves state, data (first row) and ctx refs; other roots are undefined', () => {
    const v = { state: { x: { y: 1 } }, sources: { s: [{ n: 5 }] }, ctx: { locale: 'es' } }
    expect(resolveRef('state.x.y', v)).toBe(1)
    expect(resolveRef('data.s.n', v)).toBe(5)
    expect(resolveRef('ctx.locale', v)).toBe('es')
    expect(resolveRef('record.id', v)).toBeUndefined()
    expect(resolveRef('data.__proto__.x', v)).toBeUndefined()
  })

  it('sanitizes grid tracks and areas', () => {
    expect(sanitizeTrack('1fr')).toBe('1fr')
    expect(sanitizeTrack('9000px')).toBe('640px')
    expect(sanitizeTrack('10px')).toBe('120px')
    expect(sanitizeTrack('minmax(50px, 2fr)')).toBe('minmax(120px, 2fr)')
    expect(sanitizeTrack('calc(100vh)')).toBe('1fr')
    expect(sanitizeTrack('url(x)')).toBe('1fr')
    expect(parseAreas(['a a', 'b c'])).toEqual([['a', 'a'], ['b', 'c']])
    expect(parseAreas(['a a', 'b'])).toBeUndefined()
    expect(parseAreas(['A b'])).toBeUndefined()
  })

  it('bus delivers named and wildcard events and unsubscribes', () => {
    const bus = createPageBus()
    const named = vi.fn()
    const all = vi.fn()
    const off = bus.on('select', named)
    bus.on('*', all)
    bus.emit({ name: 'select', payload: 1 })
    bus.emit({ name: 'other' })
    off()
    bus.emit({ name: 'select' })
    expect(named).toHaveBeenCalledOnce()
    expect(all).toHaveBeenCalledTimes(3)
  })
})

describe('PageProvider url_state', () => {
  it('reads declared keys from the URL, ignores undeclared and bad JSON, and writes changes back', () => {
    let params = new URLSearchParams('s.range=%227d%22&s.other=1&s.selected=%7Bbad')
    const adapter: UrlStateAdapter = { read: () => new URLSearchParams(params), write: (p) => void (params = p) }
    function Probe() {
      const pc = usePageContext()
      return (
        <button onClick={() => pc.setState('selected', 'a1')}>
          {JSON.stringify(pc.state)}
        </button>
      )
    }
    render(
      <PageProvider initialState={{ range: '28d', selected: null }} urlState={['range', 'selected']} urlAdapter={adapter}>
        <Probe />
      </PageProvider>,
    )
    expect(screen.getByRole('button').textContent).toBe('{"range":"7d","selected":null}')
    fireEvent.click(screen.getByRole('button'))
    expect(params.get('s.selected')).toBe('"a1"')
    expect(params.get('s.range')).toBe('"7d"')
    expect(params.get('s.other')).toBe('1')
  })
})

describe('grid with areas', () => {
  const grid = (extra: Record<string, unknown> = {}): PageBlockDef => ({
    type: 'grid',
    areas: ['kpis kpis', 'map detail'],
    columns: ['1fr', '9999px'],
    mobile: ['kpis', 'map'],
    blocks: [
      { type: 'text', text: 'K', area: 'kpis' },
      { type: 'text', text: 'M', area: 'map' },
      { type: 'text', text: 'D', area: 'detail' },
      { type: 'text', text: 'X', area: 'nope' },
      { type: 'text', text: 'Y' },
    ],
    ...extra,
  })

  it('places children by area with sanitized tracks and drops unplaced ones', () => {
    const { container } = render(<PageBlocks blocks={[grid()]} />)
    const root = container.querySelector('[data-genui-block="grid-areas"] > div') as HTMLElement
    expect(root.style.gridTemplateAreas).toBe('"kpis kpis" "map detail"')
    expect(root.style.gridTemplateColumns).toBe('1fr 640px')
    expect((container.querySelector('[data-area="detail"]') as HTMLElement).style.gridArea).toBe('detail')
    expect(screen.queryByText('X')).toBeNull()
    expect(screen.queryByText('Y')).toBeNull()
    expect(screen.getByText('D')).toBeTruthy()
  })

  it('uses the mobile order on narrow screens', () => {
    return (async () => {
      // El hook lee matchMedia al cargar el modulo: se recarga con un mock "angosto".
      vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
      vi.resetModules()
      const mod = await import('./index')
      const { container } = render(<mod.PageBlocks blocks={[grid()]} />)
      const root = container.querySelector('[data-genui-block="grid-areas"] > div') as HTMLElement
      expect(root.style.gridTemplateAreas).toBe('"kpis" "map"')
      expect(screen.queryByText('D')).toBeNull()
      vi.unstubAllGlobals()
    })()
  })

  it('falls back to a plain column grid without valid areas', () => {
    const { container } = render(<PageBlocks blocks={[grid({ areas: ['a', 'b c'], columns: 2 })]} />)
    expect(container.querySelector('[data-genui-block="grid-areas"]')).toBeNull()
    expect(container.querySelector('.grid')).toBeTruthy()
  })
})

describe('stats and kpi_card', () => {
  it('formats values from sources/state refs and runs a `set` action into page state', () => {
    function Probe() {
      const { state } = usePageContext()
      return <i data-testid='st'>{JSON.stringify(state)}</i>
    }
    render(
      <GenUIProvider sources={{ k: [{ value: 1200 }] }} locale='en'>
        <PageProvider initialState={{ filters: { presence: null } }}>
          <PageBlocks
            data={{ k: { widget: 'a.dashboard.b' } }}
            blocks={[
              { type: 'stats', items: [{ label: 'Caidas', value: { $ref: 'data.k.value' }, action: { do: 'set', path: 'state.filters.presence', value: 'down' } }] },
              { type: 'kpi_card', label: 'Total', value: { $ref: 'data.k.value' }, format: 'compact', trend: 'up', cta: { do: 'emit', id: 'page.cta', label: 'Ver' } },
            ]}
          />
          <Probe />
        </PageProvider>
      </GenUIProvider>,
    )
    expect(screen.getByText('1,200')).toBeTruthy()
    expect(screen.getByText('1.2K')).toBeTruthy()
    expect(screen.getByText('al alza')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Caidas/ }))
    expect(screen.getByTestId('st').textContent).toBe('{"filters":{"presence":"down"}}')
  })

  it('emits page events from a CTA and hands other verbs to the host', () => {
    const onAction = vi.fn()
    const seen = vi.fn()
    function Listener() {
      usePageEvent('cta', seen)
      return null
    }
    render(
      <GenUIProvider onAction={onAction}>
        <PageProvider>
          <Listener />
          <PageBlocks
            blocks={[
              { type: 'kpi_card', label: 'A', value: 1, cta: { do: 'emit', id: 'page.cta', label: 'Emitir', params: { a: 1 } } },
              { type: 'kpi_card', label: 'B', value: 2, cta: { do: 'invoke', action: 'x.y', label: 'Invocar' } },
            ]}
          />
        </PageProvider>
      </GenUIProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Emitir' }))
    expect(seen).toHaveBeenCalledWith({ name: 'cta', payload: { a: 1 }, source: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Invocar' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})

describe('section', () => {
  const sec = (extra: Record<string, unknown> = {}): PageBlockDef => ({ type: 'section', title: 'Mi seccion', blocks: [{ type: 'text', text: 'contenido' }], ...extra })

  it('draws a card chrome with title and children; bare drops frame and title', () => {
    const { container, rerender } = render(<PageBlocks blocks={[sec()]} />)
    expect(container.querySelector('[data-chrome="card"]')).toBeTruthy()
    expect(screen.getByText('Mi seccion')).toBeTruthy()
    rerender(<PageBlocks blocks={[sec({ chrome: 'bare' })]} />)
    expect(container.querySelector('[data-chrome="bare"]')).toBeTruthy()
    expect(screen.queryByText('Mi seccion')).toBeNull()
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('denies without permission: hide by default, notice on request, shows with permission', () => {
    const { container, rerender } = render(<PageBlocks blocks={[sec({ permission: 'p.read' })]} />)
    expect(container.textContent).toBe('')
    rerender(<PageBlocks blocks={[sec({ permission: 'p.read', on_denied: 'notice' })]} />)
    expect(screen.getByRole('status').textContent).toContain('No tienes acceso')
    rerender(
      <PageProvider can={(p) => p === 'p.read'}>
        <PageBlocks blocks={[sec({ permission: 'p.read' })]} />
      </PageProvider>,
    )
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('shows loading, error with retry, empty and ready states from its source', () => {
    const retry = vi.fn()
    const block = sec({ source: 'data.s', empty: 'Nada aqui' })
    const view = (sources: Record<string, unknown[] | undefined>, status?: Record<string, { status: 'loading' | 'ready' | 'error'; error?: string; retry?: () => void }>) => (
      <GenUIProvider sources={sources as never}>
        <PageProvider sourceStatus={status}>
          <PageBlocks blocks={[block]} />
        </PageProvider>
      </GenUIProvider>
    )
    const { rerender } = render(view({}))
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(view({}, { s: { status: 'error', error: 'boom', retry } }))
    expect(screen.getByRole('alert').textContent).toContain('boom')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalled()
    rerender(view({ s: [] }, { s: { status: 'ready' } }))
    expect(screen.getByText('Nada aqui')).toBeTruthy()
    rerender(view({ s: [{ a: 1 }] }, { s: { status: 'ready' } }))
    expect(screen.getByText('contenido')).toBeTruthy()
  })

  it('isolates a crashing section with an ErrorBoundary and recovers on retry', () => {
    let boom = true
    const undo = registerPageBlock(
      defineBlock({
        name: 'test.boom@1',
        component: () => {
          if (boom) throw new Error('kaboom')
          return <p>recuperado</p>
        },
      }),
    )
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<PageBlocks blocks={[{ type: 'section', mode: 'custom', chrome: 'bare', component: 'test.boom@1' }, { type: 'text', text: 'hermana' }]} />)
    expect(screen.getByRole('alert').textContent).toContain('fallo')
    expect(screen.getByText('hermana')).toBeTruthy()
    boom = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('recuperado')).toBeTruthy()
    spy.mockRestore()
    undo()
  })

  it('declarative mode refuses `ext`, hybrid mounts it', () => {
    const undo = registerPageBlock(defineBlock({ name: 'test.hy@1', component: () => <p>propio</p> }))
    const ext = { type: 'ext', ext: 'test.hy@1', fallback: 'sin ext' }
    const { rerender } = render(<PageBlocks blocks={[sec({ blocks: [ext] })]} />)
    expect(screen.getByText('sin ext')).toBeTruthy()
    rerender(<PageBlocks blocks={[sec({ mode: 'hybrid', blocks: [{ type: 'text', text: 'nucleo' }, ext] })]} />)
    expect(screen.getByText('nucleo')).toBeTruthy()
    expect(screen.getByText('propio')).toBeTruthy()
    undo()
  })
})

describe('custom block contract (block@1)', () => {
  it('validates definitions', () => {
    expect(() => defineBlock({ name: 'bad', component: () => null })).toThrow(/nombre invalido/)
    expect(() => defineBlock({ name: 'a.b@1', reads: ['record.x'], component: () => null })).toThrow(/reads/)
    expect(() => defineBlock({ name: 'a.b@1', writes: ['ctx.x'], component: () => null })).toThrow(/writes/)
    expect(() => defineBlock({ name: 'a.b@1', api: 'block@2' as never, component: () => null })).toThrow(/no soportada/)
    expect(defineBlock({ name: 'a.b@1', component: () => null }).api).toBe('block@1')
  })

  it('stub for an unregistered component', () => {
    render(<PageBlocks blocks={[{ type: 'section', mode: 'custom', chrome: 'bare', component: 'no.existe@1', fallback: 'No disponible' }]} />)
    expect(screen.getByText('No disponible').getAttribute('data-genui-block')).toBe('custom-stub')
  })

  it('passes only declared reads/data, and lets emit write only declared keys and events', () => {
    const undo = registerPageBlock(
      defineBlock({
        name: 'test.sim@1',
        reads: ['state.range', 'ctx.locale'],
        writes: ['state.picked'],
        data: ['rank'],
        events: ['simulate'],
        component: ({ props, context, data, emit }) => (
          <div>
            <i data-testid='ctx'>{JSON.stringify(context)}</i>
            <i data-testid='data'>{JSON.stringify(data)}</i>
            <i data-testid='props'>{JSON.stringify(props)}</i>
            <button onClick={() => emit('set', { key: 'state.picked', value: 'c1' })}>ok</button>
            <button onClick={() => emit('set', { key: 'state.secret', value: 'x' })}>no-set</button>
            <button onClick={() => emit('simulate', { mode: 'seat' })}>sim</button>
            <button onClick={() => emit('undeclared')}>no-event</button>
          </div>
        ),
      }),
    )
    const seen = vi.fn()
    function Probe() {
      const { state } = usePageContext()
      usePageEvent('*', seen)
      return <b data-testid='st'>{JSON.stringify(state)}</b>
    }
    render(
      <GenUIProvider sources={{ rank: [{ id: 1 }], hidden: [{ id: 2 }] }}>
        <PageProvider initialState={{ range: '7d', secret: 's' }} ctx={{ locale: 'es', token: 't' }} can={() => true}>
          <PageBlocks blocks={[{ type: 'section', mode: 'custom', chrome: 'bare', component: 'test.sim@1', props: { mode: 'seat' } }]} />
          <Probe />
        </PageProvider>
      </GenUIProvider>,
    )
    expect(JSON.parse(screen.getByTestId('ctx').textContent!)).toEqual({ 'state.range': '7d', 'ctx.locale': 'es' })
    expect(JSON.parse(screen.getByTestId('data').textContent!)).toEqual({ rank: { status: 'ready', rows: [{ id: 1 }] } })
    expect(JSON.parse(screen.getByTestId('props').textContent!)).toEqual({ mode: 'seat' })
    for (const n of ['ok', 'no-set', 'sim', 'no-event']) fireEvent.click(screen.getByRole('button', { name: n }))
    expect(JSON.parse(screen.getByTestId('st').textContent!)).toEqual({ range: '7d', secret: 's', picked: 'c1' })
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen.mock.calls[0]![0].name).toBe('simulate')
    undo()
  })
})

describe('map block', () => {
  it('writes the selected key to state, emits `select` and still runs the author on_select', () => {
    let picked: ((req: unknown) => void) | undefined
    const undo = registerGenUIBlockRenderer('map', ({ block, act }) => {
      picked = (point) => act({ action: block.on_select, blockId: block.id, context: { point } })
      return <p>mapa</p>
    })
    const onAction = vi.fn()
    const seen = vi.fn()
    function Probe() {
      const { state } = usePageContext()
      usePageEvent('select', seen)
      return <b data-testid='st'>{JSON.stringify(state)}</b>
    }
    render(
      <GenUIProvider onAction={onAction}>
        <PageProvider initialState={{ selected: null }}>
          <PageBlocks blocks={[{ type: 'map', id: 'm', summary: 'Mapa', select: 'state.selected', points: [{ key: 'a', lat: 1, lng: 2, label: 'A' }], on_select: { do: 'invoke', action: 'x.open' } }]} />
          <Probe />
        </PageProvider>
      </GenUIProvider>,
    )
    expect(screen.getByText('mapa')).toBeTruthy()
    act(() => picked!({ key: 'a', label: 'A' }))
    expect(screen.getByTestId('st').textContent).toBe('{"selected":"a"}')
    expect(seen).toHaveBeenCalledWith({ name: 'select', payload: { key: 'a', label: 'A' }, source: 'm' })
    expect(onAction).toHaveBeenCalledOnce()
    expect((onAction.mock.calls[0]![0] as { action: { do: string } }).action.do).toBe('invoke')
    undo()
  })

  it('uses the accessible fallback when no map renderer is registered', () => {
    render(<PageBlocks blocks={[{ type: 'map', summary: 'Mapa', points: [{ key: 'a', lat: 1, lng: 2, label: 'Punto A' }] }]} />)
    expect(screen.getByLabelText('Mapa').getAttribute('data-genui-block')).toBe('map-fallback')
    expect(screen.getByText('Punto A')).toBeTruthy()
  })
})

describe('example page', () => {
  it('renders the fleet example end to end (permission, declarative section, custom stub)', () => {
    const { container } = render(
      <GenUIProvider sources={{ online: [{ value: 4 }], down: [{ value: 2 }], instances: [{ id: 'i1', lat: 19.4, lng: -99.1, customer: 'Acme', presence: 'down' }] }}>
        <PageView ui={fleet as never} can={() => true} sourceStatus={{ instances: { status: 'ready' } }} />
      </GenUIProvider>,
    )
    expect(container.querySelector('[data-genui-block="grid-areas"]')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('Detalle no disponible')).toBeTruthy()
  })

  it('hides the permissioned custom section without `can`', () => {
    render(
      <GenUIProvider sources={{ online: [{ value: 4 }], down: [{ value: 2 }], instances: [] }}>
        <PageView ui={fleet as never} />
      </GenUIProvider>,
    )
    expect(screen.queryByText('Detalle no disponible')).toBeNull()
  })
})

describe('conformance vectors through the page renderer', () => {
  // Cada vector valido de genui/v2 debe poder pasar por PageBlocks (delegacion al nucleo) sin romper la pagina.
  const vectors = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(readFileSync(join(dir, f), 'utf8')) as { input: { version?: string; data?: Record<string, unknown>; blocks?: PageBlockDef[] }; options?: unknown }] as const)
    .filter(([, v]) => v.input?.version === 'genui/v2' && Array.isArray(v.input.blocks))
  it('has vectors to run', () => expect(vectors.length).toBeGreaterThan(5))
  for (const [name, v] of vectors) {
    it(`${name}: no section error and no throw`, () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const { container } = render(
          <PageProvider can={() => true}>
            <PageBlocks blocks={v.input.blocks!} data={v.input.data} />
          </PageProvider>,
        )
        expect(container.querySelector('[data-genui-block="section-error"]')).toBeNull()
      } finally {
        spy.mockRestore()
      }
    })
  }
})
