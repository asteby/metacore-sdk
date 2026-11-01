// @vitest-environment happy-dom
//
// Galería de producto (display_config.gallery en la columna de imagen): la
// relación se ve como cuadrícula ordenada por position con la principal
// marcada, sube varias fotos de una vez (una fila por foto, posiciones en
// orden, tamaño medido, alt sugerido con el nombre del padre) y reordena
// persistiendo solo las posiciones que cambiaron. Sin display_config la
// relación sigue siendo la tabla de siempre.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DynamicRelation } from '../dynamic-relation'
import { ApiProvider, type ApiClient } from '../api-context'

vi.mock('../upload-field', async (orig) => {
    const real: any = await orig()
    return { ...real, readImageSize: vi.fn(async () => ({ width: 1200, height: 900 })) }
})

afterEach(cleanup)
beforeEach(() => {
    ROWS = BASE_ROWS.map((r) => ({ ...r }))
})

const col = (c: Record<string, unknown>) => ({ label: c.key, type: 'text', sortable: false, filterable: false, ...c })

function meta(gallery: boolean, mainFromParent = false) {
    return {
        name: 'product_images',
        columns: [
            col({ key: 'id', hidden: true }),
            col({ key: 'product_id', ref: 'products' }),
            col({ key: 'url', label: 'Imagen', cellStyle: 'image_stack', ...(gallery ? { styleConfig: { gallery: true, max_size: 1024, ...(mainFromParent ? { main_from_parent: 'image' } : {}) } } : {}) }),
            col({ key: 'alt', label: 'Texto alternativo', ...(gallery ? { styleConfig: { default_from_parent: 'name' } } : {}) }),
            col({ key: 'width', type: 'number', ...(gallery ? { styleConfig: { derive: 'image_width' } } : {}) }),
            col({ key: 'height', type: 'number', ...(gallery ? { styleConfig: { derive: 'image_height' } } : {}) }),
            col({ key: 'position', type: 'number', sortable: true, ...(gallery ? { styleConfig: { derive: 'next_position' } } : {}) }),
        ],
        actions: [],
        hasActions: false,
        enableCRUDActions: false,
    }
}

let ROWS: Record<string, unknown>[] = []
const BASE_ROWS = [
    { id: 'img_b', product_id: 'p1', url: '/storage/b.png', alt: 'Trasera', position: 1 },
    { id: 'img_a', product_id: 'p1', url: '/storage/a.png', alt: 'Frente', position: 0 },
]

function mockApi(gallery: boolean, mainFromParent = false) {
    let n = 0
    const api = {
        get: vi.fn((url: string) =>
            Promise.resolve({ data: url.startsWith('/metadata/table/') ? { success: true, data: meta(gallery, mainFromParent) } : { success: true, data: ROWS } }),
        ),
        post: vi.fn((url: string, _body?: any, cfg?: any) => {
            if (url === '/upload') {
                cfg?.onUploadProgress?.({ loaded: 5, total: 10 })
                return Promise.resolve({ data: { success: true, data: { url: `/storage/new-${++n}.webp` } } })
            }
            return Promise.resolve({ data: { success: true, data: {} } })
        }),
        put: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
        delete: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
    }
    return api as unknown as ApiClient & typeof api
}

function renderPanel(api: ApiClient, model = 'product_images', parentRecord: Record<string, unknown> = { id: 'p1', name: 'BALATA DISCO' }) {
    return render(
        <ApiProvider client={api}>
            <DynamicRelation
                kind="one_to_many"
                model={model}
                foreignKey="product_id"
                parentId="p1"
                parentRecord={parentRecord}
            />
        </ApiProvider>,
    )
}

const png = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: 'image/png' })

