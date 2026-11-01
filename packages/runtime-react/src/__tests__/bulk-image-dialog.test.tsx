// @vitest-environment happy-dom
//
// Asistente de carga masiva: aparece solo si el modelo tiene galería; analiza
// archivos SKU[_N].ext contra la API de datos, muestra la vista previa (SKU
// desconocido, duplicado, baja resolución), importa con una fila por foto y
// deshace borrando solo las filas creadas por el lote.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BulkImageImportButton } from '../bulk-image-dialog'
import { ApiProvider, type ApiClient } from '../api-context'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: 'es' },
        t: (k: string, o?: Record<string, unknown>) =>
            String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, n) => String(o?.[n] ?? '')),
    }),
}))

vi.mock('../upload-field', async (orig) => {
    const real: any = await orig()
    return {
        ...real,
        readImageSize: vi.fn(async (f: File) => (f.name.startsWith('LOW') ? { width: 100, height: 100 } : { width: 1200, height: 900 })),
    }
})

afterEach(() => { cleanup(); try { localStorage.clear() } catch { /* */ } })

const col = (c: Record<string, unknown>) => ({ label: c.key, type: 'text', sortable: false, filterable: false, ...c })
const parentMeta = (withRel = true) => ({
    columns: [col({ key: 'id' }), col({ key: 'sku' })],
    relations: withRel ? [{ name: 'images', kind: 'one_to_many', through: 'product_images', foreign_key: 'product_id' }] : [],
})
const childMeta = {
    columns: [
        col({ key: 'product_id' }),
        col({ key: 'url', cellStyle: 'image_stack', styleConfig: { gallery: true } }),
        col({ key: 'position', styleConfig: { derive: 'next_position' } }),
        col({ key: 'width', styleConfig: { derive: 'image_width' } }),
        col({ key: 'height', styleConfig: { derive: 'image_height' } }),
    ],
}

function mockApi(withRel = true) {
    let n = 0
    return {
        get: vi.fn((url: string, cfg?: any) => {
            if (url === '/metadata/table/products') return Promise.resolve({ data: { success: true, data: parentMeta(withRel) } })
            if (url === '/metadata/table/product_images') return Promise.resolve({ data: { success: true, data: childMeta } })
            if (url === '/data/products') {
                return Promise.resolve({ data: { success: true, data: [{ id: 'p1', sku: 'A100', name: 'Balata' }, { id: 'p2', sku: 'B200', name: 'Filtro' }] } })
            }
            if (url === '/data/product_images') return Promise.resolve({ data: { success: true, data: [{ id: 'x', product_id: 'p1', position: 4 }] } })
            return Promise.resolve({ data: { success: true, data: [] } })
        }),
        post: vi.fn((url: string) => {
            if (url === '/upload') return Promise.resolve({ data: { success: true, data: { url: `/storage/f${++n}.jpg` } } })
            return Promise.resolve({ data: { success: true, data: { id: `row${++n}` } } })
        }),
        put: vi.fn(),
        delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
    } as unknown as ApiClient & Record<string, any>
}

const img = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/jpeg' })

function setup(api: ApiClient) {
    return render(<ApiProvider client={api}><BulkImageImportButton model="products" /></ApiProvider>)
}

describe('BulkImageImportButton', { timeout: 30000 }, () => {
    it('no aparece sin galería', async () => {
        const api = mockApi(false)
        setup(api)
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/metadata/table/products'))
        expect(screen.queryByTestId('bulk-image-open')).toBeNull()
    })

    it('vista previa, importar con una fila por foto y deshacer solo ese lote', async () => {
        const api = mockApi()
        setup(api)
        fireEvent.click(await screen.findByTestId('bulk-image-open'))
        const input = await screen.findByTestId('bulk-image-input', {}, { timeout: 15000 })
        fireEvent.change(input, { target: { files: [img('A100.jpg'), img('A100_2.jpg'), img('B200.jpg'), img('NOPE.jpg'), img('LOWB200_9.jpg')] } })

        await waitFor(() => expect(screen.getByTestId('bulk-image-summary')).toBeTruthy())
        const summary = screen.getByTestId('bulk-image-summary').textContent!
        expect(summary).toContain('3 fotos para 2 productos')
        expect(summary).toContain('SKU no encontrado')
        // filtro de SKU por la API de datos existente
        const call = api.get.mock.calls.find((c: any[]) => c[0] === '/data/products')!
        expect(call[1].params['f_sku']).toMatch(/^in:/)

        fireEvent.click(screen.getByTestId('bulk-image-import'))
        await waitFor(() => expect(screen.getByTestId('bulk-image-undo')).toBeTruthy())
        const creates = api.post.mock.calls.filter((c: any[]) => c[0] === '/data/product_images').map((c: any[]) => c[1])
        expect(creates).toHaveLength(3)
        // A100 ya tenía hasta la posición 4: las nuevas van 5 y 6; medidas derivadas
        expect(creates.filter((c: any) => c.product_id === 'p1').map((c: any) => c.position).sort()).toEqual([5, 6])
        expect(creates[0]).toMatchObject({ width: 1200, height: 900 })
        expect(screen.getByTestId('bulk-image-progress').textContent).toContain('3 de 3')

        fireEvent.click(screen.getByTestId('bulk-image-undo'))
        await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(3))
        const deleted = api.delete.mock.calls.map((c: any[]) => c[0])
        expect(deleted.every((u: string) => /^\/data\/product_images\/row\d+$/.test(u))).toBe(true)
    })

    it('un error por archivo no tumba el resto', async () => {
        const api = mockApi()
        let k = 0
        const orig = api.post
        api.post = vi.fn((url: string, body?: any, cfg?: any) => {
            if (url === '/upload' && ++k === 1) return Promise.reject(new Error('boom'))
            return orig(url, body, cfg)
        }) as any
        setup(api)
        fireEvent.click(await screen.findByTestId('bulk-image-open'))
        fireEvent.change(await screen.findByTestId('bulk-image-input', {}, { timeout: 15000 }), { target: { files: [img('A100.jpg'), img('B200.jpg')] } })
        await waitFor(() => screen.getByTestId('bulk-image-import'))
        fireEvent.click(screen.getByTestId('bulk-image-import'))
        await waitFor(() => expect(screen.getByTestId('bulk-image-progress').textContent).toContain('1 con error'))
        const creates = (api.post as any).mock.calls.filter((c: any[]) => c[0] === '/data/product_images')
        expect(creates).toHaveLength(1)
    })
})
