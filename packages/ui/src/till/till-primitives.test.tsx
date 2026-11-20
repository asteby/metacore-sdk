// @vitest-environment happy-dom
//
// ProductTile (imageAspect, code, footer), ProductTileSkeletonGrid (fill) y el
// Pagination independiente de TanStack.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProductTile } from './product-tile'
import { ProductTileSkeletonGrid } from './product-tile-skeleton'
import { Pagination } from '../data-table/pagination'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})
function mount(node: React.ReactNode) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

describe('ProductTile', () => {
  it('usa 4 / 3 por defecto y respeta imageAspect', () => {
    const a = mount(<ProductTile title='P' price='$1' imageUrl='x.png' />)
    expect((a.querySelector('[style*="aspect-ratio"]') as HTMLElement).style.aspectRatio).toBe('4 / 3')
    act(() => root?.unmount())
    const b = mount(<ProductTile title='P' price='$1' imageAspect='1 / 1' />)
    expect((b.querySelector('[style*="aspect-ratio"]') as HTMLElement).style.aspectRatio).toBe('1 / 1')
  })
  it('muestra código y footer solo cuando se pasan', () => {
    const a = mount(<ProductTile title='P' price='$1' code='SKU-1' footer='12 en stock' />)
    expect(a.textContent).toContain('SKU-1')
    expect(a.textContent).toContain('12 en stock')
    act(() => root?.unmount())
    const b = mount(<ProductTile title='P' price='$1' />)
    expect(b.textContent).not.toContain('SKU-1')
  })
})

describe('ProductTileSkeletonGrid', () => {
  it('count por defecto 10; con fill sobredibuja y recorta al alto del área', () => {
    const a = mount(<ProductTileSkeletonGrid />)
    expect(a.querySelector('[data-fill]')).toBeNull()
    expect(a.firstElementChild!.children.length).toBe(10)
    act(() => root?.unmount())
    const b = mount(<ProductTileSkeletonGrid fill imageAspect='1 / 1' />)
    const grid = b.querySelector('[data-fill="true"]') as HTMLElement
    expect(grid.children.length).toBe(40)
    expect(grid.className).toContain('h-full')
    expect(grid.className).toContain('overflow-hidden')
  })
})

describe('Pagination', () => {
  it('navega sin TanStack y deshabilita los extremos', () => {
    const onPage = vi.fn()
    const el = mount(<Pagination page={1} pageCount={3} onPageChange={onPage} />)
    const buttons = Array.from(el.querySelectorAll('button')) as HTMLButtonElement[]
    // primero y anterior deshabilitados; siguiente y último habilitados
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(true)
    const next = buttons[buttons.length - 2]
    expect(next.disabled).toBe(false)
    act(() => next.click())
    expect(onPage).toHaveBeenCalledWith(2)
    act(() => buttons[buttons.length - 1].click())
    expect(onPage).toHaveBeenCalledWith(3)
  })
  it('sin onPageSizeChange no pinta el selector de filas', () => {
    const el = mount(<Pagination page={2} pageCount={5} onPageChange={() => {}} />)
    expect(el.textContent).not.toContain('rows_per_page')
  })
})
