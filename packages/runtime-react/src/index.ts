// Public surface — keep names stable. `ActionMetadata` is intentionally
// re-exported once from `./types` (the mirror used by runtime-react internally)
// and NOT re-exported from `./action-modal-dispatcher` here to avoid a
// duplicate-symbol conflict; consumers who want the canonical SDK type
// should import from `@asteby/metacore-sdk` directly.
export * from './types'
export * from './options-context'
export * from './dynamic-table'
export {
    DynamicKanban,
    type DynamicKanbanProps,
    deriveStages,
    groupByStage,
    isTransitionAllowed,
    applyOptimisticMove,
    selectCardColumns,
    UNASSIGNED_LANE,
} from './dynamic-kanban'
export {
    useStageAutomations,
    StageAutomationsButton,
    isTagColumn,
    automationFieldOptions,
    groupAutomationsByStage,
    activeAutomationCount,
    type StageAutomation,
    type StageAutomationAction,
    type StageAutomationActionType,
    type NewStageAutomation,
    type UseStageAutomationsResult,
    type StageAutomationsButtonProps,
} from './stage-automations'
export {
    DynamicView,
    resolveViewRenderer,
    readViewFromSearch,
    resolveActiveView,
    type DynamicViewProps,
} from './dynamic-view'
export {
    useDynamicFilters,
    type UseDynamicFiltersOptions,
    type UseDynamicFiltersResult,
} from './use-dynamic-filters'
export * from './dynamic-form'
export { FieldGrid, FieldCell, FieldLabel } from './field-grid'
export {
    ActionModalDispatcher,
    type ActionModalProps,
} from './action-modal-dispatcher'
export {
    ModelActionToolbar,
    useModelActions,
    type ModelActionToolbarProps,
    type ActionPlacement,
} from './model-action-toolbar'
export * from './addon-loader'
export {
    AddonLayoutProvider,
    useAddonLayout,
    useAddonLayoutControl,
    useDeclareAddonLayout,
    type AddonLayout,
    type AddonLayoutProviderProps,
} from './addon-layout-context'
export * from './slot'
export * from './capability-gate'
export {
    PermissionsProvider,
    useCan,
    usePermissionsActive,
    makeCan,
    capabilityForActionKey,
    modelCapability,
    gateTableMetadata,
    resolveRowActions,
    type CanFn,
    type PermissionsProviderProps,
} from './permissions-context'
export {
    useDynamicRowActions,
    type UseDynamicRowActionsParams,
    type DynamicRowActions,
} from './dynamic-row-actions'
export {
    PermissionsManager,
    moduleActionCapability,
    moduleCapabilities,
    grantedCountForModule,
    capabilitySetsEqual,
    defaultActionIcon,
    normalizeCatalogGroups,
    flattenGroups,
    filterModuleGroups,
    type PermissionsManagerProps,
    type PermissionsCatalog,
    type GroupedPermissionsCatalog,
    type FlatPermissionsCatalog,
    type ModuleGroup,
    type PermissionModuleDef,
    type PermissionActionDef,
    type GeneralPermissionDef,
    type RoleDef,
    type RoleInput,
} from './permissions-manager'
export * from './org-runtime-context'
export * from './org-runtime-provider'
export * from './navigation-builder'
export * from './i18n-provider'
export * from './api-context'
export * from './metadata-cache'
export {
    ADDON_MANIFEST_CHANGED_TYPE,
    wireHotSwapInvalidation,
    useManifestHotSwapSubscriber,
    type AddonManifestChangedMessage,
    type ManifestHotSwapClient,
    type WireHotSwapInvalidationOptions,
} from './manifest-hotswap-subscriber'
export {
    useHotSwapReload,
    applyHotSwapReload,
    withVersionParam,
    clearFederationContainer,
    shortenHash,
    type HotSwapReloadStrategy,
    type HotSwapReloadConfig,
    type HotSwapReloadAction,
    type HotSwapReloadDeps,
    type UseHotSwapReloadResult,
} from './hotswap-reload-policy'
export * from './dynamic-icon'
export type {
    ColumnFilterConfig,
    FilterOption as DynamicColumnFilterOption,
    GetDynamicColumns,
    DynamicIconComponent,
} from './dynamic-columns-shim'
export {
    defaultGetDynamicColumns,
    makeDefaultGetDynamicColumns,
    relationKeyFor,
    resolveRelationLabel,
    type DynamicColumnsHelpers,
} from './dynamic-columns'
export { humanizeToken } from './dynamic-columns-helpers'
export {
    UrlChip,
    FileChip,
    ImageThumbnail,
    MediaValue,
    RichText,
    linkifyText,
    classifyUrl,
    isImageUrl,
    isFileUrl,
    ensureHref,
    smartUrlLabel,
    fileNameFromUrl,
    splitTrailingPunct,
    type UrlKind,
    type LinkifyOptions,
} from './rich-url'
export {
    CollectionCell,
    formatScalar,
    prettifyKey,
    countLabel,
    type CollectionCellProps,
    type Translate as CollectionCellTranslate,
} from './collection-cell'
export { NIL_UUID, isNilUuid, normalizeNilUuid } from './nil-uuid'
export { DynamicRecordDialog, ViewValue } from './dialogs/dynamic-record'
export type { DynamicRecordDialogProps, FieldDef, FieldOption, GetImageUrl } from './dialogs/dynamic-record'
export { CreateRecordDialog } from './dialogs/create-record-dialog'
export { ViewRecordDialog } from './dialogs/view-record-dialog'
export type {
    ModelKey,
    ModelSchema,
    CreateResult,
    RecordDialogProps,
    CreateRecordDialogProps,
    ViewRecordDialogProps,
} from './dialogs/types'
export { ExportDialog } from './dialogs/export'
export { ImportDialog } from './dialogs/import'
export {
    DynamicCRUDPage,
    type DynamicCRUDPageProps,
    type DynamicCRUDPageStrings,
    type DynamicCRUDPageClasses,
} from './dynamic-crud-page'
export {
    DynamicRelation,
    type DynamicRelationProps,
    type DynamicRelationStrings,
    type DynamicRelationKind,
    buildRelationFilterParams,
    buildCreatePayload,
    deriveRelationFormFields,
    relationRowKey,
} from './dynamic-relation'
export {
    DynamicRelations,
    resolveParentId,
    buildRelationFilters,
    type DynamicRelationsProps,
} from './dynamic-relations'
export {
    registerModelExtension,
    getModelExtension,
    clearModelExtensions,
    type ModelExtension,
    type ModelExtensionProps,
} from './model-extension-registry'
export {
    isColumnVisibleInTable,
    getSearchableColumnKeys,
} from './column-visibility'
export {
    useOptionsResolver,
    projectOption,
    type ResolvedOption,
    type OptionsMeta,
    type UseOptionsResolverArgs,
    type UseOptionsResolverResult,
} from './use-options-resolver'
export {
    setOrgConfigBridge,
    getOrgConfigBridge,
    resolveValidatorToken,
    type OrgConfigBridge,
} from './use-org-config-bridge'
export {
    registerValidator,
    getDependsOn,
    resolveDependsValue,
    getOptionsConfig,
    resolveOptionsSource,
} from './dynamic-form-schema'
export {
    ActivityValueRenderer,
    type ActivityValueRendererProps,
} from './activity-value-renderer'
export {
    ActivityDiff,
    type ActivityEvent,
    type ActivityDiffProps,
} from './activity-diff'
export {
    RecordHistory,
    type RecordHistoryProps,
} from './record-history'
export {
    ActivityTimeline,
    type ActivityTimelineProps,
} from './activity-timeline'
export {
    DashboardGrid,
    normalizeGroups,
} from './dashboard-grid'
export type {
    WidgetKind,
    WidgetSize,
    WidgetFormat,
    WidgetAccent,
    WidgetAggregate,
    WidgetWhereOp,
    DashboardWidgetQuery,
    DashboardWidgetCompare,
    DashboardWidgetSpec,
    WidgetSeriesPoint,
    WidgetData,
    DashboardWidgetGroup,
    LoadWidgetData,
    DashboardGridProps,
    DashboardGridStrings,
} from './dashboard-types'
export {
    StatWidget,
    BarWidget,
    LineWidget,
    AreaWidget,
    PieWidget,
    DonutWidget,
    ListWidget,
    ProgressWidget,
    type WidgetRenderProps,
} from './widgets/renderers'
export {
    WidgetRenderer,
    WidgetSkeleton,
    SIZE_SPAN,
    SIZE_CLASS,
    type WidgetRendererProps,
} from './widgets/widget-renderer'
export {
    WidgetCard,
    DeltaChip,
    WidgetEmpty,
    WidgetError,
    type WidgetCardProps,
} from './widgets/widget-card'
export {
    formatWidgetValue,
    formatAxisTick,
    formatDelta,
    accentClasses,
    paletteColor,
    CHART_PALETTE,
    type AccentClasses,
    type WidgetFormatCtx,
} from './widgets/widget-format'
