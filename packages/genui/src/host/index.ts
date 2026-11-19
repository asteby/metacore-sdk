// Adaptador de host de genui (`genui.host/v1`): `GenUIBody` + puentes genericos.
export { GenUIBody, type GenUIBodyProps } from './body'
export {
  GENUI_HOST_API,
  SourceDeniedError,
  isSourceDenied,
  type GenUIBodyDoc,
  type GenUIBodyLabels,
  type GenUIHostAdapter,
  type GenUIScope,
  type GenUISourceDef,
  type SourceRequest,
  type SourceResolver,
} from './contract'
export { createActionHandler, type ActionPolicy, type BlockedReason } from './actions'
export { collectBlockTypes, collectCustomBlockNames, isSafeInternalPath } from './paths'
export { URL_STATE_PREFIX, createHistoryUrlAdapter, decodeUrlStateValue, encodeUrlStateValue, type UrlStateHistory } from './url-state'
export { useGenUISources, DEFAULT_LABELS as GENUI_DEFAULT_LABELS, type UseSourcesOptions } from './use-sources'
