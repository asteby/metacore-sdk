// @vitest-environment happy-dom
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GenUIProvider } from '../index'
import { PageBlocks, PageProvider, PageView, defineBlock, registerPageBlock, usePageContext, type PageBlockDef, type UrlStateAdapter } from './index'
import fleetSwitcher from '../../examples/fleet-switcher.page.json'

afterEach(cleanup)

const mountSpy = vi.fn()
function Probe({ id }: { id: string }) {
  useEffect(() => {
    mountSpy(id)
  }, [id])
  return <i>{`vista-${id}`}</i>
}

const views = (extra: Record<string, unknown> = {}): PageBlockDef => ({
  type: 'tabs',
  variant: 'segmented',
  label: 'Vista',
  state: 'state.view',
  tabs: [
    { key: 'map', label: 'Mapa', icon: 'map', blocks: [{ type: 'text', text: 'contenido-mapa' }] },
    { key: 'cards', label: 'Tarjetas', blocks: [{ type: 'text', text: 'contenido-tarjetas' }] },
    { key: 'table', label: 'Datos', permission: 'p.table', blocks: [{ type: 'text', text: 'contenido-datos' }] },
  ],
  ...extra,
})

const page = (block: PageBlockDef, props: Record<string, unknown> = {}) => (
  <PageProvider initialState={{ view: 'map' }} can={(p) => p === 'p.table'} {...props}>
    <PageBlocks blocks={[block]} />
  </PageProvider>
)

describe('tabs as view switcher', () => {
  it('switches view, writes page state and lazy-mounts only the active one', () => {
    function St() {
      return <b data-testid='v'>{String(usePageContext().state.view)}</b>
    }
    render(
      <PageProvider initialState={{ view: 'map' }} can={() => true}>
        <PageBlocks blocks={[views()]} />
        <St />
      </PageProvider>,
    )
    expect(screen.getByText('contenido-mapa')).toBeTruthy()
    expect(screen.queryByText('contenido-tarjetas')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Tarjetas' }))
    expect(screen.getByTestId('v').textContent).toBe('cards')
    expect(screen.getByText('contenido-tarjetas')).toBeTruthy()
    expect(screen.queryByText('contenido-mapa')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Tarjetas' }).getAttribute('aria-selected')).toBe('true')
  })

  it('uses default when state is empty and the first visible when it is unknown', () => {
    const first = render(page(views({ default: 'cards' }), { initialState: {} }))
    expect(screen.getByText('contenido-tarjetas')).toBeTruthy()
    first.unmount()
    render(page(views(), { initialState: { view: 'ghost' } }))
    expect(screen.getByText('contenido-mapa')).toBeTruthy()
  })

  it('url_state restores the active view from ?s.view and writes it back', () => {
    let params = new URLSearchParams('s.view=%22cards%22')
    const adapter: UrlStateAdapter = { read: () => new URLSearchParams(params), write: (p) => void (params = p) }
    render(page(views(), { urlState: ['view'], urlAdapter: adapter }))
    expect(screen.getByText('contenido-tarjetas')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(params.get('s.view')).toBe('"map"')
  })

  it('hides options whose permission is missing and falls back to a visible one', () => {
    render(page(views(), { can: () => false, initialState: { view: 'table' } }))
    expect(screen.queryByRole('tab', { name: 'Datos' })).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.queryByText('contenido-datos')).toBeNull()
    expect(screen.getByText('contenido-mapa')).toBeTruthy()
  })

  it('supports arrow, Home and End keys with roving tabindex and aria wiring', () => {
    render(page(views()))
    const tabs = () => screen.getAllByRole('tab')
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowRight' })
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[1])
    fireEvent.keyDown(tabs()[1]!, { key: 'End' })
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs()[2]!, { key: 'ArrowRight' })
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowLeft' })
    expect(tabs()[2]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tablist').getAttribute('aria-label')).toBe('Vista')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tabs()[2]!.id)
  })

  it('keep_alive preserves visited views (hidden) while the default unmounts them', () => {
    mountSpy.mockClear()
    const probe = (extra: Record<string, unknown>) =>
      views({
        ...extra,
        tabs: [
          { key: 'map', label: 'Mapa', component: 'test.probe@1', props: { id: 'a' } },
          { key: 'cards', label: 'Tarjetas', blocks: [{ type: 'text', text: 'contenido-tarjetas' }] },
        ],
      })
    const off = registerPageBlock(defineBlock({ name: 'test.probe@1', component: ({ props }) => <Probe id={String(props.id)} /> }))
    const keep = render(page(probe({ keep_alive: true })))
    fireEvent.click(screen.getByRole('tab', { name: 'Tarjetas' }))
    expect((keep.container.querySelector('[data-view="map"]') as HTMLElement).hidden).toBe(true)
    expect(screen.getByText('vista-a')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(mountSpy).toHaveBeenCalledTimes(1)
    keep.unmount()
    const lazy = render(page(probe({})))
    fireEvent.click(screen.getByRole('tab', { name: 'Tarjetas' }))
    expect(lazy.container.querySelector('[data-view="map"]')).toBeNull()
    off()
  })

  it('mounts a custom component view with block@1 and shows a stub when it is not registered', () => {
    const off = registerPageBlock(defineBlock({ name: 'hub.cards@1', reads: ['state.view'], component: ({ context }) => <i>{`custom-${String(context['state.view'])}`}</i> }))
    render(page(views({ tabs: [{ key: 'cards', label: 'Tarjetas', component: 'hub.cards@1' }, { key: 'x', label: 'X', component: 'hub.missing@1' }] }), { initialState: { view: 'cards' } }))
    expect(screen.getByText('custom-cards')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'X' }))
    expect(screen.getByText(/no disponible: hub.missing@1/)).toBeTruthy()
    off()
  })

  it('applies chrome and keeps local state when no state binding is declared', () => {
    const { container } = render(page(views({ state: undefined, chrome: 'card' })))
    expect(container.querySelector('[data-genui-block="tabs"][data-chrome="card"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tarjetas' }))
    expect(screen.getByText('contenido-tarjetas')).toBeTruthy()
  })

  it('collapses to a select on narrow screens', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    vi.resetModules()
    const mod = await import('./index')
    render(
      <mod.PageProvider initialState={{ view: 'map' }} can={() => true}>
        <mod.PageBlocks blocks={[views()]} />
      </mod.PageProvider>,
    )
    const sel = screen.getByRole('combobox', { name: 'Vista' })
    fireEvent.change(sel, { target: { value: 'cards' } })
    expect(screen.getByText('contenido-tarjetas')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('renders the fleet-switcher example sharing one source across views', () => {
    registerPageBlock(defineBlock({ name: 'hub_fleet.instance_cards@1', data: ['fleet'], component: ({ data }) => <i>{`tarjetas-${data.fleet?.rows?.length}`}</i> }))
    render(
      <GenUIProvider sources={{ fleet: [{ id: 'i1', lat: 19.4, lng: -99.1, customer: 'Acme', presence: 'down' }] }}>
        <PageView ui={fleetSwitcher as never} can={() => true} sourceStatus={{ fleet: { status: 'ready' } }} />
      </GenUIProvider>,
    )
    expect(screen.getByText('Acme')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tarjetas' }))
    expect(screen.getByText('tarjetas-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Datos' }))
    expect(screen.getAllByText('Acme').length).toBeGreaterThan(0)
  })
})
