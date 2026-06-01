import { describe, it, expect } from 'vitest'
import {
    computeLineItemTotals,
    evaluateBalance,
    getBalanceRule,
} from '../dynamic-form-schema'
import type { ActionFieldDef } from '../types'

// A journal-entry-style line-items field: debit/credit columns flagged for
// summation, reconciled by a balance rule. The functions are domain-agnostic;
// this just exercises the canonical use case.
const journalField = (overrides: Partial<ActionFieldDef> = {}): ActionFieldDef => ({
    key: 'journal_entry_lines',
    label: 'Renglones',
    type: 'array',
    required: true,
    itemFields: [
        { key: 'account_id', label: 'Cuenta', type: 'dynamic_select', ref: 'Account', required: true },
        { key: 'description', label: 'Descripción', type: 'string' },
        { key: 'debit', label: 'Débito', type: 'number', total: true },
        { key: 'credit', label: 'Crédito', type: 'number', total: true },
    ],
    balance: { debit_column: 'debit', credit_column: 'credit' },
    ...overrides,
})

describe('computeLineItemTotals', () => {
    it('suma solo las columnas marcadas con total', () => {
        const rows = [
            { account_id: 'a', debit: '100', credit: '' },
            { account_id: 'b', debit: '50.50', credit: '' },
            { account_id: 'c', debit: '', credit: '150.50' },
        ]
        const totals = computeLineItemTotals(journalField(), rows)
        expect(totals).toEqual({ debit: 150.5, credit: 150.5 })
    })

    it('trata blancos y basura como 0 y redondea a centavos', () => {
        const rows = [
            { debit: '0.1', credit: '' },
            { debit: '0.2', credit: 'abc' },
        ]
        const totals = computeLineItemTotals(journalField(), rows)
        expect(totals.debit).toBe(0.3) // sin float drift (0.30000000000000004)
        expect(totals.credit).toBe(0)
    })

    it('devuelve {} cuando ninguna columna está marcada', () => {
        const field = journalField({
            itemFields: [{ key: 'x', label: 'X', type: 'number' }],
        })
        expect(computeLineItemTotals(field, [{ x: '5' }])).toEqual({})
    })
})

describe('getBalanceRule', () => {
    it('normaliza snake_case del kernel a camelCase', () => {
        const rule = getBalanceRule(journalField())
        expect(rule).toEqual({
            debitColumn: 'debit',
            creditColumn: 'credit',
            message: undefined,
            requireNonzero: true,
        })
    })

    it('respeta camelCase explícito y require_nonzero=false', () => {
        const rule = getBalanceRule(
            journalField({ balance: { debitColumn: 'd', creditColumn: 'c', require_nonzero: false } }),
        )
        expect(rule?.debitColumn).toBe('d')
        expect(rule?.requireNonzero).toBe(false)
    })

    it('devuelve undefined sin regla', () => {
        expect(getBalanceRule(journalField({ balance: undefined }))).toBeUndefined()
    })
})

describe('evaluateBalance', () => {
    it('marca balanced cuando Σdébito == Σcrédito y > 0', () => {
        const rows = [
            { debit: '100', credit: '' },
            { debit: '', credit: '100' },
        ]
        const state = evaluateBalance(journalField(), rows)
        expect(state).toMatchObject({ debit: 100, credit: 100, diff: 0, balanced: true })
    })

    it('marca unbalanced con descuadre y reporta el diff', () => {
        const rows = [
            { debit: '100', credit: '' },
            { debit: '', credit: '70' },
        ]
        const state = evaluateBalance(journalField(), rows)
        expect(state?.balanced).toBe(false)
        expect(state?.diff).toBe(-30) // credit - debit
    })

    it('un asiento todo en cero NO está cuadrado (require_nonzero por defecto)', () => {
        const state = evaluateBalance(journalField(), [{ debit: '', credit: '' }])
        expect(state?.balanced).toBe(false)
    })

    it('con require_nonzero=false, cero == cero está cuadrado', () => {
        const field = journalField({
            balance: { debit_column: 'debit', credit_column: 'credit', require_nonzero: false },
        })
        const state = evaluateBalance(field, [{ debit: '', credit: '' }])
        expect(state?.balanced).toBe(true)
    })

    it('devuelve undefined cuando el campo no declara balance', () => {
        expect(evaluateBalance(journalField({ balance: undefined }), [])).toBeUndefined()
    })
})
