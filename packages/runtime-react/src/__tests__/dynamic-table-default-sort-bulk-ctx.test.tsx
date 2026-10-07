// @vitest-environment happy-dom
//
// DynamicTable `defaultSort` + bulk ctx `actions` / `can`:
//   1. `defaultSort` seeds the first request (sortBy/order); `desc` omitted
//      means asc; without it nothing is sent; a `?sortBy=` in the URL wins when
//      enableUrlSync is on. (Changing it from the header menu is plain
//      TanStack sorting state and is not exercised here: the Radix menu does
//      not open reliably under happy-dom.)
//   2. The bulk context handed to `extraBulkActions` exposes `actions` (the
//      metadata actions) and `can(key)`: all allowed without a provider,
//      filtered by capability inside a PermissionsProvider.
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

import { DynamicTable } from '../dynamic-table'
import { makeDefaultGetDynamicColumns } from '../dynamic-columns'
import { ApiProvider, type ApiClient } from '../api-context'
import { PermissionsProvider } from '../permissions-context'
import { useMetadataCache } from '../metadata-cache'
import type { TableMetadata } from '../types'

afterEach(cleanup)

const getDynamicColumns = makeDefaultGetDynamicColumns()

function meta(): TableMetadata {
    return {
        title: 'Issues',
        endpoint: '/data/issue',
        columns: [
            { key: 'title', label: 'Title', type: 'text', sortable: true, filterable: false, searchable: true },
        ],
        actions: [
            { key: 'approve', name: 'approve', label: 'Aprobar', icon: 'Check', class: '', type: 'custom' },
            { key: 'reject', name: 'reject', label: 'Rechazar', icon: 'X', class: '', type: 'custom' },
        ],
        perPageOptions: [10, 20, 50],
        defaultPerPage: 10,
        searchPlaceholder: 'Buscar...',
        enableCRUDActions: false,
        hasActions: true,
    }
}

function fakeApi(total: number): ApiClient {
    const ok = (data: unknown) => ({ data: { success: true, data, meta: { total } } })
    return {
        get: vi.fn(async (url: string, cfg?: any) => {
            if (url.startsWith('/metadata/table/')) return ok(meta())
            if (url.endsWith('/facets')) return ok([])
            const p = cfg?.params?.page ?? 1
            const size = cfg?.params?.per_page ?? 10
            const rows: Array<{ id: number; title: string }> = []
            for (let i = (p - 1) * size; i < Math.min(p * size, total); i++) rows.push({ id: i + 1, title: `Issue ${i + 1}` })
            return ok(rows)
        }),
        post: vi.fn(async () => ok(null)),
        put: vi.fn(async () => ok(null)),
        delete: vi.fn(async () => ok(null)),
    }
}

async function selectFirstRow() {
    await screen.findAllByText('Issue 1')
    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[1]) // [0] is the select-all header checkbox
}


describe('DynamicTable defaultSort', () => {
    beforeEach(() => {
        localStorage.clear(); sessionStorage.clear()
        window.history.replaceState({}, '', '/')
        useMetadataCache.getState().setMetadata('issue', meta())
    })

    it('sends the default sort on the first request', async () => {
        const api = fakeApi(5)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns} defaultSort={{ id: 'title', desc: true }} />
            </ApiProvider>,
        )
        await screen.findAllByText('Issue 1')
        const calls = (api.get as any).mock.calls.filter((c: any[]) => !String(c[0]).startsWith('/metadata') && !String(c[0]).endsWith('/facets'))
        expect(calls.length).toBeGreaterThan(0)
        for (const c of calls) {
            expect(c[1].params.sortBy).toBe('title')
            expect(c[1].params.order).toBe('desc')
        }
    })

    it('defaultSort without desc is asc; no defaultSort sends no sortBy', async () => {
        const a = fakeApi(5)
        const { unmount } = render(
            <ApiProvider client={a}>
                <DynamicTable model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns} defaultSort={{ id: 'title' }} />
            </ApiProvider>,
        )
        await screen.findAllByText('Issue 1')
        const listCall = (a.get as any).mock.calls.find((c: any[]) => c[1]?.params?.page)
        expect(listCall[1].params.order).toBe('asc')
        unmount()
        const b = fakeApi(5)
        render(
            <ApiProvider client={b}>
                <DynamicTable model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns} />
            </ApiProvider>,
        )
        await screen.findAllByText('Issue 1')
        const call = (b.get as any).mock.calls.find((c: any[]) => c[1]?.params?.page)
        expect(call[1].params.sortBy).toBeUndefined()
    })

    it('a URL sortBy wins over defaultSort when enableUrlSync is on', async () => {
        window.history.replaceState({}, '', '/?sortBy=id&order=asc')
        const api = fakeApi(5)
        render(
            <ApiProvider client={api}>
                <DynamicTable model="issue" getDynamicColumns={getDynamicColumns} defaultSort={{ id: 'title', desc: true }} />
            </ApiProvider>,
        )
        await screen.findAllByText('Issue 1')
        const lists = (api.get as any).mock.calls.filter((c: any[]) => c[1]?.params?.page)
        for (const c of lists) {
            // never the default; (a pre-adoption request without sort is pre-existing behavior)
            expect(c[1].params.sortBy).not.toBe('title')
        }
        await waitFor(() => {
            const all = (api.get as any).mock.calls.filter((c: any[]) => c[1]?.params?.page)
            expect(all[all.length - 1][1].params).toMatchObject({ sortBy: 'id', order: 'asc' })
        })
    })
})

describe('DynamicTable bulk context actions / can', () => {
    beforeEach(() => {
        localStorage.clear(); sessionStorage.clear()
        useMetadataCache.getState().setMetadata('issue', meta())
    })

    function Probe({ seen }: { seen: { keys: string[]; approve: boolean; reject: boolean }[] }) {
        return (
            <DynamicTable
                model="issue" enableUrlSync={false} getDynamicColumns={getDynamicColumns}
                extraBulkActions={(ctx) => {
                    seen.push({ keys: ctx.actions.map((a) => a.key), approve: ctx.can('approve'), reject: ctx.can('reject') })
                    return <span>Barra</span>
                }}
            />
        )
    }

    it('without a provider exposes all actions and can() is true', async () => {
        const seen: any[] = []
        render(<ApiProvider client={fakeApi(5)}><Probe seen={seen} /></ApiProvider>)
        await selectFirstRow()
        await screen.findByText('Barra')
        const last = seen[seen.length - 1]
        expect(last.keys).toEqual(['approve', 'reject'])
        expect(last.approve).toBe(true)
        expect(last.reject).toBe(true)
    })

    it('with a provider filters actions and can() by capability', async () => {
        const seen: any[] = []
        render(
            <ApiProvider client={fakeApi(5)}>
                <PermissionsProvider permissions={['issue.approve']} isAdmin={false}>
                    <Probe seen={seen} />
                </PermissionsProvider>
            </ApiProvider>,
        )
        await selectFirstRow()
        await screen.findByText('Barra')
        const last = seen[seen.length - 1]
        expect(last.keys).toEqual(['approve'])
        expect(last.approve).toBe(true)
        expect(last.reject).toBe(false)
    })
})
