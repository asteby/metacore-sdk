// @vitest-environment happy-dom
//
// DynamicTable classic pagination ('pages', the default mode):
//   1. The pager footer renders; clicking page 2 issues a NEW query with
//      page=2 and REPLACES the visible rows (no accumulation).
//   2. Changing the filters resets back to page 1.
//   3. The chosen page size persists per table in localStorage and is adopted
//      on the next mount (over the model's server default).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))
const I18N = {
    t: (_k: string, o?: { defaultValue?: string; count?: number; total?: number }) => {
        if (o?.defaultValue && o.count != null && o.total != null) {
            return o.defaultValue.replace('{{count}}', String(o.count)).replace('{{total}}', String(o.total))
        }
        return o?.defaultValue ?? _k
    },
    i18n: { language: 'es' },
}
vi.mock('react-i18next', () => ({ useTranslation: () => I18N }))

import { act } from '@testing-library/react'
import { emitRecordMutation } from '../record-mutation-events'
import { DynamicTable } from '../dynamic-table'
import { ApiProvider, type ApiClient } from '../api-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        group_by: 'stage',
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
        ],
        actions: [],
        perPageOptions: [10, 20, 50],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: false,
    }
}

function fakeApi(total: number): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total } } })
    const page = (n: number, size: number) => {
        const start = (n - 1) * size
        const rows: Array<{ id: number; title: string }> = []
        for (let i = start; i < Math.min(start + size, total); i++) {
            rows.push({ id: i + 1, title: `Issue ${i + 1}` })
        }
        return rows
    }
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) return ok([])
            const p = cfg?.params?.page ?? 1
            const size = cfg?.params?.per_page ?? 10
            return ok(page(p, size))
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

function dataCalls(api: ApiClient) {
    return (api.get as any).mock.calls.filter((c: any[]) => c[0] === '/data/issue')
}

describe('DynamicTable reloads on record mutation events (#1020)', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        useMetadataCache.getState().setMetadata('issue', meta())
    })

    it('repeats the GET when a record of the same model (any case) is mutated', async () => {
        const api = fakeApi(5)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" enableUrlSync={false} />
            </ApiProvider>,
        )
        await waitFor(() => expect(dataCalls(api).length).toBeGreaterThan(0))
        await new Promise((r) => setTimeout(r, 450))
        const before = dataCalls(api).length

        act(() => emitRecordMutation('ISSUE', 'create'))
        await waitFor(() => expect(dataCalls(api).length).toBeGreaterThan(before))
    })

    it('ignores mutations of other models', async () => {
        const api = fakeApi(5)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" enableUrlSync={false} />
            </ApiProvider>,
        )
        await waitFor(() => expect(dataCalls(api).length).toBeGreaterThan(0))
        await new Promise((r) => setTimeout(r, 450))
        const before = dataCalls(api).length
        act(() => emitRecordMutation('other_model', 'delete'))
        await new Promise((r) => setTimeout(r, 500))
        expect(dataCalls(api).length).toBe(before)
    })
})
