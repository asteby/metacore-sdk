import { describe, it, expect } from 'vitest'
import { applyOptionWhen } from '../dynamic-form-schema'
import type { OptionDef } from '../types'

// A cascading STATIC enum: `provider` options only apply when the sibling
// `type` field is "whatsapp". Mirrors the link-inbox Device use case, but the
// helper is fully domain-agnostic.
const providerOptions: OptionDef[] = [
    { value: 'qr', label: 'QR', when: { field: 'type', in: ['whatsapp'] } },
    { value: 'meta', label: 'Meta', when: { field: 'type', in: ['whatsapp'] } },
]

describe('applyOptionWhen', () => {
    it('keeps only options whose `when.in` matches the parent value', () => {
        const kept = applyOptionWhen(providerOptions, { type: 'whatsapp' })
        expect(kept.map((o) => o.value)).toEqual(['qr', 'meta'])
    })

    it('drops all gated options when the parent value is not in `in`', () => {
        expect(applyOptionWhen(providerOptions, { type: 'sms' })).toEqual([])
        expect(applyOptionWhen(providerOptions, { type: '' })).toEqual([])
        expect(applyOptionWhen(providerOptions, {})).toEqual([])
    })

    it('falls back to `dependsOn` when `when.field` is omitted', () => {
        const opts: OptionDef[] = [
            { value: 'a', label: 'A', when: { in: ['x'] } },
            { value: 'b', label: 'B', when: { in: ['y'] } },
        ]
        expect(applyOptionWhen(opts, { kind: 'x' }, 'kind').map((o) => o.value)).toEqual(['a'])
    })

    it('supports `not_in` (snake_case) and `notIn` (camelCase)', () => {
        const opts: OptionDef[] = [
            { value: 'a', label: 'A', when: { field: 'type', not_in: ['hidden'] } },
            { value: 'b', label: 'B', when: { field: 'type', notIn: ['hidden'] } },
        ]
        expect(applyOptionWhen(opts, { type: 'shown' }).map((o) => o.value)).toEqual(['a', 'b'])
        expect(applyOptionWhen(opts, { type: 'hidden' })).toEqual([])
    })

    it('compares values as strings', () => {
        const opts: OptionDef[] = [{ value: 'a', label: 'A', when: { field: 'n', in: ['1'] } }]
        expect(applyOptionWhen(opts, { n: 1 }).map((o) => o.value)).toEqual(['a'])
    })

    it('includes an option with no `when` regardless of parent value (retrocompat)', () => {
        const opts: OptionDef[] = [
            { value: 'always', label: 'Always' },
            { value: 'gated', label: 'Gated', when: { field: 'type', in: ['whatsapp'] } },
        ]
        expect(applyOptionWhen(opts, { type: 'sms' }).map((o) => o.value)).toEqual(['always'])
        expect(applyOptionWhen(opts, { type: 'whatsapp' }).map((o) => o.value)).toEqual([
            'always',
            'gated',
        ])
    })

    it('includes a gated option when neither `when.field` nor `dependsOn` is present', () => {
        const opts: OptionDef[] = [{ value: 'a', label: 'A', when: { in: ['x'] } }]
        expect(applyOptionWhen(opts, { anything: 'x' }).map((o) => o.value)).toEqual(['a'])
    })

    it('returns [] for undefined options', () => {
        expect(applyOptionWhen(undefined, {})).toEqual([])
    })
})
