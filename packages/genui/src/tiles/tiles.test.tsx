// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BlockState, RankedList, SeriesView } from './index'

afterEach(cleanup)

describe('RankedList', () => {
  const items = [
    { id: 'a', label: 'Alfa', value: '10', share: 1, href: '/a' },
    { id: 'b', label: 'Beta', value: '5', share: 0.5, badge: 'Nuevo', tone: 'success' as const },
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
    expect(screen.getByText('Nuevo')).toBeTruthy()
  })
  it('clamps the share bar to 0-100 %', () => {
    const { container } = render(<RankedList items={[{ id: 'x', label: 'X', share: 7 }, { id: 'y', label: 'Y', share: -1 }]} label='L' />)
    const widths = [...container.querySelectorAll('li span[style]')].map((e) => (e as HTMLElement).style.width)
    expect(widths).toEqual(['100%', '0%'])
  })
  it('scrolls inside a focusable named region and defers off-screen rows when long', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), label: `Fila ${i}` }))
    const { container } = render(<RankedList items={many} label='Larga' maxHeight={200} />)
    const region = screen.getByRole('region', { name: 'Larga' })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.querySelector('ul')).toBeTruthy()
    expect(container.querySelector('li')!.getAttribute('style')).toContain('content-visibility')
  })
  it('does not defer rows in a short list', () => {
    const { container } = render(<RankedList items={items} label='Corta' />)
    expect(container.querySelector('li')!.getAttribute('style')).toBeNull()
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
  it('honours a controlled view, shares one height between views and shows states', () => {
    const onViewChange = vi.fn()
    const { container, rerender } = render(<SeriesView title='V' columns={columns} rows={rows} chart={<i />} view='table' height={200} onViewChange={onViewChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Grafica/ }))
    expect(onViewChange).toHaveBeenCalledWith('chart')
    expect(screen.getByRole('table')).toBeTruthy()
    expect((container.querySelector('[id$="-body"]') as HTMLElement).style.height).toBe('200px')
    rerender(<SeriesView title='V' columns={columns} rows={[]} chart={<i />} stateMessage='Sin ventas' />)
    expect(screen.getByText('Sin ventas')).toBeTruthy()
  })
  it('prints a dash for a missing cell instead of "undefined"', () => {
    render(<SeriesView title='V' columns={[{ key: 'total', label: 'Total' }]} rows={[{ label: 'Lun' }]} chart={<i />} view='table' />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('BlockState', () => {
  it('keeps one minimum height for every state and the right live-region role', () => {
    const { container, rerender } = render(<BlockState kind='loading' minHeight={120} />)
    expect((container.firstChild as HTMLElement).style.minHeight).toBe('120px')
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<BlockState kind='error' minHeight={120} onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect((container.firstChild as HTMLElement).style.minHeight).toBe('120px')
    rerender(<BlockState kind='empty' message='Nada' minHeight={120} />)
    expect(screen.getByText('Nada')).toBeTruthy()
  })
  it('only offers retry on errors and exposes the contract marker', () => {
    const retry = vi.fn()
    const { container, rerender } = render(<BlockState kind='loading' onRetry={retry} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<BlockState kind='error' marker='source-error' onRetry={retry} />)
    expect(container.querySelector('[data-genui-block="source-error"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(retry).toHaveBeenCalledOnce()
  })
})
