// Declarative views (view_type map/timeline/calendar/chart/split) and detail
// panels. This entry is light: the renderers are lazy chunks loaded by type
// through the registry; nothing here imports recharts or a map library.
export type {
    DeclarativeViewType,
    DeclarativeViewConfig,
    ViewDataSource,
    ViewRows,
    ViewListParams,
    ChartRequest,
    ViewRendererProps,
    PanelRendererProps,
    ViewRendererComponent,
    PanelRendererComponent,
    ViewRendererLoader,
    PanelRendererLoader,
} from './types'
export {
    DECLARATIVE_VIEW_TYPES,
    isDeclarativeViewType,
    registerViewRenderer,
    registerPanelRenderer,
    hasViewRenderer,
    hasPanelRenderer,
    preloadViewRenderer,
    DeclarativeView,
    DetailPanels,
    ViewSkeleton,
    type DeclarativeViewProps,
    type DetailPanelsProps,
} from './registry'
export {
    createApiViewDataSource,
    resolveCapabilityInput,
    pickItems,
    type ApiViewDataSourceOptions,
} from './data-source'
