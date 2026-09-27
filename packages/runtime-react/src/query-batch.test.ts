import { describe, expect, it, vi } from 'vitest'
import {
    invalidateQueryBatchData,
    loadQueryPart,
    nameBatchTokens,
    narrowInToken,
    optionsBatchToken,
    optionsModelFromUrl,
    rememberInRows,
    resetQueryBatchCache,
    splitInToken,
    tokenForGet,
} from './query-batch'

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

    it('keeps each in: id and asks only for the ones that are missing', () => {
        resetQueryBatchCache()
        const token = 't:Stock?per_page=200&product_id=in:a,b,c&skip_refs=1'
        expect(splitInToken(token)?.shape).toBe('t:Stock?per_page=200&product_id=in:$1&skip_refs=1')
        expect(splitInToken('t:Stock?product_id=in:@p1.id')).toBeNull()

        rememberInRows(token, ['a', 'b'], [{ product_id: 'a', quantity: 1 }])
        const narrowed = narrowInToken(token)
        expect(narrowed?.missingIds).toEqual(['c'])
        expect(narrowed?.rows).toEqual([{ product_id: 'a', quantity: 1 }])
        expect(narrowed?.wire).toContain('in%3Ac')
        expect(narrowed?.wire).not.toContain('%2Cb')

        rememberInRows(token, ['c'], [{ product_id: 'c', quantity: 4 }])
        const done = narrowInToken('t:Stock?product_id=in:a,c&per_page=200&skip_refs=1')
        expect(done?.wire).toBe('')
        expect(done?.rows).toEqual([
            { product_id: 'a', quantity: 1 },
            { product_id: 'c', quantity: 4 },
        ])
        resetQueryBatchCache()
    })

    it('maps table reads onto batch tokens and leaves aggregates on GET', () => {
        expect(tokenForGet('/metadata/table/Sale')).toBe('m:Sale')
        expect(tokenForGet('/metadata/modal/Sale')).toBe('mm:Sale')
        expect(tokenForGet('/data/Stock', { per_page: 20, page: 1, 'f_product_id': 'in:a,b' })).toBe(
            't:Stock?f_product_id=in%3Aa%2Cb&page=1&per_page=20',
        )
        expect(tokenForGet('/data/Stock/aggregate', { page: 1 })).toBeNull()
        expect(tokenForGet('/data/Stock/me')).toBeNull()
        expect(tokenForGet('/options/Customer?field=name&q=lop')).toBe('o:Customer?field=name&q=lop')
    })

    it('keeps every row of an id and reads f_ filters by their column', () => {
        resetQueryBatchCache()
        const token = 't:Stock?f_product_id=in:a,b&per_page=200'
        rememberInRows(token, ['a', 'b'], [
            { product_id: 'a', warehouse_id: 'w1' },
            { product_id: 'a', warehouse_id: 'w2' },
            { product_id: 'b', warehouse_id: 'w1' },
        ])
        const done = narrowInToken(token)
        expect(done?.wire).toBe('')
        expect(done?.rows).toHaveLength(3)
        resetQueryBatchCache()
    })

    it('does not split a paginated list', () => {
        expect(splitInToken('t:Stock?f_product_id=in:a,b&page=1&per_page=25')).toBeNull()
    })
})

describe('query batch freshness', () => {
    function fakeApi(responses: unknown[]) {
        const post = vi.fn(async (_url: string, body: { parts: string[]; inm: Record<string, string> }) => {
            const next = responses.shift() as (b: typeof body) => unknown
            return { data: next(body) }
        })
        return { post, get: vi.fn(), put: vi.fn(), delete: vi.fn() }
    }

    it('reads a list again instead of serving it from memory', async () => {
        resetQueryBatchCache()
        const api = fakeApi([
            () => ({ success: true, parts: { q1: { success: true, data: [], etag: '"q-1-2"' } } }),
            (body: { inm: Record<string, string> }) => {
                // A length-based etag is not trusted: the stale copy is not offered.
                expect(body.inm).toEqual({})
                return { success: true, parts: { q1: { success: true, data: [{ id: 'x' }], etag: '"q-1-2"' } } }
            },
        ])
        const token = 't:QuoteItem?f_quote_id=eq%3Aq1&page=1&per_page=25'
        expect((await loadQueryPart(api as never, token)).data).toEqual([])
        expect((await loadQueryPart(api as never, token)).data).toEqual([{ id: 'x' }])
        expect(api.post).toHaveBeenCalledTimes(2)
        resetQueryBatchCache()
    })

    it('reuses a list only when the content etag says it did not change', async () => {
        resetQueryBatchCache()
        const api = fakeApi([
            () => ({ success: true, parts: { q1: { success: true, data: [{ id: 'x' }], etag: '"qh-abc"' } } }),
            (body: { inm: Record<string, string> }) => {
                expect(body.inm).toEqual({ q1: '"qh-abc"' })
                return { success: true, parts: { q1: { success: true, not_modified: true, etag: '"qh-abc"' } } }
            },
        ])
        const token = 't:QuoteItem?page=1'
        await loadQueryPart(api as never, token)
        expect((await loadQueryPart(api as never, token)).data).toEqual([{ id: 'x' }])
        resetQueryBatchCache()
    })

    it('forgets remembered rows after a mutation but keeps metadata', async () => {
        resetQueryBatchCache()
        const api = fakeApi([
            () => ({ success: true, parts: { q1: { success: true, data: { columns: [] } } } }),
        ])
        await loadQueryPart(api as never, 'm:Quote')
        rememberInRows('t:Stock?product_id=in:a', ['a'], [{ product_id: 'a' }])
        invalidateQueryBatchData()
        expect(narrowInToken('t:Stock?product_id=in:a')).toBeNull()
        // Metadata is still served from memory: no second request.
        await loadQueryPart(api as never, 'm:Quote')
        expect(api.post).toHaveBeenCalledTimes(1)
        resetQueryBatchCache()
    })
})
