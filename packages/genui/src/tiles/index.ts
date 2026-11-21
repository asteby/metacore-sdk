// Bloques de tablero reutilizables (promovidos desde el tablero de 7 Leguas): KPI con variacion y
// mini-grafica, ranking/lista, serie con vista en tabla, estados por widget. Solo presentacion:
// el host formatea, resuelve iconos y trae los datos; el color sale de variables del tema.
export { BLOCK_STATE_LABELS, BlockState, type BlockStateKind, type BlockStateLabels, type BlockStateProps } from './block-state'
export { DELTA_LABELS, Delta, type DeltaLabels, type DeltaProps } from './delta'
export { KpiTile, type KpiTileProps } from './kpi-tile'
export { RANKED_LAZY_ROWS, RankedList, type RankedItem, type RankedListProps } from './ranked-list'
export { SERIES_VIEW_LABELS, SeriesView, type SeriesColumn, type SeriesRow, type SeriesViewLabels, type SeriesViewProps } from './series-view'
export { TrendSpark, sparkGeometry, type TrendSparkProps } from './spark'
export { TILE_TONES, toTileTone, toneColor, toneSoft, type TileTone } from './tone-css'
