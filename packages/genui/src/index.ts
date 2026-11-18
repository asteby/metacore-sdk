export * from './types'
export * from './validate'
export { GenerativeUI, type GenerativeUIProps } from './generative-ui'
export * from './agent-result'
// genui/v2: contrato, validador y compatibilidad (ADR 0001 del SDK). Sin renderizadores todavía.
export { GENUI_ERROR_CODES, GenUIError, type GenUIErrorCode } from './errors'
export { FORBIDDEN_KEYS, GENUI_V2_LIMITS, GENUI_V2_VERSION, parseUISpecV2, type ParseV2Options, type ParseV2Result, type UISpecV2 } from './validate-v2'
export { GENUI_V1_BLOCK_TYPES, downgrade, parseGenUI, upgradeV1, type DowngradeReport, type DowngradeResult, type GenUICaps, type ParseGenUIResult } from './compat'
export { GENUI_V2_BLOCKS, GENUI_V2_SCHEMA } from './generated/genui-v2-schema'
export type * as GenUIV2Types from './generated/genui-v2'
// genui/v2 renderer: provider, registry and built-in blocks (ADR 0001 del SDK, fase 1).
export { GenUI, GENUI_BUILTIN_BLOCKS, type GenUIProps } from './render-v2'
export {
  GenUIProvider,
  getGenUIBlockRenderer,
  registerGenUIBlockRenderer,
  registeredGenUIBlocks,
  useGenUI,
  type GenUIActionRequest,
  type GenUIBlock,
  type GenUIBlockRenderer,
  type GenUIBlockRendererProps,
  type GenUIContextValue,
  type GenUIProviderProps,
  type GenUIRow,
  type GenUISources,
} from './registry'
export { renderMarkdown, type MarkdownOptions } from './markdown'
export { layoutDiagram } from './diagram'
export { formatMetric, toneFor } from './metric'
export { MAP_MAX_POINTS, MAP_PRECISIONS, mapLegend, normalizeMapPoints, type GenUIMapPoint, type MapPrecision } from './map-points'
export * from './page'
