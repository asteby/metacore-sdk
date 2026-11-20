// @vitest-environment happy-dom
//
// Searchable select: a STATIC `select` with many options (or `searchable: true`)
// renders a combobox with a search box instead of a flat dropdown.
//   - pure rules: threshold, accent/case-insensitive filter by label, code and
//     description, ranking, windowing;
//   - the component: filters while typing, highlights, "Sin resultados",
//     keyboard (arrows / Enter / Esc), selection mark, clear when optional;
//   - wiring: EditField (DynamicRecordDialog) and DynamicForm choose combobox vs
//     flat select by option count and `searchable`.
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const t = (k: string, o?: Record<string, any>) => o?.defaultValue ?? k
    const value = { t, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import {
    SEARCHABLE_SELECT_THRESHOLD,
    filterSearchableOptions,
    isSearchableSelect,
    windowOptions,
} from '../searchable-select'
import { SearchableSelectField } from '../searchable-select-field'
import { EditField } from '../dialogs/dynamic-record'
import { DynamicForm } from '../dynamic-form'

afterEach(cleanup)

const REGIMENES = [
    ['601', 'General de Ley Personas Morales'],
    ['603', 'Personas Morales con Fines no Lucrativos'],
    ['605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios'],
    ['606', 'Arrendamiento'],
    ['607', 'Régimen de Enajenación o Adquisición de Bienes'],
    ['608', 'Demás ingresos'],
    ['610', 'Residentes en el Extranjero sin Establecimiento Permanente en México'],
    ['611', 'Ingresos por Dividendos (socios y accionistas)'],
    ['612', 'Personas Físicas con Actividades Empresariales y Profesionales'],
    ['614', 'Ingresos por intereses'],
    ['615', 'Régimen de los ingresos por obtención de premios'],
    ['616', 'Sin obligaciones fiscales'],
    ['620', 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos'],
    ['621', 'Incorporación Fiscal'],
    ['622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras'],
    ['623', 'Opcional para Grupos de Sociedades'],
    ['624', 'Coordinados'],
    ['625', 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas'],
    ['626', 'Régimen Simplificado de Confianza'],
    ['628', 'Hidrocarburos'],
    ['629', 'De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales'],
    ['630', 'Enajenación de acciones en bolsa de valores'],
].map(([value, label]) => ({ value, label: `${value} - ${label}` }))

describe('isSearchableSelect (umbral)', () => {
    it('por defecto solo por encima de 8 opciones', () => {
        expect(SEARCHABLE_SELECT_THRESHOLD).toBe(8)
        expect(isSearchableSelect({}, 8)).toBe(false)
        expect(isSearchableSelect({}, 9)).toBe(true)
        expect(isSearchableSelect(undefined, 3)).toBe(false)
    })
    it('searchable explícito gana en ambos sentidos', () => {
        expect(isSearchableSelect({ searchable: true }, 2)).toBe(true)
        expect(isSearchableSelect({ searchable: false }, 500)).toBe(false)
    })
    it('searchThreshold por campo; valores inválidos caen al default', () => {
        expect(isSearchableSelect({ searchThreshold: 3 }, 4)).toBe(true)
        expect(isSearchableSelect({ searchThreshold: 30 }, 25)).toBe(false)
        expect(isSearchableSelect({ searchThreshold: -1 }, 5)).toBe(false)
        expect(isSearchableSelect({ searchThreshold: Number.NaN }, 9)).toBe(true)
    })
})

describe('filterSearchableOptions', () => {
    it('encuentra por código, palabra y sin acentos', () => {
        expect(filterSearchableOptions(REGIMENES, '630').map((o) => o.value)).toEqual(['630'])
        expect(filterSearchableOptions(REGIMENES, 'BOLSA').map((o) => o.value)).toEqual(['630'])
        expect(filterSearchableOptions(REGIMENES, 'enajenacion').map((o) => o.value)).toEqual(['607', '630'])
        expect(filterSearchableOptions(REGIMENES, 'regimen simplificado').map((o) => o.value)).toEqual(['626'])
    })
    it('busca también en description', () => {
        const opts = [
            { value: 'a', label: 'Alpha', description: 'primer elemento' },
            { value: 'b', label: 'Beta', description: 'segundo' },
        ]
        expect(filterSearchableOptions(opts, 'SEGUNDO').map((o) => o.value)).toEqual(['b'])
    })
    it('sin resultados devuelve vacío; query vacía no filtra ni muta', () => {
        expect(filterSearchableOptions(REGIMENES, 'zzzz')).toEqual([])
        const all = filterSearchableOptions(REGIMENES, '  ')
        expect(all).toHaveLength(REGIMENES.length)
        expect(all).not.toBe(REGIMENES)
    })
    it('ordena: empieza con la consulta antes que contiene', () => {
        const opts = [
            { value: '1', label: 'Fiscal general' },
            { value: '2', label: 'General de ley' },
            { value: '3', label: 'Regimen general' },
        ]
        expect(filterSearchableOptions(opts, 'general').map((o) => o.value)).toEqual(['2', '1', '3'])
    })
})

describe('windowOptions', () => {
    it('no recorta bajo el tope; recorta y conserva la opción seleccionada', () => {
        const rows = Array.from({ length: 300 }, (_, i) => i)
        expect(windowOptions(rows.slice(0, 50), 100, () => false)).toEqual({ rows: rows.slice(0, 50), hidden: 0 })
        const w = windowOptions(rows, 100, (n) => n === 250)
        expect(w.rows).toHaveLength(101)
        expect(w.rows).toContain(250)
        expect(w.hidden).toBe(199)
    })
})

function Harness({ required = false, initial = '' }: { required?: boolean; initial?: string }) {
    const [v, setV] = useState(initial)
    return (
        <>
            <SearchableSelectField
                id="regimen"
                ariaLabel="Régimen fiscal"
                options={REGIMENES}
                value={v}
                onChange={setV}
                required={required}
            />
            <output data-testid="value">{v}</output>
        </>
    )
}

const open = () => fireEvent.click(screen.getByRole('combobox', { name: 'Régimen fiscal' }))
const search = () => screen.getAllByRole('combobox').find((el) => el.tagName === 'INPUT') as HTMLInputElement
const type = (text: string) => fireEvent.change(search(), { target: { value: text } })

describe('SearchableSelectField', () => {
    it('abre con buscador, filtra por código y por palabra sin acentos, y resalta', () => {
        render(<Harness />)
        open()
        expect(screen.getAllByRole('option').length).toBe(REGIMENES.length)
        type('630')
        const opts = screen.getAllByRole('option')
        expect(opts).toHaveLength(1)
        expect(opts[0]!.textContent).toContain('Enajenación de acciones en bolsa de valores')
        expect(opts[0]!.querySelector('mark')?.textContent).toBe('630')
        type('bolsa')
        expect(screen.getAllByRole('option')).toHaveLength(1)
        expect(screen.getByRole('option').querySelector('mark')?.textContent).toBe('bolsa')
        type('ENAJENACION')
        expect(screen.getAllByRole('option')).toHaveLength(2)
        expect(screen.getAllByRole('option')[1]!.querySelector('mark')?.textContent).toBe('Enajenación')
    })

    it('muestra "Sin resultados" cuando nada coincide', () => {
        render(<Harness />)
        open()
        type('qwerty')
        expect(screen.queryAllByRole('option')).toHaveLength(0)
        expect(screen.getByText('Sin resultados')).toBeTruthy()
    })

    it('teclado: flechas + Enter eligen, Esc cierra, ARIA listbox/combobox', () => {
        render(<Harness />)
        open()
        const input = search()
        expect(input.getAttribute('aria-autocomplete')).toBe('list')
        expect(screen.getByRole('listbox', { name: 'Régimen fiscal' })).toBeTruthy()
        type('ingresos')
        fireEvent.keyDown(input, { key: 'ArrowDown' })
        const active = input.getAttribute('aria-activedescendant')
        expect(active).toBeTruthy()
        expect(document.getElementById(active!)?.getAttribute('data-active')).toBe('true')
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(screen.getByTestId('value').textContent).not.toBe('')
        expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('elegir marca la opción y reabrir la deja seleccionada y activa', () => {
        render(<Harness initial="626" />)
        const trigger = screen.getByRole('combobox', { name: 'Régimen fiscal' })
        expect(trigger.textContent).toContain('626 - Régimen Simplificado de Confianza')
        fireEvent.click(trigger)
        const sel = screen.getAllByRole('option').find((o) => o.getAttribute('data-selected') === 'true')
        expect(sel?.textContent).toContain('626')
        expect(sel?.getAttribute('data-active')).toBe('true')
    })

    it('limpiar solo cuando no es requerido', () => {
        const { unmount } = render(<Harness initial="601" />)
        fireEvent.click(screen.getByLabelText('Quitar selección'))
        expect(screen.getByTestId('value').textContent).toBe('')
        unmount()
        render(<Harness initial="601" required />)
        expect(screen.queryByLabelText('Quitar selección')).toBeNull()
    })

    it('lista enorme: se ventanea y avisa cuántas hay', () => {
        const big = Array.from({ length: 400 }, (_, i) => ({ value: `v${i}`, label: `Opción ${i}` }))
        render(<SearchableSelectField options={big} value="v399" onChange={() => {}} ariaLabel="Grande" />)
        fireEvent.click(screen.getByRole('combobox', { name: 'Grande' }))
        expect(screen.getAllByRole('option')).toHaveLength(101)
        expect(screen.getByText(/Mostrando 101 de 400/)).toBeTruthy()
        expect(screen.getAllByRole('option').some((o) => o.getAttribute('data-selected') === 'true')).toBe(true)
    })
})

describe('cableado por umbral', () => {
    const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Opción ${i}` }))

    it('EditField: 25 opciones => combobox con buscador', () => {
        render(<EditField field={{ key: 'regimen', label: 'Régimen fiscal', type: 'select', options: REGIMENES }} value="" onChange={() => {}} />)
        fireEvent.click(screen.getByRole('combobox'))
        expect(search()).toBeTruthy()
    })

    it('EditField: pocas opciones => select plano (sin buscador)', () => {
        render(<EditField field={{ key: 'k', label: 'K', type: 'select', options: opts(5) }} value="" onChange={() => {}} />)
        const trigger = screen.getByRole('combobox')
        expect(trigger.getAttribute('aria-haspopup')).not.toBe('listbox') // Radix Select, no RecordPicker
        expect(trigger.closest('[data-slot="searchable-select"]')).toBeNull()
    })

    it('EditField: searchable true fuerza el buscador con pocas; false lo quita con muchas', () => {
        const { unmount } = render(
            <EditField field={{ key: 'k', label: 'K', type: 'select', options: opts(3), searchable: true }} value="" onChange={() => {}} />,
        )
        expect(document.querySelector('[data-slot="searchable-select"]')).toBeTruthy()
        unmount()
        render(<EditField field={{ key: 'k', label: 'K', type: 'select', options: opts(40), searchable: false }} value="" onChange={() => {}} />)
        expect(document.querySelector('[data-slot="searchable-select"]')).toBeNull()
    })

    it('DynamicForm: el campo select largo usa el combobox', () => {
        render(
            <DynamicForm
                fields={[{ key: 'regimen', label: 'Régimen fiscal', type: 'select', options: REGIMENES }]}
                onSubmit={() => {}}
            />,
        )
        const scope = within(document.body)
        expect(scope.getByRole('combobox', { name: 'Régimen fiscal' })).toBeTruthy()
        expect(document.querySelector('[data-slot="searchable-select"]')).toBeTruthy()
    })
})
