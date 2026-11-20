// @vitest-environment happy-dom
//
// El combobox de valores de los filtros de columna busca por la ETIQUETA visible
// (no solo por el id/valor) y sin importar mayusculas ni acentos: en un filtro
// "Regimen fiscal" teclear "bolsa" o "enajenacion" encuentra "630 - Enajenación
// de acciones en bolsa de valores" aunque el valor sea "630".
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FilterValueCombobox } from './filter-value-combobox'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  { value: '614', label: '614 - Ingresos por intereses' },
  { value: '626', label: '626 - Régimen Simplificado de Confianza' },
  { value: '630', label: '630 - Enajenación de acciones en bolsa de valores' },
]

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() =>
    root!.render(<FilterValueCombobox staticOptions={OPTIONS} selected={[]} onToggle={() => {}} />),
  )
}

function type(text: string) {
  const input = host!.querySelector('input') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const labels = () =>
  Array.from(host!.querySelectorAll('[cmdk-item]')).map((el) => el.textContent?.trim())

describe('FilterValueCombobox search', () => {
  it('lista todo sin consulta', () => {
    mount()
    expect(labels()).toHaveLength(3)
  })

  it('filtra por la etiqueta, sin acentos ni mayusculas', () => {
    mount()
    type('BOLSA')
    expect(labels()).toEqual(['630 - Enajenación de acciones en bolsa de valores'])
    type('regimen simplificado')
    expect(labels()).toEqual(['626 - Régimen Simplificado de Confianza'])
  })

  it('filtra por el valor', () => {
    mount()
    type('614')
    expect(labels()).toEqual(['614 - Ingresos por intereses'])
  })

  it('sin coincidencias muestra el vacio', () => {
    mount()
    type('zzz')
    expect(labels()).toEqual([])
    expect(host!.textContent).toContain('Sin resultados')
  })
})
