// The chart code moved to @asteby/metacore-charts; everything runtime-react
// used to expose must still be exported from its index, and the formatters
// must be the very same functions.
import { describe, expect, it } from 'vitest'
import * as runtime from '../index'
import * as charts from '@asteby/metacore-charts'

describe('runtime-react keeps exporting the chart surface', () => {
    it.each([
        'BarWidget', 'LineWidget', 'AreaWidget', 'PieWidget', 'DonutWidget', 'preloadWidgetCharts',
        'formatWidgetValue', 'formatAxisTick', 'formatDelta', 'accentClasses', 'paletteColor', 'CHART_PALETTE',
        'WidgetCard', 'WidgetRenderer', 'StatWidget',
    ])('exports %s', (name) => {
        expect((runtime as Record<string, unknown>)[name]).toBeDefined()
    })

    it('shares the implementation with @asteby/metacore-charts', () => {
        expect(runtime.formatWidgetValue).toBe(charts.formatWidgetValue)
        expect(runtime.paletteColor).toBe(charts.paletteColor)
        expect(runtime.CHART_PALETTE).toBe(charts.CHART_PALETTE)
        expect(runtime.Sparkline).toBe(charts.Sparkline)
    })

    it('keeps the eager ./charts module exporting the five widgets', async () => {
        const m = await import('../widgets/charts')
        for (const k of ['BarWidget', 'LineWidget', 'AreaWidget', 'PieWidget', 'DonutWidget']) {
            expect(typeof (m as Record<string, unknown>)[k]).toBe('function')
        }
    })
})
