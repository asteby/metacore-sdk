// @vitest-environment happy-dom
//
// DynamicRecordDialog: per-model description / submit label from modal
// metadata (camelCase + snake_case); without them the generic texts remain.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
afterEach(cleanup)

const i18n = (() => {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
})()

const api = {
    get: vi.fn(async () => ({ data: { data: {} } })),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
} as never

const base = { title: 'Clínica', fields: [{ key: 'name', label: 'Nombre', type: 'text' }] }

function renderDialog(mode: 'create' | 'edit' | 'view', extra: Record<string, unknown>) {
    return render(
        <I18nextProvider i18n={i18n}>
            <ApiProvider client={api}>
                <DynamicRecordDialog
                    open
                    onOpenChange={() => {}}
                    mode={mode}
                    model="clinics"
                    recordId={mode === 'create' ? undefined : '1'}
                    initialRecord={mode === 'create' ? undefined : { id: 1, name: 'A' }}
                    schema={{ ...base, ...extra } as never}
                />
            </ApiProvider>
        </I18nextProvider>,
    )
}

describe('DynamicRecordDialog textos por modelo', () => {
    it('create: usa createDescription y createSubmitLabel', async () => {
        renderDialog('create', { createDescription: 'Registra la clínica.', createSubmitLabel: 'Registrar' })
        await waitFor(() => expect(screen.getByText('Registra la clínica.')).toBeTruthy())
        expect(screen.getByRole('button', { name: 'Registrar' })).toBeTruthy()
        expect(screen.queryByText('Completa los campos para crear un nuevo registro.')).toBeNull()
    })

    it('edit y view: formas snake_case', async () => {
        renderDialog('edit', { edit_description: 'Edita la clínica.', edit_submit_label: 'Actualizar clínica' })
        await waitFor(() => expect(screen.getByText('Edita la clínica.')).toBeTruthy())
        expect(screen.getByRole('button', { name: 'Actualizar clínica' })).toBeTruthy()
        cleanup()
        renderDialog('view', { viewDescription: 'Ficha de la clínica.' })
        await waitFor(() => expect(screen.getByText('Ficha de la clínica.')).toBeTruthy())
    })

    it('sin opciones: textos genéricos de siempre', async () => {
        renderDialog('create', {})
        await waitFor(() => expect(screen.getByText('Completa los campos para crear un nuevo registro.')).toBeTruthy())
        expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy()
        cleanup()
        renderDialog('edit', { editDescription: '   ' })
        await waitFor(() => expect(screen.getByText('Modifica los campos y guarda los cambios.')).toBeTruthy())
        expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy()
    })
})

describe('DynamicRecordDialog titulos con singular_label', () => {
    it('edit: "Editar cliente" desde singular_label (no usa el title tecnico)', async () => {
        renderDialog('edit', { title: 'Client', singular_label: 'cliente' })
        await waitFor(() => expect(screen.getByText('Editar cliente')).toBeTruthy())
        expect(screen.queryByText('Editar Client')).toBeNull()
    })
    it('create: "Crear figura" y sin singular_label conserva el comportamiento previo', async () => {
        renderDialog('create', { title: 'Clínica', singular_label: 'figura' })
        await waitFor(() => expect(screen.getByText('Crear figura')).toBeTruthy())
        cleanup()
        renderDialog('create', { title: 'Clínica' })
        await waitFor(() => expect(screen.getByText('Crear Clínica')).toBeTruthy())
    })
    it('el host sobreescribe con models.<model>.singular y los verbos con dynamic.edit_title', async () => {
        i18n.addResourceBundle('es', 'translation', { models: { clinics: { singular: 'sede' } }, dynamic: { edit_title: 'Modificar {{name}}' } }, true, true)
        renderDialog('edit', { title: 'Client', singular_label: 'cliente' })
        await waitFor(() => expect(screen.getByText('Modificar sede')).toBeTruthy())
        i18n.removeResourceBundle('es', 'translation')
        i18n.addResourceBundle('es', 'translation', {})
    })
})
