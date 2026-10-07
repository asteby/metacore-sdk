// @vitest-environment happy-dom
//
// Columnas `type: 'image'` respetan `basePath` con el mismo contrato que
// resolveAvatarSrc, y `normalizeImagePath` (host) corre antes de resolver.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeDefaultGetDynamicColumns, resolveImageSrc, type DynamicColumnsHelpers } from '../dynamic-columns'
import type { TableMetadata } from '../types'

afterEach(cleanup)

function renderImage(
    value: string,
    colExtra: Record<string, unknown>,
    helpers: DynamicColumnsHelpers,
): string | null {
    const meta = {
        title: 't',
        endpoint: '/x',
        columns: [{ key: 'photo', label: 'Foto', type: 'image', ...colExtra }],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: '',
        enableCRUDActions: false,
        hasActions: false,
    } as unknown as TableMetadata
    const cols = makeDefaultGetDynamicColumns({ getImageUrl: (p) => p, ...helpers })(meta)
    const col = cols.find((c) => (c as { accessorKey?: string }).accessorKey === 'photo' || c.id === 'photo')
    if (!col || typeof col.cell !== 'function') throw new Error('columna image no encontrada')
    const node = (col.cell as (ctx: unknown) => React.ReactNode)({ row: { original: { photo: value } } })
    const { container } = render(<>{node}</>)
    return container.querySelector('img')?.getAttribute('src') ?? null
}

describe('image + basePath', () => {
    it('filename suelto -> apiBaseUrl + basePath + filename', () => {
        expect(renderImage('a.png', { basePath: '/storage/' }, { apiBaseUrl: 'https://api.x' })).toBe(
            'https://api.x/storage/a.png',
        )
    })
    it('URL absoluta intacta', () => {
        expect(renderImage('https://cdn.x/a.png', { basePath: '/storage/' }, { apiBaseUrl: 'https://api.x' })).toBe(
            'https://cdn.x/a.png',
        )
    })
    it('ruta absoluta intacta', () => {
        expect(renderImage('/files/a.png', { basePath: '/storage/' }, { apiBaseUrl: 'https://api.x' })).toBe(
            '/files/a.png',
        )
    })
    it('sin basePath: comportamiento actual (valor tal cual)', () => {
        expect(renderImage('a.png', {}, { apiBaseUrl: 'https://api.x' })).toBe('a.png')
    })
    it('normalizeImagePath se aplica antes de resolver', () => {
        const normalizeImagePath = (raw: string) => raw.replace('/storage/public/', '/storage/')
        expect(renderImage('/storage/public/a.png', { basePath: '/storage/' }, { normalizeImagePath })).toBe(
            '/storage/a.png',
        )
    })
    it('normalizeImagePath puede convertir en filename y aplicar basePath', () => {
        expect(
            renderImage('public:a.png', { basePath: '/storage/' }, { normalizeImagePath: (r) => r.replace('public:', '') }),
        ).toBe('/storage/a.png')
    })
})

describe('resolveImageSrc', () => {
    it('sin normalize ni basePath devuelve el valor', () => {
        expect(resolveImageSrc({ key: 'k', label: 'k', type: 'image' } as never, 'a.png')).toBe('a.png')
    })
})
