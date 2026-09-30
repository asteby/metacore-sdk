// Locks the default-merge semantics of the useAddonSettings primitive: saved
// org values win over caller defaults, never-saved keys fall back to their
// default, and a sparse/undefined stored payload stays well-behaved. The hook
// itself is a thin react-query wrapper over `useApi`; the load-bearing logic
// is this pure merge, so that's what we test directly.
import { describe, it, expect } from 'vitest'
import { mergeAddonSettings, addonSettingsKey, addonSettingsUrl } from '../use-addon-settings'

interface PosSettings extends Record<string, unknown> {
    allowNegativeStock: boolean
    roundingMode: string
    taxRate: number
}

describe('mergeAddonSettings', () => {
    const defaults: Partial<PosSettings> = {
        allowNegativeStock: false,
        roundingMode: 'nearest',
        taxRate: 0,
    }

    it('falls back to defaults when nothing is stored', () => {
        expect(mergeAddonSettings<PosSettings>(defaults, null)).toEqual({
            allowNegativeStock: false,
            roundingMode: 'nearest',
            taxRate: 0,
        })
        expect(mergeAddonSettings<PosSettings>(defaults, undefined)).toEqual(defaults)
        expect(mergeAddonSettings<PosSettings>(defaults, {})).toEqual(defaults)
    })

    it('lets saved org values override defaults', () => {
        expect(
            mergeAddonSettings<PosSettings>(defaults, { allowNegativeStock: true, taxRate: 16 }),
        ).toEqual({
            allowNegativeStock: true,
            roundingMode: 'nearest',
            taxRate: 16,
        })
    })

    it('keeps falsy saved values (0, false, "") instead of treating them as unset', () => {
        expect(
            mergeAddonSettings<PosSettings>(
                { allowNegativeStock: true, roundingMode: 'up', taxRate: 5 },
                { allowNegativeStock: false, roundingMode: '', taxRate: 0 },
            ),
        ).toEqual({ allowNegativeStock: false, roundingMode: '', taxRate: 0 })
    })

    it('treats an explicit undefined in the stored payload as unset', () => {
        expect(
            mergeAddonSettings<PosSettings>(defaults, { roundingMode: undefined }),
        ).toEqual(defaults)
    })

    it('returns an object even with no defaults', () => {
        expect(mergeAddonSettings(undefined, { a: 1 })).toEqual({ a: 1 })
        expect(mergeAddonSettings(undefined, null)).toEqual({})
    })

    it('does not mutate the provided defaults object', () => {
        const d = { ...defaults }
        mergeAddonSettings<PosSettings>(d, { taxRate: 99 })
        expect(d).toEqual(defaults)
    })
})

describe('addonSettingsKey', () => {
    it('is stable and namespaced per addon', () => {
        expect(addonSettingsKey('pos')).toEqual(['addon-settings', 'pos'])
        expect(addonSettingsKey('inventory')).toEqual(['addon-settings', 'inventory'])
    })
})

describe('branch-scoped settings (POS-1)', () => {
    it('keys and urls carry the branch only when given', () => {
        expect(addonSettingsKey('pos', 'b1')).toEqual(['addon-settings', 'pos', 'b1'])
        expect(addonSettingsKey('pos', null)).toEqual(['addon-settings', 'pos'])
        expect(addonSettingsUrl('pos')).toBe('/api/addons/pos/settings')
        expect(addonSettingsUrl('pos', 'b 1')).toBe('/api/addons/pos/settings?branch_id=b%201')
    })

    it('an org-key prefix matches every branch read (invalidation)', () => {
        const org = addonSettingsKey('pos')
        const branch = addonSettingsKey('pos', 'b1')
        expect(branch.slice(0, org.length)).toEqual([...org])
    })
})
