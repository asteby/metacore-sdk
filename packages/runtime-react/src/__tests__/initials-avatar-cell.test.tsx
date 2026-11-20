// @vitest-environment happy-dom
// Celda `initial`/`avatar` sin imagen: iniciales + color estable por texto, sin red.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { looksLikeImageRef, makeDefaultGetDynamicColumns, resolveAvatarSrc } from '../dynamic-columns'
import type { ColumnDefinition, TableMetadata } from '../types'

afterEach(cleanup)

function renderCell(col: Record<string, unknown>, row: Record<string, unknown>) {
    const meta = {
        title: 't', endpoint: '/x', columns: [{ label: 'C', ...col }], actions: [],
        perPageOptions: [10], defaultPerPage: 10, searchPlaceholder: '',
        enableCRUDActions: false, hasActions: false,
    } as unknown as TableMetadata
    const cols = makeDefaultGetDynamicColumns({ getImageUrl: (p: string) => p, apiBaseUrl: 'https://api.test' })(meta, undefined, undefined, 'es')
    const key = col.key as string
    const c = cols.find((x) => (x as { accessorKey?: string }).accessorKey === key || x.id === key)
    if (!c || typeof c.cell !== 'function') throw new Error('columna no encontrada')
    const node = (c.cell as (ctx: unknown) => React.ReactNode)({ row: { original: row }, getValue: () => row[key] })
    return render(<>{node}</>).container
}

const bg = (el: HTMLElement) => el.style.backgroundColor

describe('looksLikeImageRef', () => {
    it('acepta urls, rutas y archivos de imagen; rechaza etiquetas', () => {
        for (const ok of ['https://x/y', '/a/b.png', 'a/b', '2.png', 'data:image/png;base64,AA', 'f.JPG?v=1']) expect(looksLikeImageRef(ok)).toBe(true)
        for (const no of ['', 'Ana Perez', 'Ana', 'j.perez']) expect(looksLikeImageRef(no)).toBe(false)
    })
    it('resolveAvatarSrc no fabrica una URL a partir de un nombre', () => {
        const c = { key: 'avatar', label: 'A', type: 'avatar' } as unknown as ColumnDefinition
        expect(resolveAvatarSrc(c, { avatar: 'Ana Perez' }, 'Ana Perez', 'https://api.test')).toBeUndefined()
        expect(resolveAvatarSrc(c, { avatar: '2.png' }, '2.png', 'https://api.test')).toBe('https://api.test2.png')
    })
})

describe('cellStyle initial / avatar sin imagen', () => {
    it.each([['initial', undefined], ['avatar', { tone: 'auto' }]])('%s: iniciales, sin <img>, color estable', (style, styleConfig) => {
        const col = { key: 'name', type: 'text', cellStyle: style, styleConfig }
        const a = renderCell(col, { name: 'Ana Perez', avatar: 'Ana Perez' })
        expect(a.querySelector('img')).toBeNull()
        expect(a.textContent).toContain('AP')
        const colorA = bg(a.querySelector('[data-slot="avatar-fallback"], span[style]') as HTMLElement)
        cleanup()
        const b = renderCell(col, { name: 'Ana Perez' })
        expect(bg(b.querySelector('[data-slot="avatar-fallback"], span[style]') as HTMLElement)).toBe(colorA)
        expect(colorA).not.toBe('')
    })
    it('initial ignora una url aunque el valor la parezca (sin red)', () => {
        const c = renderCell({ key: 'name', type: 'text', cellStyle: 'initial' }, { name: 'Zed' })
        expect(c.querySelector('img')).toBeNull()
    })
})
