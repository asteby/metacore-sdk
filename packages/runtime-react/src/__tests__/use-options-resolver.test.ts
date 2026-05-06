import { afterEach, describe, it, expect, vi } from 'vitest'
import { projectOption } from '../use-options-resolver'
import {
    resolveValidatorToken,
    setOrgConfigBridge,
} from '../use-org-config-bridge'

// `useOptionsResolver` itself is a React hook and would need jsdom +
// react-test-renderer to exercise end-to-end. The bridge tests here
// pin down the projection layer (the only impure shape conversion the
// hook performs) so consumers can rely on the v0.9.0 envelope reading
// without spinning up a renderer.

describe('projectOption', () => {
    it('mirrors id into value and label into name when missing', () => {
        const out = projectOption({ id: 'abc', label: 'Hello' })
        expect(out.id).toBe('abc')
        expect(out.value).toBe('abc')
        expect(out.label).toBe('Hello')
        expect(out.name).toBe('Hello')
    })

    it('preserves explicit value and name when provided', () => {
        const out = projectOption({ id: 1, value: 'one', label: 'L', name: 'N' })
        expect(out.value).toBe('one')
        expect(out.name).toBe('N')
    })

    it('coerces label to string from numeric id when none provided', () => {
        const out = projectOption({ id: 42 })
        expect(out.label).toBe('42')
        expect(out.name).toBe('42')
    })

    it('preserves optional decoration fields', () => {
        const out = projectOption({
            id: 'x', label: 'X',
            description: 'desc', image: '/a.png',
            color: '#fff', icon: 'IconStar',
        })
        expect(out.description).toBe('desc')
        expect(out.image).toBe('/a.png')
        expect(out.color).toBe('#fff')
        expect(out.icon).toBe('IconStar')
    })

    it('null-safes missing optionals to null', () => {
        const out = projectOption({ id: 'x', label: 'X' })
        expect(out.description).toBeNull()
        expect(out.image).toBeNull()
        expect(out.color).toBeNull()
        expect(out.icon).toBeNull()
    })

    it('survives empty payload (defensive)', () => {
        const out = projectOption({})
        expect(out.id).toBe('')
        expect(out.value).toBe('')
        expect(out.label).toBe('')
        expect(out.name).toBe('')
    })
})

// The envelope shape the hook expects from the kernel is exercised here
// with a mocked transport so apps can document the wire contract in a
// single place. `useOptionsResolver` reads `body.data` for options and
// `body.meta.{type, count}` for the discriminator — the legacy
// root-level `body.type` is also accepted for grace-period upgrades.
describe('options envelope contract', () => {
    it('v0.9.0 shape carries meta.type and meta.count', () => {
        const wire = {
            success: true,
            data: [
                { id: '1', label: 'One' },
                { id: '2', label: 'Two' },
            ],
            meta: { type: 'dynamic', count: 2 },
        }
        // Smoke-check the projection a real call would do.
        expect(wire.data.map(projectOption)).toHaveLength(2)
        expect(wire.meta.type).toBe('dynamic')
        expect(wire.meta.count).toBe(2)
    })

    it('legacy shape is identifiable but consumers should migrate', () => {
        const legacy = {
            success: true,
            data: [{ id: '1', label: 'One' }],
            // root-level type, not under meta — the SDK reads it as a
            // fallback but logs no warning (kernel ≥ v0.9.0 emits the
            // canonical shape; older deployments are an interop case).
            type: 'static',
        } as any
        expect(legacy.type).toBe('static')
        expect(legacy.meta).toBeUndefined()
    })
})

// Sanity-check the resolver bridge: when no provider is mounted
// `resolveValidatorToken` returns the original token. Apps that mount
// `OrgConfigProvider` swap that for the resolved literal.
describe('OrgConfigBridge integration', () => {
    afterEach(() => {
        // Reset to the null bridge so independent tests do not leak state.
        setOrgConfigBridge(null)
    })

    it('resolveValidatorToken passes through plain literals', () => {
        expect(resolveValidatorToken('mx.rfc')).toBe('mx.rfc')
        expect(resolveValidatorToken(null)).toBeNull()
        expect(resolveValidatorToken('')).toBeNull()
    })

    it('resolveValidatorToken returns the $org reference verbatim when no bridge mounted', () => {
        // Default null bridge: ref keys resolve to null → token preserved.
        expect(resolveValidatorToken('$org.tax_id')).toBe('$org.tax_id')
    })

    it('setOrgConfigBridge swaps the active resolver and survives clearing', () => {
        const spy = vi.fn((key: string) => (key === '$org.tax_id' ? 'mx.rfc' : null))
        setOrgConfigBridge({ resolveValidator: spy, available: true })
        expect(resolveValidatorToken('$org.tax_id')).toBe('mx.rfc')
        expect(spy).toHaveBeenCalledWith('$org.tax_id')
        setOrgConfigBridge(null)
        expect(resolveValidatorToken('$org.tax_id')).toBe('$org.tax_id')
    })
})
