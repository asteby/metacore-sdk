// @vitest-environment happy-dom
//
// Wiring of the rich cells into the default column factory: a manifest column declared `display: chips | meter | color`
// (the kernel serves it as `cellStyle`/`type`) renders the matching cell from `display_config` and the row — what an
// addon needs to show a license's exposure, a wallet's fill level or a brand's two colors in a table.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeDefaultGetDynamicColumns } from '../dynamic-columns'
import type { ColumnDefinition, TableMetadata } from '../types'

afterEach(cleanup)

const base: Omit<ColumnDefinition, 'key' | 'label' | 'type'> = { sortable: false, filterable: false }

function cellFor(col: Partial<ColumnDefinition> & { key: string }, row: Record<string, unknown>, lang = 'en-US') {
    const meta = {
        title: 'T',
        endpoint: '/data/t',
        columns: [{ ...base, label: col.key, type: 'text', ...col } as ColumnDefinition],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: '',
        enableCRUDActions: false,
        hasActions: false,
    } as unknown as TableMetadata
    const t = (k: string, o?: { defaultValue?: string }) => (k === 'k.all' ? 'All public' : (o?.defaultValue ?? k))
    const cols = makeDefaultGetDynamicColumns()(meta, undefined, t, lang)
    const c = cols.find((x) => (x as { id?: string }).id === col.key) as { cell: (ctx: unknown) => React.ReactNode }
    expect(c, `columna ${col.key}`).toBeTruthy()
    return render(<>{c.cell({ row: { original: row } })}</>).container
}

describe('chips', () => {
    it('una columna JSON con display chips pinta un chip por valor, con labels traducidos y +N', () => {
        const el = cellFor(
            { key: 'addons', cellStyle: 'chips', styleConfig: { labels: { '*': 'k.all' }, max: 2 } } as never,
            { addons: ['*', 'b', 'c', 'd'] },
        )
        expect(el.textContent).toContain('All public')
        expect(el.querySelector('[data-chips-overflow]')?.textContent).toBe('+2')
    })

    it('lista vacía o nula cae al guion en lugar de un punto o de [] crudo', () => {
        expect(cellFor({ key: 'presets', cellStyle: 'chips' } as never, { presets: [] }).textContent).toBe('-')
        cleanup()
        expect(cellFor({ key: 'presets', cellStyle: 'chips' } as never, { presets: null }).textContent).toBe('-')
    })
})

describe('meter', () => {
    it('max_field toma el techo de otra columna de la fila', () => {
        const el = cellFor(
            { key: 'bal', cellStyle: 'meter', styleConfig: { max_field: 'topup', unit: 'Sparks' } } as never,
            { bal: 250, topup: 1000 },
        )
        expect(el.textContent).toBe('250 Sparks')
        expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25')
    })

    it('max fijo en display_config y sin techo solo el número', () => {
        expect(
            cellFor({ key: 'q', cellStyle: 'meter', styleConfig: { max: 200 } } as never, { q: 50 }).querySelector('[role="progressbar"]')
                ?.getAttribute('aria-valuenow'),
        ).toBe('25')
        cleanup()
        const bare = cellFor({ key: 'q', cellStyle: 'meter' } as never, { q: 1234 })
        expect(bare.textContent).toBe('1,234')
        expect(bare.querySelector('[role="progressbar"]')).toBeNull()
    })
})

describe('color.also', () => {
    it('sin also se comporta como siempre: un cuadro y su hex', () => {
        const el = cellFor({ key: 'p', cellStyle: 'color' } as never, { p: '#0F766E' })
        expect(el.textContent).toBe('#0F766E')
        expect(el.querySelectorAll('[data-swatch]').length).toBe(0)
    })

    it('con also pinta el principal y los de las columnas hermanas', () => {
        const el = cellFor(
            { key: 'p', cellStyle: 'color', styleConfig: { also: ['a'] } } as never,
            { p: '#0F766E', a: '#F59E0B' },
        )
        expect(el.querySelectorAll('[data-swatch]').length).toBe(2)
        expect(el.firstElementChild?.getAttribute('title')).toBe('#0F766E · #F59E0B')
    })
})

describe('currency.minor_units', () => {
  it('una columna en centavos se divide antes de formatear: 1038 -> $10.38', () => {
    const el = cellFor({ key: 'est_cents', cellStyle: 'currency', styleConfig: { currency: 'USD', minor_units: true } } as never, { est_cents: 1038 })
    expect(el.textContent).toBe('$10.38')
  })

  it('sin minor_units el valor se toma tal cual (comportamiento de siempre)', () => {
    const el = cellFor({ key: 'price', cellStyle: 'currency', styleConfig: { currency: 'USD' } } as never, { price: 1038 })
    expect(el.textContent).toBe('$1,038.00')
  })
})
