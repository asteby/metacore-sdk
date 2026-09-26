import { describe, expect, it } from 'vitest'
import { nameBatchTokens, optionsBatchToken, optionsModelFromUrl } from './query-batch'

describe('query batch tokens', () => {
    it('names distinct tokens and keeps duplicates as one part', () => {
        const named = nameBatchTokens([
            'o:Customer?field=id',
            'o:Product?field=id',
            'o:Customer?field=id',
        ])
        expect(named).toEqual([
            { name: 'q1', token: 'o:Customer?field=id', plan: 'q1=o:Customer?field=id' },
            { name: 'q2', token: 'o:Product?field=id', plan: 'q2=o:Product?field=id' },
        ])
    })

    it('builds an options token from the canonical url', () => {
        expect(optionsModelFromUrl('/options/Customer')).toBe('Customer')
        expect(optionsModelFromUrl('/data/Customer')).toBeNull()
        expect(optionsBatchToken('Customer', 'id', 'lop', 20, undefined)).toBe(
            'o:Customer?field=id&q=lop&limit=20',
        )
    })
})
