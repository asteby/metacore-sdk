// @vitest-environment happy-dom
//
// DynamicRecordDialog: `editPayload: 'declared'`, client-side upload validation
// (`maxSize` / `accept`) for `file` and `image` fields, and `deriveFrom` slugs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog, pickDeclaredFieldValues, slugify } from '../dialogs/dynamic-record'
import { fileMatchesAccept, validateUploadFile } from '../upload-field'
import { ApiProvider } from '../api-context'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const i18n = (() => {
    const inst = i18next.createInstance()
    void inst.init({
        lng: 'es',
        fallbackLng: 'es',
        react: { useSuspense: false },
        resources: { es: { translation: {} } },
    })
    return inst
})()

const post = vi.fn(async (..._a: unknown[]) => ({ data: { data: { url: '/files/x.png' } } }))
const api = {
    get: vi.fn(async () => ({ data: { data: {} } })),
    post,
    put: async () => ({ data: { success: true } }),
    delete: async () => ({ data: { success: true } }),
} as never

beforeEach(() => {
    post.mockClear()
    vi.mocked(toast.error).mockClear()
})
afterEach(() => cleanup())

function renderDialog(schema: Record<string, unknown>, props: Record<string, unknown>) {
    return render(
        <I18nextProvider i18n={i18n}>
            <ApiProvider client={api}>
                <DynamicRecordDialog
                    open
                    onOpenChange={() => {}}
                    model="reviews"
                    schema={{ title: 'Reseña', ...schema } as never}
                    {...(props as object)}
                />
            </ApiProvider>
        </I18nextProvider>,
    )
}

const inputOf = (label: string) => {
    const el = screen.getByText(label).closest('div')?.parentElement?.querySelector('input')
    if (!el) throw new Error(`no input for ${label}`)
    return el as HTMLInputElement
}

const reviewFields = [
    { key: 'rating', label: 'Calificación', type: 'text' },
    { key: 'comment', label: 'Comentario', type: 'text' },
]
const record = { id: 7, rating: '5', comment: 'Bien', user_id: 3, approved: true }

describe('editPayload', () => {
    it("'declared' sends only declared keys and '' for an emptied field", async () => {
        const onUpdate = vi.fn(async () => undefined)
        renderDialog({ fields: reviewFields, editPayload: 'declared' }, {
            mode: 'edit', recordId: '7', onUpdate, initialRecord: record,
        })
        await waitFor(() => expect(screen.getByText('Comentario')).toBeTruthy())
        fireEvent.change(inputOf('Comentario'), { target: { value: '' } })
        fireEvent.click(screen.getByRole('button', { name: /Guardar|Actualizar/ }))
        await waitFor(() => expect(onUpdate).toHaveBeenCalled())
        const [id, payload] = onUpdate.mock.calls[0] as unknown as [string, Record<string, unknown>]
        expect(id).toBe('7')
        expect(payload).toEqual({ rating: '5', comment: '' })
    })

    it("default ('all') behaves as before: every form value", async () => {
        const onUpdate = vi.fn(async () => undefined)
        renderDialog({ fields: reviewFields }, {
            mode: 'edit', recordId: '7', onUpdate, initialRecord: record,
        })
        await waitFor(() => expect(screen.getByText('Comentario')).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: /Guardar|Actualizar/ }))
        await waitFor(() => expect(onUpdate).toHaveBeenCalled())
        const payload = (onUpdate.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(payload).toEqual({ rating: '5', comment: 'Bien' })
    })

    it('pickDeclaredFieldValues drops undeclared keys', () => {
        expect(
            pickDeclaredFieldValues({ a: 1, b: null, extra: 'x' }, [
                { key: 'a', label: 'A', type: 'text' },
                { key: 'b', label: 'B', type: 'text' },
                { key: 'c', label: 'C', type: 'text' },
            ]),
        ).toEqual({ a: 1, b: '', c: '' })
    })
})

