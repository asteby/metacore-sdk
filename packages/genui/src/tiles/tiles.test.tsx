// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BlockState, Delta, KpiTile, RankedList, SeriesView, TrendSpark, sparkGeometry, toTileTone, toneColor } from './index'

afterEach(cleanup)

describe('toTileTone', () => {
  it('maps genui tones and legacy aliases, unknown is neutral', () => {
    expect(toTileTone('danger')).toBe('danger')
    expect(toTileTone('default')).toBe('neutral')
    expect(toTileTone('amber')).toBe('warning')
    expect(toTileTone('nope')).toBe('neutral')
    expect(toTileTone(undefined, 'primary')).toBe('primary')
    expect(toTileTone('constructor')).toBe('neutral')
  })
  it('uses theme variables with a fallback, never a raw colour', () => {
    expect(toneColor('success')).toContain('var(--tone-success-text')
    expect(toneColor('success')).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})

describe('Delta', () => {
  it('shows sign and icon and announces direction; invert flips colour only', () => {
    const { container, rerender } = render(<Delta value={12.5}>vs. mes anterior</Delta>)
    expect(container.textContent).toContain('+12.5%')
    expect(container.textContent).toContain('sube 12.5 por ciento vs. mes anterior')
    expect(container.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('success')
    rerender(<Delta value={12.5} invert />)
    expect(container.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('danger')
    expect(container.textContent).toContain('+12.5%')
    rerender(<Delta value={0} />)
    expect(container.textContent).toContain('sin cambio')
    rerender(<Delta value={Number.NaN} />)
    expect(container.textContent).toBe('')
  })
})

describe('sparkGeometry / TrendSpark', () => {
  it('ignores non finite values and centres a flat series', () => {
    expect(sparkGeometry([]).line).toBe('')
    const g = sparkGeometry([5, 5, 5, Number.NaN])
    expect(g.points).toHaveLength(3)
    expect(new Set(g.points.map((p) => p[1])).size).toBe(1)
  })
  it('is decorative unless it has a label, and skips a single point', () => {
    const { container, rerender } = render(<TrendSpark data={[1, 2, 3]} />)
    expect(container.querySelector('[aria-hidden="true"][data-genui-block="spark"]')).toBeTruthy()
    rerender(<TrendSpark data={[1, 2, 3]} label='Ventas 7 dias' />)
    expect(screen.getByRole('img', { name: 'Ventas 7 dias' })).toBeTruthy()
    rerender(<TrendSpark data={[1]} />)
    expect(container.querySelector('[data-genui-block="spark"]')).toBeNull()
  })
})

describe('KpiTile', () => {
  it('names the group with label and value and shows delta, hint and spark (hero)', () => {
    const { container } = render(<KpiTile label='Ventas' value='$1,200' delta={4} deltaContext='vs. semana anterior' hint='Hoy' hero spark={[1, 2, 3]} />)
    expect(screen.getByRole('group', { name: 'Ventas: $1,200' })).toBeTruthy()
    expect(container.textContent).toContain('sube 4.0 por ciento vs. semana anterior')
    expect(container.querySelector('[data-genui-block="spark"]')).toBeTruthy()
  })
  it('keeps the card and swaps only the figure for loading / error with retry', () => {
    const retry = vi.fn()
    const { rerender } = render(<KpiTile label='Ventas' value='1' state='loading' />)
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeTruthy()
    expect(screen.getByText('Ventas')).toBeTruthy()
    rerender(<KpiTile label='Ventas' value='1' state='error' onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe('RankedList', () => {
  const items = [
    { id: 'a', label: 'Alfa', value: '10', share: 1, href: '/a' },
    { id: 'b', label: 'Beta', value: '5', share: 0.5 },
  ]
  it('numbers rows, links with href and selects on plain click only', () => {
    const onSelect = vi.fn()
    render(<RankedList items={items} ranked label='Top' onSelect={onSelect} />)
    expect(screen.getByRole('list', { name: 'Top' })).toBeTruthy()
    expect(screen.getByLabelText('Posicion 1')).toBeTruthy()
    const link = screen.getByRole('link', { name: /Alfa/ })
    expect(link.getAttribute('href')).toBe('/a')
    fireEvent.click(link, { ctrlKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(onSelect).toHaveBeenCalledWith(items[0])
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }))
    expect(onSelect).toHaveBeenCalledWith(items[1])
  })
  it('scrolls inside a focusable named region and defers off-screen rows when long', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), label: `Fila ${i}` }))
    const { container } = render(<RankedList items={many} label='Larga' maxHeight={200} />)
    const region = screen.getByRole('region', { name: 'Larga' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(container.querySelector('li')!.getAttribute('style')).toContain('content-visibility')
  })
  it('renders empty and error states in the same frame', () => {
    const { rerender } = render(<RankedList items={[]} label='x' emptyText='Nada' />)
    expect(screen.getByText('Nada')).toBeTruthy()
    rerender(<RankedList items={[]} label='x' state='error' stateMessage='Se cayo' />)
    expect(screen.getByRole('alert').textContent).toContain('Se cayo')
  })
})

describe('SeriesView', () => {
  const rows = [{ label: 'Lun', total: 10 }, { label: 'Mar', total: 20 }]
  const columns = [{ key: 'total', label: 'Total', format: (v: unknown) => `$${v}` }]
  it('keeps the table reachable in chart view and shows it on demand', () => {
    const { container } = render(<SeriesView title='Ventas' columns={columns} rows={rows} chart={<div data-testid='chart' />} />)
    expect(screen.getByTestId('chart')).toBeTruthy()
    expect(container.querySelector('table')!.className).toBe('sr-only')
    expect(screen.getByRole('button', { name: /Grafica/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Tabla/ }))
    expect(screen.queryByTestId('chart')).toBeNull()
    expect(container.querySelector('table')!.className).not.toContain('sr-only')
    expect(screen.getByText('$20')).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: 'Mar' })).toBeTruthy()
  })
  it('honours a controlled view and shows states', () => {
    const onViewChange = vi.fn()
    const { rerender } = render(<SeriesView title='V' columns={columns} rows={rows} chart={<i />} view='table' onViewChange={onViewChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Grafica/ }))
    expect(onViewChange).toHaveBeenCalledWith('chart')
    expect(screen.getByRole('table')).toBeTruthy()
    rerender(<SeriesView title='V' columns={columns} rows={[]} chart={<i />} stateMessage='Sin ventas' />)
    expect(screen.getByText('Sin ventas')).toBeTruthy()
  })
})

describe('BlockState', () => {
  it('uses the right role per kind and keeps one minimum height', () => {
    const { rerender } = render(<BlockState kind='loading' minHeight={120} />)
    expect((screen.getByRole('status') as HTMLElement).style.minHeight).toBe('120px')
    rerender(<BlockState kind='error' minHeight={120} />)
    expect((screen.getByRole('alert') as HTMLElement).style.minHeight).toBe('120px')
    rerender(<BlockState kind='empty' message='Nada' minHeight={120} />)
    expect((screen.getByText('Nada') as HTMLElement).style.minHeight).toBe('120px')
  })
})
