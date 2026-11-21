// @vitest-environment happy-dom
//
// Seam `record.dialog.header` de DynamicRecordDialog (Loom, RFC 0005): un injerto
// registrado para el modelo propone un parche; el diálogo muestra el diff, aplica,
// deshace; las claves fuera de `writes` se descartan; un injerto que lanza no
// rompe el formulario; las intenciones llegan a quien abrió el diálogo.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'
import { clearLoom, LoomProvider, registerGraft, type GraftProps, type LoomEvent } from '../loom'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
afterEach(() => {
    cleanup()
    clearLoom()
})

const i18n = (() => {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
})()

const api = { get: vi.fn(async () => ({ data: { data: {} } })), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never

const schema = {
    title: 'Cliente',
    fields: [
        { key: 'name', label: 'Nombre', type: 'text' },
        { key: 'tax_id', label: 'RFC', type: 'text' },
        { key: 'postal_code', label: 'Código postal', type: 'text' },
    ],
}

function Reader({ lenses, caps }: GraftProps) {
    const values = lenses.values as Record<string, unknown>
    return (
        <div>
            <span data-testid="lens-keys">{Object.keys(lenses).join(',')}</span>
            <span data-testid="lens-name">{String(values.name ?? '')}</span>
            <button type="button" onClick={() => caps.propose({ patch: { tax_id: 'XAXX010101000', postal_code: '64000', organization_id: 'hack' }, reason: 'Datos de la constancia fiscal' })}>
                Leer constancia
            </button>
            <button type="button" onClick={() => caps.emit('record.select', { record: { id: '9' } })}>
                Usar existente
            </button>
        </div>
    )
}

function renderDialog(extra: Record<string, unknown> = {}, onEvent?: (e: LoomEvent) => void, model = 'Customer') {
    return render(
        <I18nextProvider i18n={i18n}>
            <ApiProvider client={api}>
                <LoomProvider onEvent={onEvent}>
                    <DynamicRecordDialog open onOpenChange={() => {}} mode="create" model={model} schema={schema as never} defaults={{ name: 'Ana' }} {...extra} />
                </LoomProvider>
            </ApiProvider>
        </I18nextProvider>,
    )
}

const csf = () =>
    registerGraft({
        id: 'fiscal_mexico.csf',
        addon: 'fiscal_mexico',
        seam: 'record.dialog.header',
        requires: '^1',
        when: { model: ['Customer'] },
        reads: ['values', 'mode'],
        writes: ['tax_id', 'postal_code'],
        network: 'none',
        component: Reader,
    })

describe('DynamicRecordDialog · seam record.dialog.header', () => {
    it('propuesta con diff → aplicar → deshacer; sólo pasan los writes', async () => {
        csf()
        const events: LoomEvent[] = []
        renderDialog({}, (e) => events.push(e))
        await waitFor(() => expect(screen.getByText('Leer constancia')).toBeTruthy())
        expect(screen.getByTestId('lens-keys').textContent).toBe('values,mode')
        expect(screen.getByTestId('lens-name').textContent).toBe('Ana')

        fireEvent.click(screen.getByText('Leer constancia'))
        const review = await screen.findByRole('region', { name: 'Datos de la constancia fiscal' })
        expect(within(review).getByText('RFC')).toBeTruthy()
        expect(within(review).getByText('XAXX010101000')).toBeTruthy()
        expect(within(review).queryByText('hack')).toBeNull()
        expect(events).toContainEqual(expect.objectContaining({ type: 'proposal_dropped_keys', keys: ['organization_id'] }))
        // Nada se aplica hasta confirmar.
        const taxInput = () => document.querySelector<HTMLInputElement>('input[name="tax_id"], #tax_id') ?? screen.getAllByRole('textbox')[1]
        expect(taxInput().value).toBe('')

        fireEvent.click(within(review).getByRole('button', { name: 'Aplicar' }))
        await waitFor(() => expect(taxInput().value).toBe('XAXX010101000'))
        fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
        await waitFor(() => expect(taxInput().value).toBe(''))
    })

    it('no aparece en otro modelo', async () => {
        csf()
        renderDialog({}, undefined, 'Supplier')
        await waitFor(() => expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy())
        expect(screen.queryByText('Leer constancia')).toBeNull()
    })

    it('un injerto que lanza no rompe el formulario y su error sale redactado', async () => {
        registerGraft({
            id: 'bad.x',
            addon: 'bad',
            seam: 'record.dialog.header',
            reads: ['values'],
            component: () => {
                throw new Error('RFC XAXX010101000 inválido')
            },
        })
        const events: LoomEvent[] = []
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        renderDialog({}, (e) => events.push(e))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy())
        spy.mockRestore()
        const failed = events.find((e) => e.type === 'graft_failed')
        expect(failed).toMatchObject({ graft: 'bad.x', reason: 'render' })
        expect(JSON.stringify(failed)).not.toContain('XAXX')
    })

    it('las intenciones llegan al anfitrión', async () => {
        csf()
        const onIntent = vi.fn(() => true)
        renderDialog({ onIntent })
        fireEvent.click(await screen.findByText('Usar existente'))
        expect(onIntent).toHaveBeenCalledWith('record.select', { record: { id: '9' } })
    })

    it('initialProposal se muestra como diff al abrir', async () => {
        renderDialog({ initialProposal: { patch: { tax_id: 'XEXX010101000', organization_id: 'x' }, reason: 'Constancia' } })
        const review = await screen.findByRole('region', { name: 'Constancia' })
        expect(within(review).getByText('XEXX010101000')).toBeTruthy()
        act(() => fireEvent.click(within(review).getByRole('button', { name: 'Descartar' })))
        expect(screen.queryByRole('region', { name: 'Constancia' })).toBeNull()
    })
})

describe('useRecordPickerDialog · intenciones', () => {
    it('record.select entrega el existente y cierra; record.edit reabre en edición con la propuesta', async () => {
        const { useRecordPickerDialog } = await import('../record-picker-dialog')
        csf()
        const onSelectExisting = vi.fn()
        function Host() {
            const d = useRecordPickerDialog({ model: 'Customer', onSaved: () => {}, onSelectExisting })
            return (
                <>
                    <button type="button" onClick={() => d.openCreate('Ana')}>abrir</button>
                    {d.dialog}
                </>
            )
        }
        const getApi = { get: vi.fn(async () => ({ data: { data: { id: '9', name: 'Ana', tax_id: '' } } })), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never
        render(
            <I18nextProvider i18n={i18n}>
                <ApiProvider client={getApi}>
                    <LoomProvider>
                        <Host />
                    </LoomProvider>
                </ApiProvider>
            </I18nextProvider>,
        )
        fireEvent.click(screen.getByText('abrir'))
        fireEvent.click(await screen.findByText('Usar existente'))
        expect(onSelectExisting).toHaveBeenCalledWith({ id: '9' })
        await waitFor(() => expect(screen.queryByText('Usar existente')).toBeNull())
    })
})

describe('DynamicRecordDialog · seam record.form.section', () => {
    it('monta contenido dentro del modal, después de los campos', async () => {
        registerGraft({
            id: 'fiscal_mexico.csf-section',
            seam: 'record.form.section',
            when: { model: ['Customer'] },
            component: () => <section aria-label="Constancia fiscal">contenido</section>,
        })
        renderDialog()
        const section = await screen.findByRole('region', { name: 'Constancia fiscal' }, { timeout: 5000 })
        const form = document.querySelector('form[data-aby-record-form]')!
        expect(form.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(section.closest('[data-loom-seam="record.form.section"]')).toBeTruthy()
    })
})
