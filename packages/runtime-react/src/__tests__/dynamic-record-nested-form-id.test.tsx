// @vitest-environment happy-dom
//
// Nested create (product modal + "Crear categoría" from the "+" picker) used
// to share id="dynamic-record-form". The inner footer's submit lives outside
// <form> and binds via form={id}, so HTML sent the click to the PARENT form
// — toast "Revisa los campos marcados" with no marks on the category fields.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'

afterEach(cleanup)

function makeI18n() {
    const inst = i18next.createInstance()
    void inst.init({
        lng: 'es',
        fallbackLng: 'es',
        react: { useSuspense: false },
        resources: { es: { translation: {} } },
    })
    return inst
}

const api = {
    get: vi.fn(async () => ({ data: { data: {} } })),
    post: async () => ({ data: { success: true } }),
    put: async () => ({ data: { success: true } }),
    delete: async () => ({ data: { success: true } }),
} as never

function schema(title: string) {
    return {
        title,
        fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true }],
    }
}

describe('DynamicRecordDialog nested create — unique form ids', () => {
    it('gives each open dialog its own form id so Crear does not submit the parent', () => {
        render(
            <I18nextProvider i18n={makeI18n()}>
                <ApiProvider client={api}>
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="create"
                        model="Product"
                        schema={schema('Crear Producto') as never}
                    />
                    <DynamicRecordDialog
                        open
                        onOpenChange={() => {}}
                        mode="create"
                        model="Category"
                        schema={schema('Crear Categoría') as never}
                    />
                </ApiProvider>
            </I18nextProvider>,
        )

        const forms = [...document.querySelectorAll('form')]
        expect(forms).toHaveLength(2)
        const ids = forms.map(f => f.id)
        expect(ids[0]).toBeTruthy()
        expect(ids[1]).toBeTruthy()
        expect(ids[0]).not.toBe(ids[1])
        expect(ids).not.toContain('dynamic-record-form')

        const submits = [...document.querySelectorAll('button[type="submit"]')]
        expect(submits).toHaveLength(2)
        const bound = submits.map(b => b.getAttribute('form'))
        expect(new Set(bound)).toEqual(new Set(ids))
    })
})
