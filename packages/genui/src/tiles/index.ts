// Bloques de tablero reutilizables que el kit de UI no trae: ranking/lista, serie con vista en tabla y
// estado de bloque (sobre `DataState`). KPI, variacion, tonos y mini-grafica salen de `@asteby/metacore-ui`
// (`KpiCard`, `Delta`, `toneClasses`) y `@asteby/metacore-charts` (`Sparkline`).
export { BlockState, type BlockStateKind, type BlockStateProps } from './block-state'
export { RANKED_LAZY_ROWS, RankedList, type RankedItem, type RankedListProps } from './ranked-list'
export { SERIES_VIEW_LABELS, SeriesView, type SeriesColumn, type SeriesRow, type SeriesViewLabels, type SeriesViewProps } from './series-view'
