import { afterEach, describe, expect, it, vi } from 'vitest'
import { allocatePayment, validateAllocation, type OpenDocument } from '../primitives/allocation'
import { bucketFor, computeAging, daysOverdue } from '../primitives/aging'
import {
    __resetContributions,
    contributionsVersion,
    federatedModalComponent,
    registerDocumentContribution,
    registerFederatedModal,
    resolveContributions,
    resolveFederatedModal,
    slotIdFor,
    subscribeContributions,
} from '../primitives/contributions'
import { approvalsClient, groupApprovals, parseJSONField, registerApprovalCategory, type ApprovalRequestDTO } from '../primitives/approvals'
import { CORE_DOCUMENT_KINDS, getDocumentKind, listDocumentKinds, registerDocumentKind } from '../primitives/document-kinds'
import { blockingChecks } from '../primitives/panels'
import { installedPredicate } from '../primitives/use-contributions'
import { slotRegistry } from '../slot'
import type { ApiClient } from '../api-context'

// Datos del mockup complemento-pago.html (Transportes del Bajío).
const docs: OpenDocument[] = [
    { id: 'a1060', number: 'A-1060', issued_at: '2026-09-10', due_at: '2026-10-10', total: 42270.4, balance: 42270.4, currency: 'MXN', payment_method: 'PPD' },
    { id: 'a1051', number: 'A-1051', issued_at: '2026-08-15', due_at: '2026-09-14', total: 18560, balance: 8500, currency: 'MXN', payment_method: 'PPD', installments_paid: 1 },
    { id: 'a1066', number: 'A-1066', issued_at: '2026-09-28', due_at: '2026-10-28', total: 23260, balance: 23260, currency: 'MXN', payment_method: 'PPD' },
]

describe('allocatePayment', () => {
    it('aplica primero lo más vencido y calcula parcialidad e insoluto', () => {
        const r = allocatePayment(30000, docs)
        expect(r.allocations).toEqual([
            { document_id: 'a1051', amount: 8500, balance_before: 8500, balance_after: 0, installment: 2 },
            { document_id: 'a1060', amount: 21500, balance_before: 42270.4, balance_after: 20770.4, installment: 1 },
        ])
        expect(r.unapplied).toBe(0)
    })
    it('manual respeta montos y deja sin aplicar el resto', () => {
        const r = allocatePayment(10000, docs, 'manual', { a1066: 4000 })
        expect(r.applied).toBe(4000)
        expect(r.unapplied).toBe(6000)
        expect(validateAllocation(10000, 'MXN', docs, r.allocations).map(i => i.code)).toEqual(['unapplied'])
        expect(validateAllocation(10000, 'MXN', docs, r.allocations, { allowUnapplied: true })[0].severity).toBe('warning')
    })
    it('detecta pago mayor al saldo y moneda distinta', () => {
        const codes = validateAllocation(9000, 'USD', docs, [{ document_id: 'a1051', amount: 9000, balance_before: 8500, balance_after: -500, installment: 2 }]).map(i => i.code)
        expect(codes).toContain('over_balance')
        expect(codes).toContain('currency_mismatch')
    })
})

describe('computeAging', () => {
    it('tramos y vencido por cliente al corte', () => {
        expect(daysOverdue('2026-09-14', '2026-10-05')).toBe(21)
        const { rows, totals, total } = computeAging(docs.map(d => ({ party_id: 'tba', due_at: d.due_at ?? null, issued_at: d.issued_at, balance: d.balance })), '2026-10-05')
        expect(totals.current).toBe(65530.4)
        expect(totals.d1_30).toBe(8500)
        expect(total).toBe(74030.4)
        expect(rows[0].oldest_overdue_days).toBe(21)
    })
})

