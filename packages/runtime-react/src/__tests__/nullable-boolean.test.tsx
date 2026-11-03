// @vitest-environment happy-dom
//
// Booleanos opcionales con NULL (kernel >= v0.248.4 conserva NULL y Get/List lo
// devuelven). Ejemplo real: `mp_payments.sandbox` usa NULL para «modo
// desconocido». Si el panel convierte ese NULL en `false` al guardar, un pago de
// prueba pasa a parecer real. Cubre:
//   - guardar sin tocar un booleano NULL no envía `false`;
//   - tocarlo sí envía el valor elegido;
//   - el control de tres estados (Sí / No / Sin definir);
//   - celdas y vistas con NULL («—», no «No»);
//   - el filtro booleano con «Sin definir» (`f_<col>=NULL`, OpNull del kernel);
//   - un booleano `required` sigue igual (switch de dos estados, default false).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
const DICT: Record<string, string> = { 'payments.field.sandbox': 'Modo de prueba' }
const I18N = { t: (k: string, o?: { defaultValue?: string }) => DICT[k] ?? o?.defaultValue ?? k, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { DynamicForm } from '../dynamic-form'
import { buildZodSchema } from '../dynamic-form-schema'
import { DynamicRecordDialog, pickDeclaredFieldValues } from '../dialogs/dynamic-record'
import { buildFieldDefaults } from '../action-modal-dispatcher'
import { makeDefaultGetDynamicColumns } from '../dynamic-columns'
import { cardMatchesLaneFunnel } from '../dynamic-kanban'
import { useDynamicFilters } from '../use-dynamic-filters'
import { ApiProvider, type ApiClient } from '../api-context'
import {
    BOOLEAN_UNSET_FILTER_VALUE,
    isNullableBooleanField,
    omitUntouchedNullBooleans,
    usesTriState,
    withBooleanUnsetOption,
} from '../nullable-boolean'
import { TriStateBooleanField } from '../tri-state-boolean'
import { fromTriState, toTriState } from '../tri-state-boolean-impl'
import type { ActionFieldDef, TableMetadata } from '../types'

afterEach(cleanup)

const sandbox: ActionFieldDef = { key: 'sandbox', label: 'Sandbox', type: 'boolean', nullable: true }
const requiredFlag: ActionFieldDef = { key: 'active', label: 'Activo', type: 'boolean', required: true }

const radio = (name: string) => screen.findByRole('radio', { name })

describe('isNullableBooleanField / usesTriState', () => {
    it('opcional admite NULL; required o nullable:false no', () => {
        expect(isNullableBooleanField({ type: 'boolean' })).toBe(true)
        expect(isNullableBooleanField({ type: 'boolean', nullable: true })).toBe(true)
        expect(isNullableBooleanField({ type: 'boolean', required: true })).toBe(false)
        expect(isNullableBooleanField({ type: 'boolean', nullable: false })).toBe(false)
        expect(isNullableBooleanField({ type: 'text' })).toBe(false)
    })
    it('tres estados si el servidor lo declara nullable o el valor original es NULL', () => {
        expect(usesTriState({ type: 'boolean', nullable: true }, false)).toBe(true)
        expect(usesTriState({ type: 'boolean' }, null)).toBe(true)
        // Flag opcional de una acción sin `nullable` ni NULL: switch de siempre.
        expect(usesTriState({ type: 'boolean' }, undefined)).toBe(false)
        expect(usesTriState({ type: 'boolean', required: true }, null)).toBe(false)
    })
    it('toTriState / fromTriState', () => {
        expect([true, false, null, undefined, '', 'true', 'false'].map(toTriState)).toEqual([
            'true', 'false', 'null', 'null', 'null', 'true', 'false',
        ])
        expect([fromTriState('true'), fromTriState('false'), fromTriState('null')]).toEqual([true, false, null])
    })
    it('zod acepta null en el opcional y lo rechaza en el required', () => {
        expect(buildZodSchema([sandbox]).safeParse({ sandbox: null }).success).toBe(true)
        expect(buildZodSchema([requiredFlag]).safeParse({ active: null }).success).toBe(false)
    })
})

describe('TriStateBooleanField', () => {
    it('radiogroup accesible: NULL marca «Sin definir» y cada opción emite su valor', async () => {
        const onChange = vi.fn()
        render(<TriStateBooleanField value={null} onChange={onChange} label="Sandbox" />)
        expect(await screen.findByRole('radiogroup', { name: 'Sandbox' })).toBeTruthy()
        expect((await radio('Sin definir')).getAttribute('aria-checked')).toBe('true')
        expect((await radio('No')).getAttribute('aria-checked')).toBe('false')
        fireEvent.click(await radio('Sí'))
        fireEvent.click(await radio('No'))
        fireEvent.click(await radio('Sin definir'))
        expect(onChange.mock.calls).toEqual([[true], [false], [null]])
    })
    it('flechas mueven y seleccionan', async () => {
        const onChange = vi.fn()
        render(<TriStateBooleanField value={false} onChange={onChange} label="Sandbox" />)
        fireEvent.keyDown(await radio('No'), { key: 'ArrowRight' })
        expect(onChange).toHaveBeenLastCalledWith(null)
    })
})

describe('DynamicForm — booleano NULL', () => {
    it('guardar sin tocarlo NO envía false (la llave no viaja)', async () => {
        const onSubmit = vi.fn()
        render(
            <DynamicForm
                fields={[{ key: 'ref', label: 'Ref', type: 'text' }, sandbox]}
                initialValues={{ id: 'p1', ref: 'MP-1', sandbox: null }}
                onSubmit={onSubmit}
            />,
        )
        expect((await radio('Sin definir')).getAttribute('aria-checked')).toBe('true')
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit).toHaveBeenCalledTimes(1)
        const payload = onSubmit.mock.calls[0][0]
        expect(payload).not.toHaveProperty('sandbox')
        expect(payload.ref).toBe('MP-1')
    })

    it('tocarlo sí lo envía', async () => {
        const onSubmit = vi.fn()
        render(<DynamicForm fields={[sandbox]} initialValues={{ id: 'p1', sandbox: null }} onSubmit={onSubmit} />)
        fireEvent.click(await radio('No'))
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit.mock.calls[0][0]).toEqual({ sandbox: false })
    })

    it('volver a «Sin definir» envía null', async () => {
        const onSubmit = vi.fn()
        render(<DynamicForm fields={[sandbox]} initialValues={{ id: 'p1', sandbox: true }} onSubmit={onSubmit} />)
        fireEvent.click(await radio('Sin definir'))
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit.mock.calls[0][0]).toEqual({ sandbox: null })
    })

    it('required: switch de dos estados y el NULL legado sigue cayendo a false (sin cambio)', async () => {
        const onSubmit = vi.fn()
        render(<DynamicForm fields={[requiredFlag]} initialValues={{ id: 'p1', active: null }} onSubmit={onSubmit} />)
        expect(screen.getByRole('switch')).toBeTruthy()
        expect(screen.queryByRole('radiogroup')).toBeNull()
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit.mock.calls[0][0]).toEqual({ active: false })
    })

    it('alta: el default del manifest no cambia', async () => {
        const onSubmit = vi.fn()
        render(
            <DynamicForm
                fields={[{ ...sandbox, defaultValue: true }, { key: 'flag', label: 'Flag', type: 'boolean' }]}
                onSubmit={onSubmit}
            />,
        )
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit.mock.calls[0][0]).toEqual({ sandbox: true, flag: false })
    })
})

