// Heavy entry: eager recharts-backed chart bodies. Import this only from a
// module that is itself loaded lazily (the package index does so via
// `React.lazy`).
export {
    BarChartBody,
    LineChartBody,
    AreaChartBody,
    PieChartBody,
    DonutChartBody,
    CHART_BODY_HEIGHT,
    type ChartBodyProps,
    type ChartPoint,
} from './bodies'