describe('contribuciones federadas', () => {
    afterEach(() => __resetContributions())
    const ctx = { kind: 'invoice', model: 'customers.Invoice', values: {}, mode: 'create' as const }
    it('se ocultan si el addon no está instalado y se ordenan por prioridad', () => {
        const Comp = () => null
        registerDocumentContribution({ id: 'fiscal_mexico.header.cfdi', kinds: ['invoice', 'credit_note'], region: 'header.fields', requiresAddon: 'fiscal_mexico', priority: 10, component: Comp })
        registerDocumentContribution({ id: 'inventory.header.warehouse', kinds: '*', region: 'header.fields', requiresAddon: 'inventory', component: Comp })
        expect(resolveContributions(ctx, 'header.fields', a => a === 'inventory').map(c => c.id)).toEqual(['inventory.header.warehouse'])
        expect(resolveContributions(ctx, 'header.fields', () => true).map(c => c.id)).toEqual(['fiscal_mexico.header.cfdi', 'inventory.header.warehouse'])
    })
    it('el disposer la quita (desinstalación en caliente)', () => {
        const off = registerDocumentContribution({ id: 'x', kinds: '*', region: 'side.panels', component: () => null })
        off()
        expect(resolveContributions(ctx, 'side.panels', () => true)).toEqual([])
    })
    it('modal federado sin addon → null (el dispatcher usa el formulario genérico)', () => {
        registerFederatedModal({ key: 'fiscal_mexico.import_cfdi', addon: 'fiscal_mexico', load: async () => ({ default: () => null }) })
        expect(resolveFederatedModal('fiscal_mexico.import_cfdi', () => false)).toBeNull()
        expect(resolveFederatedModal('fiscal_mexico.import_cfdi', () => true)?.addon).toBe('fiscal_mexico')
    })
})

describe('groupApprovals', () => {
    it('agrupa por categoría registrada por cada addon', () => {
        const off = registerApprovalCategory({ key: 'cfdi', label: 'Cancelación CFDI', match: r => r.action_key === 'cancel_fiscal' })
        const base = { kind: 'action', status: 'pending' } as ApprovalRequestDTO
        const g = groupApprovals([{ ...base, id: '1', action_key: 'cancel_fiscal' }, { ...base, id: '2', action_key: 'approve_adjustment' }])
        expect(Object.keys(g).sort()).toEqual(['cfdi', 'other'])
        off()
    })
})

describe('allocatePayment (estrategias y bordes)', () => {
    it('oldest_issued_first ordena por emisión', () => {
        const r = allocatePayment(50000, docs, 'oldest_issued_first')
        expect(r.allocations.map(a => a.document_id)).toEqual(['a1051', 'a1060'])
    })
    it('monto negativo o cero no aplica nada y validateAllocation lo marca', () => {
        expect(allocatePayment(-5, docs)).toEqual({ allocations: [], applied: 0, unapplied: 0 })
        expect(validateAllocation(0, 'MXN', docs, []).map(i => i.code)).toContain('non_positive')
    })
    it('pago mayor a todos los saldos deja el excedente sin aplicar', () => {
        const r = allocatePayment(100000, docs)
        expect(r.applied).toBe(74030.4)
        expect(r.unapplied).toBe(25969.6)
    })
})

describe('bucketFor', () => {
    it('ubica los bordes de cada tramo', () => {
        expect(bucketFor(-3)).toBe('current')
        expect(bucketFor(0)).toBe('current')
        expect(bucketFor(30)).toBe('d1_30')
        expect(bucketFor(31)).toBe('d31_60')
        expect(bucketFor(400)).toBe('d90_plus')
    })
})

