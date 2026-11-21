// @vitest-environment happy-dom
// Accesibilidad automatica (axe-core) de los bloques principales. El contraste no se mide aqui (happy-dom no
// calcula estilos): lo cubren los tokens del tema (`theme/tokens-contrast.test.ts`).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { BlockState, PageGraphView, RankedList, SeriesView, type PageGraph } from './index'

afterEach(cleanup)

async function violations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`)
}

describe('axe', () => {
  it('RankedList (links, botones, region con scroll)', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: String(i), label: `Fila ${i}`, value: String(i), share: i / 50, ...(i % 2 ? { href: `/r/${i}` } : {}) }))
    const { container } = render(<RankedList items={items} ranked label='Top' maxHeight={200} onSelect={() => {}} />)
    expect(await violations(container)).toEqual([])
  })

  it('SeriesView en vista grafica y en tabla, grupo y boton unico', async () => {
    const rows = [{ label: 'Lun', total: 1 }, { label: 'Mar', total: 2 }]
    const cols = [{ key: 'total', label: 'Total' }]
    const { container, rerender } = render(<SeriesView title='Ventas' columns={cols} rows={rows} chart={<div role='img' aria-label='Ventas' />} />)
    expect(await violations(container)).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Tabla/ }))
    expect(await violations(container)).toEqual([])
    rerender(<SeriesView title='Ventas' columns={cols} rows={rows} chart={<div role='img' aria-label='Ventas' />} toggle='single' view='table' />)
    expect(await violations(container)).toEqual([])
  })

  it('BlockState en sus tres estados', async () => {
    const { container, rerender } = render(<BlockState kind='loading' />)
    expect(await violations(container)).toEqual([])
    rerender(<BlockState kind='error' onRetry={() => {}} />)
    expect(await violations(container)).toEqual([])
    rerender(<BlockState kind='empty' message='Nada' />)
    expect(await violations(container)).toEqual([])
  })

  it('PageGraphView con tabs, KPI y seccion', async () => {
    const graph: PageGraph = {
      version: 'genui.page-graph/v1',
      id: 'p',
      root: [
        { id: 'k', type: 'kpi_card', props: { label: 'Ventas', value: 10, trend: 'up' } },
        {
          id: 't',
          type: 'tabs',
          props: { label: 'Detalle' },
          children: [
            { id: 't1', type: 'tab', props: { key: 'a', label: 'A' }, children: [{ id: 's', type: 'section', props: { title: 'Sec' }, children: [{ id: 'k2', type: 'kpi_card', props: { label: 'X', value: 1 } }] }] },
            { id: 't2', type: 'tab', props: { key: 'b', label: 'B' } },
          ],
        },
      ],
    }
    const { container } = render(<PageGraphView graph={graph} />)
    expect(await violations(container)).toEqual([])
  })
})

describe('axe control', () => {
  it('detecta una violacion real (el arnes funciona)', async () => {
    const { container } = render(<button type='button' />)
    expect((await violations(container)).length).toBeGreaterThan(0)
  })
})
