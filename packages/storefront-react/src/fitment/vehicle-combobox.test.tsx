// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useState } from 'react'
import { VehicleCombobox, type VehicleComboboxOption } from './index.js'

afterEach(cleanup)

const MAKES: VehicleComboboxOption[] = [
  { value: 'CHEVROLET', label: 'Chevrolet' },
  { value: 'FORD', label: 'Ford' },
  { value: 'NISSAN', label: 'Nissan' },
  { value: 'VOLKSWAGEN', label: 'Volkswagen' },
  { value: 'TOYOTA', label: 'Toyota' },
  { value: 'KIA', label: 'Kia' },
  { value: 'MAZDA', label: 'Mazda' },
  { value: 'HONDA', label: 'Honda' },
  { value: 'BMW', label: 'BMW' },
]

function Harness({ onChange = () => {}, initial = '' }: { onChange?: (v: string) => void; initial?: string }) {
  const [v, setV] = useState(initial)
  return (
    <form>
      <label htmlFor="make">Marca</label>
      <VehicleCombobox
        id="make"
        name="make"
        label="Marca"
        value={v}
        onChange={(n) => {
          setV(n)
          onChange(n)
        }}
        options={MAKES}
        logos
        popular={['NISSAN', 'VOLKSWAGEN']}
        popularLabel="Marcas populares"
      />
    </form>
  )
}

const flush = () => act(async () => new Promise((r) => requestAnimationFrame(() => r(undefined))))

describe('<VehicleCombobox>', () => {
  it('en el servidor es un <select> nativo con id y name (funciona sin JavaScript)', () => {
    const html = renderToString(<Harness />)
    expect(html).toContain('<select id="make" name="make"')
    expect(html).not.toContain('role="combobox"')
  })

  it('al hidratar el campo es un combobox y el <select> sigue en el formulario', () => {
    const { container } = render(<Harness initial="NISSAN" />)
    const combo = screen.getByRole('combobox', { name: /Marca: Nissan/ })
    expect(combo.id).toBe('make')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    const select = container.querySelector('select[name="make"]') as HTMLSelectElement
    expect(select.value).toBe('NISSAN')
    expect(select.getAttribute('aria-hidden')).toBe('true')
    // Logo de la marca elegida dentro del campo.
    expect(combo.querySelector('.sf-vehicle-make[data-make="nissan"]')).not.toBeNull()
  })

  it('teclado: ↓ abre, escribir filtra, ↓ y Enter eligen; el foco vuelve al campo', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const combo = screen.getByRole('combobox', { name: /Marca/ })
    combo.focus()
    fireEvent.keyDown(combo, { key: 'ArrowDown' })
    await flush()
    expect(combo.getAttribute('aria-expanded')).toBe('true')
    const search = screen.getByRole('combobox', { name: 'Buscar marca' })
    expect(document.activeElement).toBe(search)
    // Marcas populares arriba con logo, antes de escribir.
    expect(screen.getByText('Marcas populares')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'o' } })
    const options = screen.getAllByRole('option')
    // Primero las que empiezan con «o»… ninguna; luego las que la contienen.
    expect(options.map((o) => o.textContent)).toEqual(['Chevrolet', 'Ford', 'Volkswagen', 'Toyota', 'Honda'])
    expect(screen.queryByText('Marcas populares')).toBeNull()
    fireEvent.change(search, { target: { value: 'to' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Toyota'])
    expect(search.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option').id)
    fireEvent.keyDown(search, { key: 'Enter' })
    await flush()
    expect(onChange).toHaveBeenCalledWith('TOYOTA')
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(combo)
  })

  it('type-ahead: escribir con el campo enfocado abre y busca', async () => {
    render(<Harness />)
    const combo = screen.getByRole('combobox', { name: /Marca/ })
    fireEvent.keyDown(combo, { key: 'k' })
    await flush()
    const search = screen.getByRole('combobox', { name: 'Buscar marca' }) as HTMLInputElement
    expect(search.value).toBe('k')
    expect(screen.getAllByRole('option')[0]!.textContent).toBe('Kia')
  })

  it('Esc cierra sin elegir y devuelve el foco', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const combo = screen.getByRole('combobox', { name: /Marca/ })
    fireEvent.click(combo)
    await flush()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Buscar marca' }), { key: 'Escape' })
    await flush()
    expect(combo.getAttribute('aria-expanded')).toBe('false')
    expect(onChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(combo)
  })

  it('la rejilla de populares elige con un toque', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: /Marca/ }))
    await flush()
    fireEvent.click(screen.getByRole('button', { name: 'Volkswagen' }))
    expect(onChange).toHaveBeenCalledWith('VOLKSWAGEN')
  })

  it('cada opción mide al menos 44 px (objetivo táctil) y lleva su logo', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('combobox', { name: /Marca/ }))
    await flush()
    const opt = screen.getAllByRole('option')[0]!
    expect(opt.style.minHeight).toBe('44px')
    expect(opt.querySelector('.sf-vehicle-make')).not.toBeNull()
  })
})

describe('<VehicleCombobox> type-ahead rápido', () => {
  it('varias teclas seguidas en el campo forman la búsqueda completa', () => {
    render(<Harness />)
    const combo = screen.getByRole('combobox', { name: /Marca/ })
    combo.focus()
    fireEvent.keyDown(combo, { key: 'n' })
    // El buscador ya tiene el foco en el mismo commit; si una tecla llega todavía al campo, se suma.
    const search = screen.getByRole('combobox', { name: 'Buscar marca' }) as HTMLInputElement
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(combo, { key: 'i' })
    fireEvent.keyDown(combo, { key: 's' })
    expect(search.value).toBe('nis')
    expect(screen.getAllByRole('option')[0]!.textContent).toBe('Nissan')
  })
})
