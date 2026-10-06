// @vitest-environment happy-dom
// Retest r4 Pitsline (06/10, FAC-00014): la factura del wizard se guardó con
// fecha 26/27 sep. `invoice_date` no tenía default: el campo nacía vacío, era
// obligatorio y el calendario abría en octubre con 27–30 sep en la primera fila
// (showOutsideDays). Un campo fecha puede declarar `default: "$today"` y nace
// con el día de HOY en la zona de la org, no la del navegador ni UTC.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const i18n = { language: 'es' }
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    const value = { t, i18n }
    return { useTranslation: () => value }
})

import { buildFieldDefaults, resolveFieldDefault } from '../action-modal-dispatcher'
import { isTodayToken, todayInZone } from '../calendar-date'
import { DocumentFormDialog } from '../document-form-dialog'
import { ApiProvider, type ApiClient } from '../api-context'
import { OrgRuntimeProvider } from '../org-runtime-provider'
import type { ActionFieldDef, DocumentFormsManifest } from '../types'

// 20:00 del 6 de octubre en Ciudad de México = 02:00Z del 7.
const EVENING_MX = new Date('2026-10-07T02:00:00Z')

describe('todayInZone', () => {
    it('es el día de la zona de la org, no el de UTC', () => {
        expect(todayInZone('America/Mexico_City', EVENING_MX)).toBe('2026-10-06')
        expect(todayInZone('UTC', EVENING_MX)).toBe('2026-10-07')
    })

    it('zona inválida → día del navegador (no revienta)', () => {
        expect(todayInZone('Nope/Nowhere', EVENING_MX)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('reconoce $today / today', () => {
        expect(isTodayToken('$today')).toBe(true)
        expect(isTodayToken(' TODAY ')).toBe(true)
        expect(isTodayToken('2026-10-06')).toBe(false)
        expect(isTodayToken(undefined)).toBe(false)
    })
})

describe('buildFieldDefaults con default declarado', () => {
    const ctx = { timeZone: 'America/Mexico_City', now: EVENING_MX }

    it('un campo fecha con default "$today" nace con hoy en la zona de la org', () => {
        const fields = [
            { key: 'invoice_date', label: 'Fecha de emisión', type: 'date', required: true, default: '$today' },
        ] as unknown as ActionFieldDef[]
        expect(buildFieldDefaults(fields, undefined, undefined, ctx)).toEqual({ invoice_date: '2026-10-06' })
    })

    it('lee `default` (manifest) además de `defaultValue` (host)', () => {
        const fields = [
            { key: 'metodo', label: 'Método', type: 'select', default: 'PUE' },
            { key: 'forma', label: 'Forma', type: 'select', defaultValue: '01' },
        ] as unknown as ActionFieldDef[]
        expect(buildFieldDefaults(fields, undefined, undefined, ctx)).toEqual({ metodo: 'PUE', forma: '01' })
    })

    it('un $token desconocido nunca entra a un campo fecha; sin default sigue vacío', () => {
        const unknown = { key: 'd', label: 'D', type: 'date', default: '$yesterday' } as unknown as ActionFieldDef
        expect(resolveFieldDefault(unknown, ctx)).toBeUndefined()
        const fields = [unknown, { key: 'notes', label: 'Notas', type: 'textarea' }] as unknown as ActionFieldDef[]
        expect(buildFieldDefaults(fields, undefined, undefined, ctx)).toEqual({ d: '', notes: '' })
    })

    it('una fecha fija declarada se respeta tal cual', () => {
        const f = { key: 'd', label: 'D', type: 'date', default: '2026-01-01' } as unknown as ActionFieldDef
        expect(resolveFieldDefault(f, ctx)).toBe('2026-01-01')
    })
})

describe('DocumentFormDialog — fecha de emisión por defecto', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(EVENING_MX)
    })
    afterEach(() => {
        vi.useRealTimers()
        cleanup()
    })

    const forms: DocumentFormsManifest = {
        types: [
            {
                key: 'invoice',
                label: 'Factura',
                value: 'I',
                fields: [
                    { key: 'customer_name', label: 'Cliente', type: 'text', required: true },
                    { key: 'invoice_date', label: 'Fecha de emisión', type: 'date', required: true, default: '$today' },
                ] as unknown as ActionFieldDef[],
            },
        ],
    }

    it('sin tocar la fecha, el alta viaja con hoy en la zona de la org', async () => {
        const post = vi.fn().mockResolvedValue({ data: { success: true, data: { id: '1' } } })
        const client = { get: vi.fn().mockResolvedValue({ data: {} }), post, put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <OrgRuntimeProvider timeZone="America/Mexico_City">
                    <DocumentFormDialog open onOpenChange={() => {}} model="invoices" forms={forms} />
                </OrgRuntimeProvider>
            </ApiProvider>,
        )
        fireEvent.change(document.querySelectorAll('input')[0], { target: { value: 'ACME' } })
        fireEvent.click(screen.getByRole('button', { name: 'Crear' }))
        await waitFor(() => expect(post).toHaveBeenCalled())
        expect(post.mock.calls[0][1]).toMatchObject({ customer_name: 'ACME', invoice_date: '2026-10-06' })
    })
})