describe('DynamicRelation — galería', () => {
    it('cuadrícula ordenada por position, la primera es la principal', async () => {
        renderPanel(mockApi(true))
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        const tiles = screen.getAllByTestId('gallery-tile')
        expect(tiles[0].querySelector('img')?.getAttribute('alt')).toBe('Frente')
        expect(tiles[0].getAttribute('data-main')).toBe('true')
        expect(tiles[1].getAttribute('data-main')).toBeNull()
        expect(screen.getByText('Principal')).toBeTruthy()
        expect(screen.queryByRole('table')).toBeNull()
    })

    it('galería vacía: la imagen original del producto se muestra como «Principal» de solo lectura', async () => {
        ROWS = []
        renderPanel(mockApi(true, true), 'product_images_lead', { id: 'p1', name: 'BALATA', image: '/storage/original.jpg' })
        const lead = await screen.findByTestId('gallery-lead')
        expect(lead.getAttribute('data-main')).toBe('true')
        expect(lead.querySelector('img')?.getAttribute('src')).toContain('original.jpg')
        expect(within(lead).getByText('Principal')).toBeTruthy()
        expect(within(lead).queryByRole('button')).toBeNull()
    })

    it('con filas en la galería no hay tarjeta extra: la primera de la galería es la principal (como en la tienda)', async () => {
        renderPanel(mockApi(true, true), 'product_images_lead2', { id: 'p1', name: 'BALATA', image: '/storage/original-que-no-esta.jpg' })
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        expect(screen.queryByTestId('gallery-lead')).toBeNull()
        expect(screen.getAllByTestId('gallery-tile')[0].getAttribute('data-main')).toBe('true')
        expect(screen.getByLabelText('Hacer principal')).toBeTruthy()
    })

    it('sin el hint main_from_parent no hay tarjeta de imagen original', async () => {
        ROWS = []
        renderPanel(mockApi(true), 'product_images_lead3', { id: 'p1', name: 'BALATA', image: '/storage/original.jpg' })
        await screen.findByTestId('gallery-dropzone')
        expect(screen.queryByTestId('gallery-lead')).toBeNull()
    })

    it('sube varias fotos: una fila por foto con posición siguiente, tamaño y alt sugerido; rechaza la pesada', async () => {
        const api = mockApi(true)
        renderPanel(api)
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        const input = screen.getByTestId('gallery-input') as HTMLInputElement
        fireEvent.change(input, { target: { files: [png('uno.png'), png('dos.png'), png('pesada.png', 4096)] } })

        await waitFor(() => {
            const creates = api.post.mock.calls.filter((c: any[]) => c[0] === '/data/product_images')
            expect(creates).toHaveLength(2)
        })
        const creates = api.post.mock.calls.filter((c: any[]) => c[0] === '/data/product_images').map((c: any[]) => c[1])
        expect(creates[0]).toMatchObject({ product_id: 'p1', url: '/storage/new-1.webp', alt: 'BALATA DISCO', width: 1200, height: 900, position: 2 })
        expect(creates[1]).toMatchObject({ url: '/storage/new-2.webp', position: 3 })
        expect(api.post.mock.calls.filter((c: any[]) => c[0] === '/upload')).toHaveLength(2)
        expect(await screen.findByText(/pesa más de/)).toBeTruthy()
    })

    it('tras subir renumera 0..n-1 desde el servidor: filas con posición repetida quedan contiguas, la original primero', async () => {
        ROWS = [
            { id: 'n2', product_id: 'p1', url: '/storage/n2.png', alt: 'b', position: 1, created_at: '2026-11-01T12:00:00Z' },
            { id: 'n1', product_id: 'p1', url: '/storage/n1.png', alt: 'a', position: 0, created_at: '2026-11-01T11:00:00Z' },
            { id: 'orig', product_id: 'p1', url: '/storage/o.png', alt: 'o', position: 0, created_at: '2026-10-22T10:00:00Z' },
        ]
        const api = mockApi(true)
        renderPanel(api)
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(3))
        fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [png('x.png')] } })
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
        expect(api.put).toHaveBeenCalledWith('/data/product_images/n1', { position: 1 })
        expect(api.put).toHaveBeenCalledWith('/data/product_images/n2', { position: 2 })
        expect(api.put).not.toHaveBeenCalledWith('/data/product_images/orig', expect.anything())
    })

    it('un PUT fallido al renumerar no detiene a los demás', async () => {
        ROWS = [
            { id: 'c', product_id: 'p1', url: '/storage/c.png', position: 5 },
            { id: 'b', product_id: 'p1', url: '/storage/b.png', position: 3 },
            { id: 'a', product_id: 'p1', url: '/storage/a.png', position: 0 },
        ]
        const api = mockApi(true)
        api.put = vi.fn((url: string) => (url.endsWith('/b') ? Promise.reject(new Error('boom')) : Promise.resolve({ data: { success: true } }))) as any
        renderPanel(api)
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(3))
        fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [png('x.png')] } })
        await waitFor(() => expect(api.put).toHaveBeenCalledWith('/data/product_images/c', { position: 2 }))
        expect(api.put).toHaveBeenCalledWith('/data/product_images/b', { position: 1 })
    })

    it('dos subidas seguidas no repiten posición', async () => {
        ROWS = []
        const api = mockApi(true)
        // El servidor guarda lo que se crea: la renumeración lee filas reales.
        const post = api.post
        api.post = vi.fn((url: string, body?: any, cfg?: any) => {
            if (url === '/data/product_images') ROWS.push({ id: `r${ROWS.length}`, created_at: `2026-11-01T10:0${ROWS.length}:00Z`, ...body })
            return post(url, body, cfg)
        }) as any
        renderPanel(api)
        await screen.findByTestId('gallery-dropzone')
        fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [png('a.png')] } })
        await waitFor(() => expect(api.post.mock.calls.filter((c: any[]) => c[0] === '/data/product_images')).toHaveLength(1))
        fireEvent.change(screen.getByTestId('gallery-input'), { target: { files: [png('b.png')] } })
        await waitFor(() => expect(api.post.mock.calls.filter((c: any[]) => c[0] === '/data/product_images')).toHaveLength(2))
        const pos = api.post.mock.calls.filter((c: any[]) => c[0] === '/data/product_images').map((c: any[]) => c[1].position)
        expect(new Set(pos).size).toBe(2)
    })

    it('la barra de acciones de cada tarjeta envuelve en vez de recortarse', async () => {
        renderPanel(mockApi(true))
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        const second = screen.getAllByTestId('gallery-tile')[1]
        expect(second.querySelector('[data-testid="gallery-tile-actions"]')?.className).toContain('flex-wrap')
        expect(second.className).toContain('min-w-0')
        expect(within(second).getByLabelText('Eliminar foto')).toBeTruthy()
    })

    it('hacer principal persiste solo las posiciones que cambian', async () => {
        const api = mockApi(true)
        renderPanel(api)
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        fireEvent.click(screen.getByLabelText('Hacer principal'))
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
        expect(api.put).toHaveBeenCalledWith('/data/product_images/img_b', { position: 0 })
        expect(api.put).toHaveBeenCalledWith('/data/product_images/img_a', { position: 1 })
    })

    it('una foto sin posición que pasa a principal sí se guarda (null no es 0)', async () => {
        ROWS = [
            { id: 'img_a', product_id: 'p1', url: '/storage/a.png', alt: 'Frente', position: 0 },
            { id: 'img_n', product_id: 'p1', url: '/storage/n.png', alt: 'Vieja', position: null },
        ]
        const api = mockApi(true)
        renderPanel(api)
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        fireEvent.click(screen.getByLabelText('Hacer principal'))
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
        expect(api.put).toHaveBeenCalledWith('/data/product_images/img_n', { position: 0 })
        expect(api.put).toHaveBeenCalledWith('/data/product_images/img_a', { position: 1 })
    })

    it('en frío, tras conocer la metadata, vuelve a pedir ordenado y completo', async () => {
        const api = mockApi(true)
        renderPanel(api, 'product_images_cold')
        await waitFor(() => {
            const lists = api.get.mock.calls.filter((c: any[]) => c[0] === '/data/product_images_cold')
            expect(lists.length).toBe(2)
            expect(lists[1][1].params).toMatchObject({ sortBy: 'position', per_page: 200 })
        })
    })

    it('lista ordenada por position en el servidor una vez conocida la metadata', async () => {
        const api = mockApi(true)
        renderPanel(api)
        await waitFor(() => expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2))
        fireEvent.click(screen.getByLabelText('Hacer principal'))
        await waitFor(() => {
            const lists = api.get.mock.calls.filter((c: any[]) => c[0] === '/data/product_images')
            expect(lists.length).toBeGreaterThan(1)
            expect(lists[lists.length - 1][1].params).toMatchObject({ sortBy: 'position', order: 'asc', per_page: 200 })
        })
    })

    it('sin display_config sigue siendo tabla, «Imagen» es subida y sin «Creado por»', async () => {
        renderPanel(mockApi(false), 'product_images_plain')
        await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
        expect(screen.queryByTestId('gallery-grid')).toBeNull()
        fireEvent.click(screen.getByText('Agregar'))
        await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
        expect(document.querySelector('[data-widget="upload"]')).toBeTruthy()
        expect(screen.queryByText('Creado por')).toBeNull()
    })
})
