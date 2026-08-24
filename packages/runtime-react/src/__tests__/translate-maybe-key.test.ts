import { describe, expect, it, vi } from 'vitest'
import { translateMaybeKey } from '../translate-maybe-key'

describe('translateMaybeKey', () => {
    it('passes through plain localized labels without calling t', () => {
        const t = vi.fn((key: string) => `T(${key})`)
        expect(translateMaybeKey(t, 'Timbrar CFDI')).toBe('Timbrar CFDI')
        expect(t).not.toHaveBeenCalled()
    })

    it('looks up dotted i18n keys', () => {
        const t = vi.fn((key: string, opts?: { defaultValue?: string }) =>
            key === 'fiscal_mexico.action.stamp_fiscal.label'
                ? 'Timbrar CFDI'
                : (opts?.defaultValue ?? key),
        )
        expect(translateMaybeKey(t, 'fiscal_mexico.action.stamp_fiscal.label')).toBe(
            'Timbrar CFDI',
        )
        expect(t).toHaveBeenCalledOnce()
    })

    it('returns empty for blank labels', () => {
        const t = vi.fn()
        expect(translateMaybeKey(t, null)).toBe('')
        expect(translateMaybeKey(t, '   ')).toBe('')
        expect(t).not.toHaveBeenCalled()
    })
})
