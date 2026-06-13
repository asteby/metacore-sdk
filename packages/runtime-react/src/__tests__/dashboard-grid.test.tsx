// @vitest-environment happy-dom
//
// DashboardGrid contract coverage:
//   - normalizeGroups (pure): flat widgets → ordered groups by group/order.
//   - render per kind: stat/list/progress paint their value; chart kinds paint
//     the card chrome (title) — recharts itself isn't exercised in jsdom.
//   - skeletons while loading, then real content after the batch resolves.
//   - global empty state when there are no widgets.
//   - permission gating via <PermissionsProvider> (and isAdmin bypass).
//   - isolated per-widget error: a throwing renderer shows its error card and
//     the sibling widgets still render.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

// react-i18next: identity translator (returns the key) so specs' raw i18n keys
// surface verbatim and we can assert on them.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))

// recharts' ResponsiveContainer relies on ResizeObserver; stub it for happy-dom.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub

afterEach(cleanup)

import { DashboardGrid, normalizeGroups } from '../dashboard-grid'
import { PermissionsProvider } from '../permissions-context'
import type {
    DashboardWidgetSpec,
    WidgetData,
} from '../dashboard-types'

const spec = (over: Partial<DashboardWidgetSpec>): DashboardWidgetSpec => ({
    key: 'k',
    title: 'Title',
    kind: 'stat',
    ...over,
})

const loaderOf =
    (map: Record<string, WidgetData>) => async (keys: string[]) => {
        const out: Record<string, WidgetData> = {}
        for (const k of keys) if (map[k]) out[k] = map[k]
        return out
    }

describe('normalizeGroups', () => {
    it('returns explicit groups untouched', () => {
        const groups = [{ title: 'g1', widgets: [spec({ key: 'a' })] }]
        expect(normalizeGroups(groups, undefined)).toBe(groups)
    })

    it('groups flat widgets by `group` and sorts each by `order`', () => {
        const widgets = [
            spec({ key: 'b', group: 'sales', order: 20 }),
            spec({ key: 'a', group: 'sales', order: 10 }),
            spec({ key: 'c', group: 'stock' }),
        ]
        const out = normalizeGroups(undefined, widgets)
        expect(out.map((g) => g.title)).toEqual(['sales', 'stock'])
        expect(out[0].widgets.map((w) => w.key)).toEqual(['a', 'b'])
    })

    it('returns [] when there is nothing', () => {
        expect(normalizeGroups(undefined, [])).toEqual([])
    })
})

describe('DashboardGrid render', () => {
    it('shows a skeleton while loading then the stat value', async () => {
        let resolve!: (v: Record<string, WidgetData>) => void
        const loadData = vi.fn(
            () => new Promise<Record<string, WidgetData>>((r) => (resolve = r)),
        )
        render(
            <DashboardGrid
                widgets={[spec({ key: 'rev', kind: 'stat' })]}
                loadData={loadData}
            />,
        )
        // skeleton up first
        expect(screen.getByTestId('widget-skeleton-rev')).toBeTruthy()
        resolve({ rev: { value: 42 } })
        await waitFor(() =>
            expect(screen.getByTestId('widget-rev')).toBeTruthy(),
        )
        expect(screen.getByText('42')).toBeTruthy()
    })

    it('renders a currency stat with the org currency + delta chip', async () => {
        render(
            <DashboardGrid
                widgets={[
                    spec({ key: 'rev', kind: 'stat', format: 'currency' }),
                ]}
                currency="MXN"
                locale="en-US"
                loadData={loaderOf({ rev: { value: 1000, delta: 0.142 } })}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('widget-rev')).toBeTruthy())
        // MX$1,000.00 (en-US + MXN) — assert the currency symbol + amount present
        expect(screen.getByText(/1,000/)).toBeTruthy()
        expect(screen.getByText(/\+14\.2%/)).toBeTruthy()
    })

    it('renders a list widget with each bucket label + value', async () => {
        render(
            <DashboardGrid
                widgets={[spec({ key: 'top', kind: 'list' })]}
                loadData={loaderOf({
                    top: {
                        series: [
                            { key: 'a', label: 'Alpha', value: 10 },
                            { key: 'b', label: 'Beta', value: 5 },
                        ],
                    },
                })}
            />,
        )
        await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
        expect(screen.getByText('Beta')).toBeTruthy()
    })

    it('paints the card chrome (title) for chart kinds', async () => {
        render(
            <DashboardGrid
                widgets={[spec({ key: 'chart', title: 'My Chart', kind: 'bar' })]}
                loadData={loaderOf({
                    chart: { series: [{ key: 'a', label: 'A', value: 3 }] },
                })}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('widget-chart')).toBeTruthy())
        expect(screen.getByText('My Chart')).toBeTruthy()
    })

    it('shows the per-widget empty state when data is missing', async () => {
        render(
            <DashboardGrid
                widgets={[spec({ key: 'empty', kind: 'stat', empty: 'No stock' })]}
                loadData={loaderOf({})}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('widget-empty')).toBeTruthy())
        expect(screen.getByText('No stock')).toBeTruthy()
    })

    it('shows the global empty state when there are no widgets', () => {
        render(<DashboardGrid widgets={[]} loadData={loaderOf({})} />)
        expect(screen.getByTestId('dashboard-empty')).toBeTruthy()
    })
})

describe('DashboardGrid permission gating', () => {
    it('without a PermissionsProvider every widget is visible', async () => {
        render(
            <DashboardGrid
                widgets={[spec({ key: 'p', kind: 'stat', permission: 'x.read' })]}
                loadData={loaderOf({ p: { value: 1 } })}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('widget-p')).toBeTruthy())
    })

    it('hides widgets whose permission is not granted', () => {
        render(
            <PermissionsProvider permissions={['other.read']} isAdmin={false}>
                <DashboardGrid
                    widgets={[
                        spec({ key: 'p', kind: 'stat', permission: 'secret.read' }),
                    ]}
                    loadData={loaderOf({ p: { value: 1 } })}
                />
            </PermissionsProvider>,
        )
        // gated out → whole grid is empty → global empty state
        expect(screen.queryByTestId('widget-skeleton-p')).toBeNull()
        expect(screen.getByTestId('dashboard-empty')).toBeTruthy()
    })

    it('shows granted widgets and respects isAdmin bypass', async () => {
        render(
            <PermissionsProvider permissions={[]} isAdmin={false}>
                <DashboardGrid
                    isAdmin
                    widgets={[
                        spec({ key: 'p', kind: 'stat', permission: 'secret.read' }),
                    ]}
                    loadData={loaderOf({ p: { value: 7 } })}
                />
            </PermissionsProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('widget-p')).toBeTruthy())
    })
})

describe('DashboardGrid error isolation', () => {
    it('a throwing widget shows its error card; siblings still render', async () => {
        // An unknown kind without a renderer falls to the error card path.
        render(
            <DashboardGrid
                widgets={[
                    spec({ key: 'ok', kind: 'stat' }),
                    spec({ key: 'bad', kind: 'nonsense' as any }),
                ]}
                loadData={loaderOf({ ok: { value: 9 }, bad: { value: 1 } })}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('widget-ok')).toBeTruthy())
        // sibling renders its value
        expect(screen.getByText('9')).toBeTruthy()
        // broken one shows the error card (not crashing the grid)
        expect(screen.getByTestId('widget-bad')).toBeTruthy()
        expect(screen.getByText('Could not load this widget.')).toBeTruthy()
    })
})
