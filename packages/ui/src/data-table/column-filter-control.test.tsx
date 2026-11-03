// @vitest-environment happy-dom
//
// Filtro booleano: Sí / No / Sin definir son excluyentes. El backend (dialecto
// de filtros de ops del kernel) no tiene OR entre `= false` e `IS NULL`, así que
// «No» + «Sin definir» no es expresable: elegir una opción reemplaza la otra.
// «Sin definir» viaja como el valor `NULL` (OpNull).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ColumnFilterControl } from './column-filter-control'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// cmdk mide el scroll del item activo.
if (!(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView) {
  ;(Element.prototype as { scrollIntoView: () => void }).scrollIntoView = () => {}
}
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  ;(globalThis as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  document.body.innerHTML = ''
})

const OPTIONS = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
  { value: 'NULL', label: 'Sin definir' },
]

function mount(filterType: 'boolean' | 'select', onFilterChange: (k: string, v: string[]) => void) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root!.render(
      <ColumnFilterControl
        filterKey='sandbox'
        filterType={filterType}
        filterOptions={OPTIONS}
        onFilterChange={onFilterChange}
        label='Sandbox'
      />
    )
  )
  const trigger = host.querySelector('button') as HTMLButtonElement
  act(() => {
    trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    trigger.click()
  })
}

function item(label: string): HTMLElement {
  const el = Array.from(document.querySelectorAll('[cmdk-item]')).find(
    (n) => n.textContent?.trim() === label
  )
  if (!el) throw new Error(`sin opción ${label}`)
  return el as HTMLElement
}

function apply() {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent?.startsWith('Aplicar')
  ) as HTMLButtonElement
  act(() => btn.click())
}

describe('ColumnFilterControl — booleano', () => {
  it('Sí / No / Sin definir son excluyentes y «Sin definir» manda NULL', () => {
    const onFilterChange = vi.fn()
    mount('boolean', onFilterChange)
    act(() => item('No').click())
    act(() => item('Sin definir').click())
    apply()
    expect(onFilterChange).toHaveBeenLastCalledWith('sandbox', ['NULL'])
  })

  it('un select normal sigue siendo multi-valor', () => {
    const onFilterChange = vi.fn()
    mount('select', onFilterChange)
    act(() => item('Sí').click())
    act(() => item('No').click())
    apply()
    expect(onFilterChange).toHaveBeenLastCalledWith('sandbox', ['true', 'false'])
  })
})
