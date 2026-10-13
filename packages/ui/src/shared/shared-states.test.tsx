// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Tabs } from '../primitives/tabs'
import { SegmentedControl } from '../primitives/segmented-control'
import { PillTabsList, PillTabsTrigger } from '../profile'
import { DataState, PageHeader, QrCodeFrame } from './index'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('DataState', () => {
  it.each([
    ['loading', 'Cargando…', 'status'],
    ['empty', 'Sin datos', 'status'],
    ['error', 'No se pudo cargar', 'alert'],
    ['forbidden', 'No tienes permiso para ver esto', 'status'],
    ['offline', 'Sin conexión', 'status'],
    ['stale', 'Datos desactualizados', 'status'],
    ['partial', 'Resultado parcial', 'status'],
    ['demo', 'Datos demostrativos', 'status'],
  ] as const)('%s has default copy and role', (kind, text, role) => {
    const html = renderToStaticMarkup(<DataState kind={kind} />)
    expect(html).toContain(text)
    expect(html).toContain(`role="${role}"`)
    expect(html).toContain(`data-kind="${kind}"`)
  })

  it('renders retry, custom title, description and action; spinner respects reduced motion', () => {
    const html = renderToStaticMarkup(
      <DataState kind='error' title='Falló el tablero' description='Hace 5 min' onRetry={() => {}} action={<a href='#x'>Fuentes</a>} />
    )
    expect(html).toContain('Falló el tablero')
    expect(html).toContain('Hace 5 min')
    expect(html).toContain('Reintentar')
    expect(html).toContain('Fuentes')
    expect(renderToStaticMarkup(<DataState kind='loading' />)).toContain('motion-reduce:animate-none')
  })

  it('compact layout and hidden icon', () => {
    const html = renderToStaticMarkup(<DataState kind='empty' compact icon={null} />)
    expect(html).toContain('flex-row')
    expect(html).not.toContain('<svg')
  })
})

describe('PageHeader', () => {
  it('renders title level, badges, description, actions and a labelled overflow trigger', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title='Bandeja'
        level={2}
        description='Conversaciones'
        badges={<span>Demo</span>}
        actions={<button>Nuevo</button>}
        overflowActions={[{ key: 'exp', label: 'Exportar', onSelect: () => {} }]}
      />
    )
    expect(html).toContain('<h2')
    expect(html).toContain('Conversaciones')
    expect(html).toContain('Demo')
    expect(html).toContain('Nuevo')
    expect(html).toContain('aria-label="Más acciones"')
  })

  it('omits the overflow trigger without secondary actions', () => {
    const html = renderToStaticMarkup(<PageHeader title='X' />)
    expect(html).toContain('<h1')
    expect(html).not.toContain('Más acciones')
  })
})

describe('QrCodeFrame', () => {
  it('forces a white quiet zone and crisp scaling', () => {
    const html = renderToStaticMarkup(<QrCodeFrame src='data:image/png;base64,AAA' alt='QR' size={200} quietZone={30} />)
    expect(html).toContain('background-color:#fff')
    expect(html).toContain('padding:30px')
    expect(html).toContain('width:260px')
    expect(html).toContain('image-rendering:pixelated')
    expect(html).toContain('data-state="ready"')
  })

  it('announces loading and expired, with refresh', () => {
    expect(renderToStaticMarkup(<QrCodeFrame alt='QR' />)).toContain('Generando código…')
    const html = renderToStaticMarkup(<QrCodeFrame src='x' alt='QR' expired onRefresh={() => {}} />)
    expect(html).toContain('El código venció')
    expect(html).toContain('Generar otro código')
    expect(html).toContain('data-state="expired"')
  })
})

describe('PillTabsTrigger count', () => {
  it('shows the counter, including zero', () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue='a'>
        <PillTabsList>
          <PillTabsTrigger value='a' count={12}>Abiertas</PillTabsTrigger>
          <PillTabsTrigger value='b' count={0}>Cerradas</PillTabsTrigger>
          <PillTabsTrigger value='c'>Todas</PillTabsTrigger>
        </PillTabsList>
      </Tabs>
    )
    expect(html).toContain('>12</span>')
    expect(html).toContain('>0</span>')
    expect(html.match(/pill-tabs-count/g)?.length).toBe(2)
  })
})

describe('SegmentedControl', () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null
  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('is a radiogroup with roving tabindex and arrow-key selection', () => {
    const onChange = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() =>
      root!.render(
        <SegmentedControl
          aria-label='Vista'
          value='list'
          onValueChange={onChange}
          items={[
            { value: 'list', label: 'Lista' },
            { value: 'kanban', label: 'Kanban' },
            { value: 'map', label: 'Mapa', disabled: true },
          ]}
        />
      )
    )
    const group = host.querySelector('[role="radiogroup"]')!
    expect(group.getAttribute('aria-label')).toBe('Vista')
    const radios = host.querySelectorAll('[role="radio"]')
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    expect(radios[0].getAttribute('tabindex')).toBe('0')
    expect(radios[1].getAttribute('tabindex')).toBe('-1')
    act(() => {
      radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith('kanban')
    // Wraps around and skips the disabled segment.
    act(() => {
      radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onChange).toHaveBeenLastCalledWith('list')
    act(() => {
      ;(radios[1] as HTMLButtonElement).click()
    })
    expect(onChange).toHaveBeenLastCalledWith('kanban')
  })
})