describe('contribuciones federadas (registro)', () => {
    afterEach(() => __resetContributions())
    const ctx = { kind: 'invoice', model: 'customers.Invoice', values: { total: 10 }, mode: 'edit' as const }

    it('publica en slotRegistry por kind/region y el disposer la retira', () => {
        const off = registerDocumentContribution({ id: 'a.body.x', kinds: ['invoice', 'quote'], region: 'body.sections', component: () => null })
        expect(slotRegistry.get(slotIdFor('invoice', 'body.sections'))).toHaveLength(1)
        expect(slotRegistry.get(slotIdFor('quote', 'body.sections'))).toHaveLength(1)
        off()
        off() // idempotente
        expect(slotRegistry.get(slotIdFor('invoice', 'body.sections'))).toHaveLength(0)
    })

    it('re-registrar el mismo id reemplaza; el disposer viejo no borra el nuevo', () => {
        const offOld = registerDocumentContribution({ id: 'a.side.p', kinds: '*', region: 'side.panels', priority: 1, component: () => null })
        registerDocumentContribution({ id: 'a.side.p', kinds: '*', region: 'side.panels', priority: 5, component: () => null })
        expect(slotRegistry.get(slotIdFor('*', 'side.panels'))).toHaveLength(1)
        offOld()
        expect(resolveContributions(ctx, 'side.panels', () => true).map(c => c.priority)).toEqual([5])
    })

    it('filtra por `when` y por kind; con `load` siempre expone un componente', () => {
        registerDocumentContribution({ id: 'a.h.only_edit', kinds: ['invoice'], region: 'header.fields', when: c => c.mode === 'edit', load: async () => ({ default: () => null }) })
        registerDocumentContribution({ id: 'a.h.quote', kinds: ['quote'], region: 'header.fields', component: () => null })
        const [only] = resolveContributions(ctx, 'header.fields', () => true)
        expect(only.id).toBe('a.h.only_edit')
        expect(typeof only.component).toBe('function')
        expect(resolveContributions({ ...ctx, mode: 'create' }, 'header.fields', () => true)).toEqual([])
    })

    it('exige component o load', () => {
        expect(() => registerDocumentContribution({ id: 'bad', kinds: '*', region: 'side.panels' })).toThrow(/component o load/)
    })

    it('notifica a los suscriptores en register/dispose', () => {
        const spy = vi.fn()
        const unsub = subscribeContributions(spy)
        const v0 = contributionsVersion()
        const off = registerDocumentContribution({ id: 'n', kinds: '*', region: 'side.panels', component: () => null })
        off()
        expect(spy).toHaveBeenCalledTimes(2)
        expect(contributionsVersion()).toBe(v0 + 2)
        unsub()
    })

    it('modal federado: no registrado → null; disposer lo retira; componente memoizado', () => {
        expect(resolveFederatedModal('returns.settle_method', () => true)).toBeNull()
        const m = { key: 'returns.settle_method', addon: 'returns', load: async () => ({ default: () => null }) }
        const off = registerFederatedModal(m)
        expect(resolveFederatedModal('returns.settle_method', () => true)).toBe(m)
        expect(federatedModalComponent(m)).toBe(federatedModalComponent(m))
        off()
        expect(resolveFederatedModal('returns.settle_method', () => true)).toBeNull()
    })

    it('installedPredicate: sin provider = instalado; con provider consulta el set', () => {
        expect(installedPredicate(null)('lo_que_sea')).toBe(true)
        const p = installedPredicate({ addons: new Set(['customers']), capabilities: new Set() })
        expect(p('customers')).toBe(true)
        expect(p('fiscal_mexico')).toBe(false)
    })
})

describe('tipos de documento', () => {
    it('registerDocumentKind con disposer y filtrado por addon instalado', () => {
        const offs = CORE_DOCUMENT_KINDS.map(registerDocumentKind)
        expect(getDocumentKind('invoice')?.model).toBe('customers.Invoice')
        expect(listDocumentKinds(a => a === 'purchases').map(k => k.key)).toEqual(['purchase_order', 'supplier_invoice', 'supplier_payment'])
        offs.forEach(off => off())
        expect(getDocumentKind('invoice')).toBeUndefined()
    })
})

describe('paneles', () => {
    it('blockingChecks: solo errores sin política de autorización', () => {
        const checks = [
            { key: 'a', severity: 'error' as const, message: 'Falta RFC' },
            { key: 'b', severity: 'error' as const, message: 'Sin crédito', approval_policy: 'credit_override' },
            { key: 'c', severity: 'warning' as const, message: 'Sin correo' },
        ]
        expect(blockingChecks(checks).map(c => c.key)).toEqual(['a'])
    })
})

describe('approvalsClient', () => {
    it('arma la consulta y lee lista y conteo', async () => {
        const get = vi.fn(async (url: string) =>
            url.startsWith('/approvals/count') ? { data: { data: { count: 3 } } } : { data: { data: [{ id: '1' }], meta: { total: 1 } } },
        )
        const post = vi.fn(async () => ({ data: {} }))
        const c = approvalsClient({ get, post } as unknown as ApiClient)
        expect(await c.list({ status: 'pending', for_me: true, model: undefined })).toEqual({ items: [{ id: '1' }], total: 1 })
        expect(get).toHaveBeenCalledWith('/approvals?status=pending&for_me=true')
        expect(await c.count()).toBe(3)
        await c.reject('9', 'No procede')
        expect(post).toHaveBeenCalledWith('/approvals/9/reject', { reason: 'No procede' })
    })
    it('parseJSONField tolera string, objeto y basura', () => {
        expect(parseJSONField('{"a":1}')).toEqual({ a: 1 })
        expect(parseJSONField({ a: 2 })).toEqual({ a: 2 })
        expect(parseJSONField('no-json')).toBeNull()
        expect(parseJSONField('')).toBeNull()
    })
})