const api = (put = vi.fn(async () => ({ data: { success: true } }))) =>
    ({
        get: vi.fn(async () => ({ data: { data: {} } })),
        post: vi.fn(async () => ({ data: { success: true } })),
        put,
        delete: vi.fn(async () => ({ data: { success: true } })),
    }) as unknown as ApiClient

function renderRecord(fields: unknown[], record: Record<string, unknown>, onUpdate: (...a: unknown[]) => unknown) {
    return render(
        <ApiProvider client={api()}>
            <DynamicRecordDialog
                open
                onOpenChange={() => {}}
                model="mp_payments"
                mode="edit"
                recordId={String(record.id)}
                initialRecord={record}
                onUpdate={onUpdate as never}
                schema={{ title: 'Pago', fields } as never}
            />
        </ApiProvider>,
    )
}

describe('DynamicRecordDialog (CRUD) — booleano NULL', () => {
    const fields = [
        { key: 'reference', label: 'Referencia', type: 'text' },
        { key: 'sandbox', label: 'Sandbox', type: 'boolean', nullable: true },
    ]
    const record = { id: 9, reference: 'MP-9', sandbox: null }

    it('guardar sin tocarlo omite la llave (nunca false, "" ni "null")', async () => {
        const onUpdate = vi.fn(async () => undefined)
        renderRecord(fields, record, onUpdate)
        expect((await radio('Sin definir')).getAttribute('aria-checked')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: /Guardar|Actualizar/ }))
        await waitFor(() => expect(onUpdate).toHaveBeenCalled())
        const payload = (onUpdate.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(payload).not.toHaveProperty('sandbox')
        expect(payload.reference).toBe('MP-9')
    })

    it('elegir «Sin definir» sobre un valor guardado envía null JSON', async () => {
        const onUpdate = vi.fn(async () => undefined)
        renderRecord(fields, { ...record, sandbox: true }, onUpdate)
        fireEvent.click(await radio('Sin definir'))
        fireEvent.click(screen.getByRole('button', { name: /Guardar|Actualizar/ }))
        await waitFor(() => expect(onUpdate).toHaveBeenCalled())
        const payload = (onUpdate.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(payload).toHaveProperty('sandbox', null)
        expect(JSON.stringify(payload)).toContain('"sandbox":null')
    })

    it('tocarlo envía el valor elegido', async () => {
        const onUpdate = vi.fn(async () => undefined)
        renderRecord(fields, record, onUpdate)
        fireEvent.click(await radio('Sí'))
        fireEvent.click(screen.getByRole('button', { name: /Guardar|Actualizar/ }))
        await waitFor(() => expect(onUpdate).toHaveBeenCalled())
        const payload = (onUpdate.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(payload.sandbox).toBe(true)
    })

    it('required: switch de dos estados, sin control de tres estados', async () => {
        const onUpdate = vi.fn(async () => undefined)
        renderRecord(
            [{ key: 'active', label: 'Activo', type: 'boolean', required: true }],
            { id: 3, active: true },
            onUpdate,
        )
        await waitFor(() => expect(screen.getByRole('switch')).toBeTruthy())
        expect(screen.queryByRole('radiogroup')).toBeNull()
    })

    it("editPayload 'declared' conserva null en el booleano opcional (no '')", () => {
        expect(
            pickDeclaredFieldValues({ sandbox: null, note: null }, [
                { key: 'sandbox', label: 'S', type: 'boolean', nullable: true },
                { key: 'note', label: 'N', type: 'text' },
            ]),
        ).toEqual({ sandbox: null, note: '' })
    })

    it('vista: NULL se pinta «—», no «No»', async () => {
        render(
            <ApiProvider client={api()}>
                <DynamicRecordDialog
                    open
                    onOpenChange={() => {}}
                    model="mp_payments"
                    mode="view"
                    recordId="9"
                    initialRecord={record}
                    schema={{ title: 'Pago', fields } as never}
                />
            </ApiProvider>,
        )
        const mark = await screen.findByLabelText('Sin definir')
        expect(mark.textContent).toBe('—')
        expect(screen.queryByText('No')).toBeNull()
    })
})

describe('omitUntouchedNullBooleans (contrato del payload)', () => {
    const fs = [
        { key: 'sandbox', type: 'boolean' },
        { key: 'active', type: 'boolean', required: true },
        { key: 'note', type: 'text' },
    ]
    it('omite el NULL no tocado; deja true/false, el null elegido y los no booleanos', () => {
        const orig: Record<string, unknown> = { sandbox: null, active: true, note: null }
        expect(omitUntouchedNullBooleans({ sandbox: null, active: true, note: null }, fs, (k) => orig[k])).toEqual({
            active: true,
            note: null,
        })
        expect(omitUntouchedNullBooleans({ sandbox: false }, fs, (k) => orig[k])).toEqual({ sandbox: false })
        expect(omitUntouchedNullBooleans({ sandbox: null }, fs, () => true)).toEqual({ sandbox: null })
    })
})

describe('modales de acción — buildFieldDefaults', () => {
    it('booleano opcional NULL en el registro se siembra null; required y alta sin cambio', () => {
        const fields: ActionFieldDef[] = [
            { key: 'sandbox', label: 'S', type: 'boolean' },
            { key: 'active', label: 'A', type: 'boolean', required: true },
            { key: 'notify', label: 'N', type: 'boolean' },
        ]
        expect(buildFieldDefaults(fields, { id: 1, sandbox: null, active: null })).toEqual({
            sandbox: null,
            active: false,
            notify: false,
        })
        // Alta (sin registro): el default del manifest manda.
        expect(buildFieldDefaults([{ ...fields[0], defaultValue: true }, fields[1]], undefined)).toEqual({
            sandbox: true,
            active: false,
        })
    })
})

function renderBoolCell(value: unknown) {
    const meta = {
        title: 't',
        endpoint: '/x',
        columns: [{ key: 'sandbox', label: 'Sandbox', type: 'boolean' }],
        actions: [],
        perPageOptions: [10],
        defaultPerPage: 10,
        searchPlaceholder: '',
        enableCRUDActions: false,
        hasActions: false,
    } as unknown as TableMetadata
    const cols = makeDefaultGetDynamicColumns({ getImageUrl: (p: string) => p })(meta, undefined, undefined, 'es')
    const c = cols.find((x) => (x as { accessorKey?: string }).accessorKey === 'sandbox' || x.id === 'sandbox')
    if (!c || typeof c.cell !== 'function') throw new Error('columna no encontrada')
    const row = { sandbox: value }
    const node = (c.cell as (ctx: unknown) => React.ReactNode)({ row: { original: row }, getValue: () => value })
    return render(<>{node}</>).container
}

describe('celda booleana', () => {
    it('NULL pinta «—» (Sin definir), no «No»', () => {
        const el = renderBoolCell(null)
        expect(el.textContent).toBe('—')
        expect(el.querySelector('[aria-label="Sin definir"]')).toBeTruthy()
    })
    it('false sigue siendo «No» y true «Sí»', () => {
        expect(renderBoolCell(false).textContent).toContain('No')
        cleanup()
        expect(renderBoolCell(true).textContent).toContain('Sí')
    })
})

describe('filtro booleano con NULL', () => {
    it('withBooleanUnsetOption agrega «Sin definir» una sola vez y no inventa opciones', () => {
        const yesNo = [
            { value: 'true', label: 'Sí' },
            { value: 'false', label: 'No' },
        ]
        const out = withBooleanUnsetOption(yesNo, 'Sin definir')
        expect(out.map((o) => o.value)).toEqual(['true', 'false', BOOLEAN_UNSET_FILTER_VALUE])
        expect(withBooleanUnsetOption(out, 'Sin definir')).toHaveLength(3)
        expect(withBooleanUnsetOption([], 'Sin definir')).toEqual([])
    })

    it('el filtro ofrece Sí / No / Sin definir y «Sin definir» viaja como f_<col>=NULL', async () => {
        const metadata = {
            title: 'Pagos',
            endpoint: '/data/mp_payments',
            columns: [{ key: 'sandbox', label: 'Sandbox', type: 'boolean', filterable: true }],
            filters: [
                {
                    key: 'sandbox',
                    label: 'Sandbox',
                    type: 'boolean',
                    options: [
                        { value: 'true', label: 'Sí' },
                        { value: 'false', label: 'No' },
                    ],
                },
            ],
            actions: [],
            perPageOptions: [10],
            defaultPerPage: 10,
            searchPlaceholder: '',
            enableCRUDActions: false,
            hasActions: false,
        } as unknown as TableMetadata
        const { result } = renderHook(() => useDynamicFilters(metadata, { model: 'mp_payments' }), {
            wrapper: ({ children }) => <ApiProvider client={api()}>{children}</ApiProvider>,
        })
        const cfg = result.current.columnFilterConfigs.get('sandbox')
        expect(cfg?.options?.map((o) => [o.value, o.label])).toEqual([
            ['true', 'Sí'],
            ['false', 'No'],
            ['NULL', 'Sin definir'],
        ])
        act(() => result.current.handleDynamicFilterChange('sandbox', ['NULL']))
        expect(result.current.filterParams.f_sandbox).toBe('NULL')
        // «No» sigue siendo `= false`: excluye NULL a propósito (opción aparte).
        act(() => result.current.handleDynamicFilterChange('sandbox', ['false']))
        expect(result.current.filterParams.f_sandbox).toBe('false')
    })
})

describe('carril del kanban con NULL', () => {
    it('«Sin definir» (NULL) casa con null/undefined; No sigue siendo false', () => {
        const f = { field: 'sandbox', values: ['NULL'] }
        expect(cardMatchesLaneFunnel({ sandbox: null }, f)).toBe(true)
        expect(cardMatchesLaneFunnel({}, f)).toBe(true)
        expect(cardMatchesLaneFunnel({ sandbox: false }, f)).toBe(false)
        expect(cardMatchesLaneFunnel({ sandbox: null }, { field: 'sandbox', values: ['false'] })).toBe(false)
        expect(cardMatchesLaneFunnel({ sandbox: false }, { field: 'sandbox', values: ['false'] })).toBe(true)
    })
})

describe('accesibilidad del control de tres estados', () => {
    it('CRUD: el radiogroup toma la etiqueta traducida por aria-labelledby', async () => {
        renderRecord(
            [{ key: 'sandbox', label: 'payments.field.sandbox', type: 'boolean', nullable: true }],
            { id: 9, sandbox: null },
            vi.fn(),
        )
        const group = await screen.findByRole('radiogroup', { name: 'Modo de prueba' })
        const labelId = group.getAttribute('aria-labelledby')
        expect(labelId).toBe('sandbox-label')
        expect(document.getElementById(labelId!)?.textContent).toContain('Modo de prueba')
    })

    it('DynamicForm: el <Label> visible nombra al radiogroup', async () => {
        render(<DynamicForm fields={[sandbox]} initialValues={{ id: 'p1', sandbox: null }} onSubmit={vi.fn()} />)
        const group = await screen.findByRole('radiogroup', { name: 'Sandbox' })
        expect(group.getAttribute('aria-labelledby')).toBe('sandbox-label')
    })

    it('sin <label> (celda de renglón): aria-label traducido', async () => {
        render(<TriStateBooleanField value={null} onChange={vi.fn()} label="payments.field.sandbox" />)
        expect(await screen.findByRole('radiogroup', { name: 'Modo de prueba' })).toBeTruthy()
    })
})
