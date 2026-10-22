// @vitest-environment happy-dom
//
// `display: relative_date` ("hace X" + tono por frescura) y avatar de marca
// (`image_field`, `color_field`, `subtitle_field`, `shape`).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeDefaultGetDynamicColumns, resolveAvatarSrc } from '../dynamic-columns'
import {
    brandAvatarColors,
    contrastRatio,
    freshnessTone,
    parseDurationMs,
    parseHexColor,
} from '../relative-date'
import type { TableMetadata } from '../types'

afterEach(cleanup)

function renderCell(col: Record<string, unknown>, row: Record<string, unknown>, timeZone?: string) {
    const meta = {
        title: 't',
        endpoint: '/x',
        columns: [{ label: 'C', ...col }],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: '',
        enableCRUDActions: false,
        hasActions: false,
    } as unknown as TableMetadata
    const cols = makeDefaultGetDynamicColumns({ getImageUrl: (p: string) => p })(meta, undefined, undefined, 'es', undefined, timeZone)
    const key = col.key as string
    const c = cols.find((x) => (x as { accessorKey?: string }).accessorKey === key || x.id === key)
    if (!c || typeof c.cell !== 'function') throw new Error('columna no encontrada')
    const node = (c.cell as (ctx: unknown) => React.ReactNode)({
        row: { original: row },
        getValue: () => row[key],
    })
    return render(<>{node}</>).container
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const rel = (cfg?: Record<string, unknown>) => ({
    key: 'last_seen_at',
    type: 'timestamp',
    cellStyle: 'relative_date',
    styleConfig: cfg,
})

describe('parseDurationMs / freshnessTone', () => {
    it('parsea s/m/h/d y rechaza basura', () => {
        expect(parseDurationMs('30s')).toBe(30_000)
        expect(parseDurationMs('15m')).toBe(900_000)
        expect(parseDurationMs('6h')).toBe(21_600_000)
        expect(parseDurationMs('7d')).toBe(604_800_000)
        expect(parseDurationMs('abc')).toBeUndefined()
        expect(parseDurationMs(undefined)).toBeUndefined()
    })
    it('sin umbrales: neutro', () => {
        expect(freshnessTone(10_000)).toBeUndefined()
    })
    it('fresh_within y stale_after', () => {
        const f = 15 * 60_000
        const s = 60 * 60_000
        expect(freshnessTone(60_000, f, s)).toBe('fresh')
        expect(freshnessTone(30 * 60_000, f, s)).toBe('warn')
        expect(freshnessTone(2 * 60 * 60_000, f, s)).toBe('stale')
    })
    it('un solo umbral', () => {
        expect(freshnessTone(1000, 5000, undefined)).toBe('fresh')
        expect(freshnessTone(9000, 5000, undefined)).toBe('stale')
        expect(freshnessTone(1000, undefined, 5000)).toBe('warn')
        expect(freshnessTone(9000, undefined, 5000)).toBe('stale')
    })
})

describe('celda relative_date', () => {
    it('sin umbrales: texto «hace» sin punto de tono', () => {
        const el = renderCell(rel(), { last_seen_at: ago(3 * 60_000) })
        expect(el.textContent).toMatch(/3 min|3 minutes/i)
        expect(el.querySelector('[data-tone]')).toBeNull()
    })
    it('tono fresh / warn / stale', () => {
        const cfg = { fresh_within: '15m', stale_after: '1h' }
        expect(renderCell(rel(cfg), { last_seen_at: ago(60_000) }).querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('fresh')
        expect(renderCell(rel(cfg), { last_seen_at: ago(30 * 60_000) }).querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('warn')
        expect(renderCell(rel(cfg), { last_seen_at: ago(3 * 3600_000) }).querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('stale')
    })
    it('valor vacío o inválido: guion', () => {
        expect(renderCell(rel(), { last_seen_at: null }).textContent).toBe('-')
        expect(renderCell(rel(), { last_seen_at: '' }).textContent).toBe('-')
        expect(renderCell(rel(), { last_seen_at: 'nope' }).textContent).toBe('-')
    })
    it('tooltip con fecha absoluta en la zona de la org', () => {
        const iso = '2026-01-15T18:30:00Z'
        const el = renderCell(rel(), { last_seen_at: iso }, 'America/Mexico_City')
        const title = el.querySelector('[title]')?.getAttribute('title') ?? ''
        expect(title).toMatch(/12:30/)
        expect(title).toMatch(/CST|GMT-6/)
    })
})

describe('avatar de marca', () => {
    const avatar = (cfg: Record<string, unknown>) => ({
        key: 'brand_name',
        type: 'text',
        cellStyle: 'avatar',
        styleConfig: cfg,
    })
    it('color_field: iniciales sobre el color de la fila con contraste AA', () => {
        const el = renderCell(avatar({ color_field: 'brand_color' }), { brand_name: 'Acme Corp', brand_color: '#1d4ed8' })
        const fb = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === 'AC' && s.className.includes('text-[10px]')) as HTMLElement
        expect(fb).toBeTruthy()
        expect(fb.style.backgroundColor).toBe('rgb(29, 78, 216)')
        expect(fb.style.color).toBe('#ffffff')
    })
    it('color claro usa tinta oscura', () => {
        const c = brandAvatarColors('#fde68a')!
        expect(c.color).toBe('#020617')
        expect(c.ratio).toBeGreaterThanOrEqual(4.5)
    })
    it('AA para una muestra de colores', () => {
        for (const h of ['#ef4444', '#10b981', '#6366f1', '#000000', '#ffffff', '#f59e0b', '#0ea5e9']) {
            const c = brandAvatarColors(h)!
            expect(c.ratio, h).toBeGreaterThanOrEqual(4.5)
        }
        expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0)
    })
    it('hex inválido o ausente: comportamiento previo (sin estilo inline)', () => {
        expect(parseHexColor('rojo')).toBeUndefined()
        const el = renderCell(avatar({ color_field: 'brand_color' }), { brand_name: 'Acme Corp', brand_color: 'rojo' })
        const fb = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === 'AC' && s.className.includes('text-[10px]')) as HTMLElement
        expect(fb.getAttribute('style') ?? '').toBe('')
        expect(fb.className).toContain('bg-primary/5')
    })
    it('sin config: intacto', () => {
        const el = renderCell({ key: 'name', type: 'avatar' }, { name: 'Ana Perez' })
        const fb = Array.from(el.querySelectorAll('span')).find((s) => s.textContent === 'AP' && s.className.includes('text-[10px]')) as HTMLElement
        expect(fb.className).toContain('rounded-lg')
        expect(fb.getAttribute('style') ?? '').toBe('')
    })
    it('shape circle y subtitle_field', () => {
        const el = renderCell(avatar({ shape: 'circle', subtitle_field: 'customer' }), { brand_name: 'Acme', customer: 'Cliente SA' })
        expect(el.textContent).toContain('Cliente SA')
        expect(el.innerHTML).toContain('rounded-full')
    })
    it('image_field resuelve la URL del logo con la regla de base_path', () => {
        const col = { key: 'brand_name', label: 'B', type: 'avatar', styleConfig: { image_field: 'brand_logo_url' } } as never
        expect(resolveAvatarSrc(col, { brand_logo_url: 'https://cdn.x/l.svg' }, 'Acme')).toBe('https://cdn.x/l.svg')
        expect(resolveAvatarSrc(col, { brand_logo_url: 'l.png' }, 'Acme', 'https://api.x')).toBe('https://api.xl.png')
        // sin imagen en la fila: cae al valor de la columna (previo)
        expect(resolveAvatarSrc(col, {}, 'https://cdn.x/v.png')).toBe('https://cdn.x/v.png')
    })
})
