// @vitest-environment happy-dom
import * as React from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
    Sparkline,
    sparklineGeometry,
    formatWidgetValue,
    formatAxisTick,
    formatDelta,
    accentClasses,
    paletteColor,
    CHART_PALETTE,
} from './index'

describe('formatting + palette', () => {
    it('formats by declared format', () => {
        expect(formatWidgetValue(0.142, { format: 'percent', locale: 'en-US' })).toBe('14.2%')
        expect(formatWidgetValue(1200, { format: 'compact', locale: 'en-US' })).toBe('1.2K')
        expect(formatWidgetValue(12.5, { format: 'currency', locale: 'en-US', currency: 'MXN' })).toContain('12.50')
        expect(formatWidgetValue(Number.NaN, {})).toBe('—')
        expect(formatAxisTick(1500, { locale: 'en-US' })).toBe('1.5K')
        expect(formatDelta(0.142, 'en-US')).toBe('+14.2%')
    })
    it('palette wraps and accents default to sky', () => {
        expect(paletteColor(CHART_PALETTE.length)).toBe(CHART_PALETTE[0])
        expect(accentClasses().chartVar).toContain('sky')
    })
})

describe('Sparkline', () => {
    it('computes geometry: min at the bottom, max at the top, flat in the middle', () => {
        const g = sparklineGeometry([1, 2, 3], 100, 20, 2)
        expect(g.points[0]).toEqual([2, 18])
        expect(g.points[2]).toEqual([98, 2])
        expect(sparklineGeometry([5, 5], 100, 20).points.map((p) => p[1])).toEqual([10, 10])
        expect(sparklineGeometry([], 10, 10).line).toBe('')
        expect(sparklineGeometry([1, Number.NaN, 3], 10, 10).points).toHaveLength(2)
    })
    it('renders an svg, decorative unless labelled', () => {
        const { container, rerender } = render(<Sparkline data={[1, 3, 2]} area />)
        const svg = container.querySelector('svg')!
        expect(svg.getAttribute('aria-hidden')).toBe('true')
        expect(container.querySelectorAll('path')).toHaveLength(2)
        rerender(<Sparkline data={[1, 3, 2]} label="Orders" color="red" />)
        const s2 = container.querySelector('svg')!
        expect(s2.getAttribute('role')).toBe('img')
        expect(s2.getAttribute('aria-label')).toBe('Orders')
        expect(container.querySelector('path')!.getAttribute('stroke')).toBe('red')
    })
    it('renders a dot for a single point and nothing for empty data', () => {
        expect(render(<Sparkline data={[4]} />).container.querySelector('circle')).not.toBeNull()
        expect(render(<Sparkline data={[]} />).container.querySelector('path')).toBeNull()
    })
})