describe('upload validation', () => {
    const png = (size: number, type = 'image/png', name = 'a.png') => {
        const f = new File(['x'], name, { type })
        Object.defineProperty(f, 'size', { value: size })
        return f
    }

    it('helpers match accept lists and sizes', () => {
        expect(fileMatchesAccept({ name: 'a.png', type: 'image/png' }, 'image/*')).toBe(true)
        expect(fileMatchesAccept({ name: 'a.pdf', type: 'application/pdf' }, 'image/*,.pdf')).toBe(true)
        expect(fileMatchesAccept({ name: 'a.gif', type: 'image/gif' }, 'image/png')).toBe(false)
        expect(fileMatchesAccept({ name: 'a.gif', type: 'image/gif' }, undefined)).toBe(true)
        expect(validateUploadFile({ name: 'a', type: 'image/png', size: 10 }, { maxSize: 5 })).toBe('size')
    })

    it('image: oversized file is rejected without calling /upload', async () => {
        renderDialog({ fields: [{ key: 'logo', label: 'Logo', type: 'image', maxSize: 1024 }] }, { mode: 'create' })
        await waitFor(() => expect(screen.getByText('Logo')).toBeTruthy())
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [png(5000)] } })
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
        expect(post).not.toHaveBeenCalled()
        expect(toast.error).toHaveBeenCalled()
    })

    it('image: invalid MIME is rejected, also via drop', async () => {
        renderDialog({ fields: [{ key: 'logo', label: 'Logo', type: 'image', accept: 'image/png' }] }, { mode: 'create' })
        await waitFor(() => expect(screen.getByText('Logo')).toBeTruthy())
        const zone = document.querySelector('input[type="file"]')!.parentElement as HTMLElement
        fireEvent.drop(zone, { dataTransfer: { files: [png(10, 'image/gif', 'a.gif')] } })
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
        expect(post).not.toHaveBeenCalled()
    })

    it('image: drop/dragover call preventDefault even with a value or while uploading', async () => {
        renderDialog({ fields: [{ key: 'logo', label: 'Logo', type: 'image' }] }, {
            mode: 'edit', recordId: '1', initialRecord: { id: 1, logo: '/files/a.png' },
        })
        await waitFor(() => expect(screen.getByText('Logo')).toBeTruthy())
        const zone = document.querySelector('input[type="file"]')!.parentElement as HTMLElement
        expect(zone.querySelector('img')).toBeTruthy()
        const over = new Event('dragover', { bubbles: true, cancelable: true })
        zone.dispatchEvent(over)
        expect(over.defaultPrevented).toBe(true)
        const drop = new Event('drop', { bubbles: true, cancelable: true })
        Object.defineProperty(drop, 'dataTransfer', { value: { files: [png(10)] } })
        zone.dispatchEvent(drop)
        expect(drop.defaultPrevented).toBe(true)
        expect(post.mock.calls.some((c) => c[0] === '/upload')).toBe(false)
    })

    it('image: input value is reset after a rejection so the same file can be re-picked', async () => {
        renderDialog({ fields: [{ key: 'logo', label: 'Logo', type: 'image', maxSize: 1024 }] }, { mode: 'create' })
        await waitFor(() => expect(screen.getByText('Logo')).toBeTruthy())
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        const spy = vi.spyOn(input, 'value', 'set')
        fireEvent.change(input, { target: { files: [png(5000)] } })
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
        expect(spy).toHaveBeenCalledWith('')
    })

    it('image: valid file uploads as before; no options = unchanged (accept image/*)', async () => {
        renderDialog({ fields: [{ key: 'logo', label: 'Logo', type: 'image' }] }, { mode: 'create' })
        await waitFor(() => expect(screen.getByText('Logo')).toBeTruthy())
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        expect(input.accept).toBe('image/*')
        fireEvent.change(input, { target: { files: [png(10_000_000)] } })
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
        const call = post.mock.calls[0] as unknown[]
        expect(call[0]).toBe('/upload')
        expect((call[1] as FormData).get('folder')).toBe('reviews')
    })

    it('file: invalid type is rejected without calling /upload; valid uploads', async () => {
        renderDialog({ fields: [{ key: 'doc', label: 'Doc', type: 'file', accept: 'image/png', maxSize: 1024 }] }, { mode: 'create' })
        await waitFor(() => expect(screen.getByText('Doc')).toBeTruthy())
        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [png(10, 'image/gif', 'a.gif')] } })
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
        expect(post).not.toHaveBeenCalled()
        fireEvent.change(input, { target: { files: [png(10)] } })
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    })
})

describe('deriveFrom slug', () => {
    const fields = [
        { key: 'name', label: 'Nombre', type: 'text' },
        { key: 'slug', label: 'Slug', type: 'text', deriveFrom: { field: 'name', transform: 'slug' } },
    ]

    it('slugify', () => {
        expect(slugify('Asociaciones Médicas')).toBe('asociaciones-medicas')
        expect(slugify('  ¡Niños & Niñas! ')).toBe('ninos-ninas')
    })

    it('derives while untouched, stops after a manual edit', async () => {
        renderDialog({ fields }, { mode: 'create' })
        await waitFor(() => expect(screen.getByText('Nombre')).toBeTruthy())
        fireEvent.change(inputOf('Nombre'), { target: { value: 'Asociaciones Médicas' } })
        expect(inputOf('Slug').value).toBe('asociaciones-medicas')
        fireEvent.change(inputOf('Slug'), { target: { value: 'mi-slug' } })
        fireEvent.change(inputOf('Nombre'), { target: { value: 'Otro Nombre' } })
        expect(inputOf('Slug').value).toBe('mi-slug')
    })

    it('edit: an existing slug equal to slugify(name) is NOT overwritten', async () => {
        renderDialog({ fields }, {
            mode: 'edit', recordId: '1', initialRecord: { id: 1, name: 'Mi Nombre', slug: 'mi-nombre' },
        })
        await waitFor(() => expect(inputOf('Nombre').value).toBe('Mi Nombre'))
        fireEvent.change(inputOf('Nombre'), { target: { value: 'Otro Nombre' } })
        expect(inputOf('Slug').value).toBe('mi-nombre')
    })

    it('edit: an empty slug is still derived', async () => {
        renderDialog({ fields }, {
            mode: 'edit', recordId: '1', initialRecord: { id: 1, name: 'Mi Nombre', slug: '' },
        })
        await waitFor(() => expect(inputOf('Nombre').value).toBe('Mi Nombre'))
        fireEvent.change(inputOf('Nombre'), { target: { value: 'Otro Nombre' } })
        expect(inputOf('Slug').value).toBe('otro-nombre')
    })
})
