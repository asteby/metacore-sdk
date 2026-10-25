// @asteby/metacore-charts — light entry. Nothing here statically imports
// recharts: the chart components are lazy facades and the Sparkline is pure
// SVG. Eager recharts bodies live at '@asteby/metacore-charts/recharts'.
export {
    formatWidgetValue,
    formatAxisTick,
    formatDelta,
    accentClasses,
    paletteColor,
    CHART_PALETTE,
    CHART_GRID,
    CHART_MUTED,
    type AccentClasses,
    type WidgetAccent,
    type WidgetFormat,
    type WidgetFormatCtx,
} from './format'
export { Sparkline, sparklineGeometry, type SparklineProps, type SparklineGeometry } from './sparkline'
export { BarChart, LineChart, AreaChart, PieChart, DonutChart, preloadCharts } from './lazy'
export { CHART_BODY_HEIGHT } from './constants'
export type { ChartBodyProps, ChartPoint } from './bodies'
