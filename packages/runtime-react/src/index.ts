// Public surface — keep names stable. `ActionMetadata` is intentionally
// re-exported once from `./types` (the mirror used by runtime-react internally)
// and NOT re-exported from `./action-modal-dispatcher` here to avoid a
// duplicate-symbol conflict; consumers who want the canonical SDK type
// should import from `@asteby/metacore-sdk` directly.
export * from './types'
export * from './table-virtualization'
export {
    LicenseGate,
    LicenseExpiryBanner,
    LicenseStatusBadge,
    isLicenseOperable,
    isLicenseBlocking,
    isPresetEntitled,
    isTrialExpired,
    type LicenseGateProps,
    type LicenseExpiryBannerProps,
    type LicenseStatusBadgeProps,
    type LicenseState,
    type LicenseStatus,
    type LicenseBranding,
} from './license'
export * from './options-context'
export {
    extractServerError,
    extractFieldErrors,
    localizeFieldIssue,
    localizeFieldErrorMap,
    toastServerError,
    toastServerSuccess,
    type ExtractedError,
    type Translate,
    type FieldIssue,
} from './server-error'
export {
    parseRuleString,
    fieldValidationOf,
    checkValue,
    validateValues,
    bagHasErrors,
    exemptUnchangedRuleIssues,
    type ValidationSpec,
} from './validator'
export { VALIDATION_CATALOGS, validationCatalog, validationMessageKey } from './validation-catalog'
export {
    labelForValidationPath,
    labelsForValidationFields,
    formatFieldErrorsDescription,
    clearFieldErrorTree,
    lineItemErrorsFor,
} from './field-validation-ui'
export * from './dynamic-table'
export {
    DynamicKanban,
    type DynamicKanbanProps,
    deriveStages,
    groupByStage,
    isTransitionAllowed,
    applyOptimisticMove,
    applyStageOverrides,
    laneDeltasFromOverrides,
    selectCardColumns,
    isCardOverdue,
    refLaneSource,
    withGroupBy,
    withRefLanes,
    visibleCardFields,
    isEmptyCardValue,
    nextLaneCoordinates,
    UNASSIGNED_LANE,
} from './dynamic-kanban'
export { PortalDragOverlay, type PortalDragOverlayProps } from './portal-drag-overlay'
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
    useCustomStages,
    splitCustomStages,
    mergeLaneStages,
    resolveSmartLanes,
    smartLaneParams,
    cardMatchesStageFilters,
    customStageFilterFields,
    isCustomStageDraftValid,
    slugifyStageKey,
    emptyCustomStageFilter,
    AddStageColumn,
    CustomStageLaneMenu,
    CustomStageDialog,
    CustomStageDeleteDialog,
    StageConditionBuilder,
    StageConfigDialog,
    stageFilterOpSymbol,
    SmartLane,
    CUSTOM_STAGE_COLORS,
    CUSTOM_STAGE_FILTER_OPS,
    type CustomStage,
    type NewCustomStage,
    type CustomStageType,
    type CustomStageFilter,
    type CustomStageFilterOp,
    type UseCustomStagesResult,
    type StageConfigTarget,
    type StageConfigKind,
    type StageConditionBuilderProps,
    type StageConfigDialogProps,
} from './custom-stages'
export {
    useStageLayout,
    type StageLayout,
    type UseStageLayoutResult,
} from './stage-layout'
export {
    useStageOverrides,
    type StageOverridePatch,
    type UseStageOverridesResult,
} from './stage-overrides'
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
export { useDebouncedValue, SEARCH_DEBOUNCE_MS } from './use-debounced-value'
export {
    useOptimisticMutation,
    type UseOptimisticMutationOptions,
    type UseOptimisticMutationResult,
} from './use-optimistic-mutation'
export { useFlipAnimation, type UseFlipAnimationOptions } from './use-flip-animation'
export {
    usePersistedQuery,
    createPersistedSnapshot,
    type UsePersistedQueryOptions,
    type PersistedSnapshot,
    type PersistedSnapshotOptions,
    type PersistedEntry,
} from './use-persisted-query'
export {
    motionDuration,
    motionEasing,
    prefersReducedMotion,
    MOTION_DEFAULTS,
    type MotionDuration,
    type MotionEasing,
} from './motion'
export {
    useResource,
    useMutation,
    type ResourceState,
    type MutationState,
} from './use-resource'
export * from './dynamic-form'
export {
    FilePickButton,
    type FilePickButtonProps,
} from './file-pick-button'
export * from './barcode-scanner'
export * from './form-layout'
export * from './form-layout-ui'
export { FieldGrid, FieldCell, FieldLabel } from './field-grid'
export {
    ActionModalDispatcher,
    FEDERATED_ACTION_MODAL_TIMEOUT_MS,
    resolveFieldDefault,
    type ActionModalProps,
    type FieldDefaultContext,
} from './action-modal-dispatcher'
export { todayInZone, isTodayToken } from './calendar-date'
export { setFederatedActionLoader, type FederatedActionLoader } from './federated-action-loader'
export {
    ModelActionToolbar,
    useModelActions,
    type ModelActionToolbarProps,
    type ActionPlacement,
} from './model-action-toolbar'
export {
    resolveListPrimaryAction,
    actionReplacesCreate,
    type ListPrimaryActionInput,
    type ListPrimaryActionResult,
    type ListActionRef,
    type CreateMode,
} from './list-primary-action'
export {
    emitRecordMutation,
    emitRecordMutationSettled,
    subscribeRecordMutations,
    RECORD_MUTATION_EVENT,
    RECORD_MUTATION_SETTLE_DELAYS,
    type RecordMutationKind,
    type RecordMutationDetail,
} from './record-mutation-events'
export {
    DocumentFormDialog,
    resolveDocumentForms,
    scopeDocumentFormsToFilter,
    delegatedCreate,
    withoutDelegatedTypes,
    type DelegatedCreate,
    type DocumentFormDialogProps,
} from './document-form-dialog'
export {
    modelFromNavUrl,
    capabilityForNavItem,
    isNavItemAllowed,
    useNavItemVisible,
    type NavLeafLike,
} from './nav-permissions'
export {
    CfdiStampPanel,
    CfdiStampResultDialog,
    extractStampResult,
    type CfdiStampResult,
    type CfdiStampPanelProps,
    type CfdiStampResultDialogProps,
} from './cfdi-stamp-panel'
export { useRecordMutationTick } from './use-record-mutation-tick'
export * from './addon-loader'
export {
    PURGE_ADDON_MESSAGE,
    isAddonFrontendCacheUrl,
    purgeAddonFrontendCache,
    resolvePluginExports,
    composeDisposables,
    runDispose,
    type PurgeAddonMessage,
    type AddonRegisterModule,
    type ResolvedPlugin,
} from './addon-fiber'
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
    ApprovalPinDialog,
    approvalErrorMessage,
    type ApprovalPinDialogProps,
    type ApprovalPinSubmit,
} from './approval-pin-dialog'
export {
    ApprovalGateProvider,
    useApprovalGate,
    approvalCapability,
    approvalRequiredInfo,
    approvalGateAvailable,
    APPROVAL_PARKED_EVENT,
    APPROVAL_DECIDED_EVENT,
    type ApprovalGateValue,
    type ApprovalGrant,
    type ApprovalRequiredInfo,
    type RequestApprovalOptions,
} from './approval-gate'
export {
    useSupervisor,
    withApproval,
    type SupervisedAction,
    type SupervisorAuthorization,
    type AuthorizeOptions,
} from './supervised-action'
export {
    ReasonPromptDialog,
    useReasonPrompt,
    reasonRequiredInfo,
    DEFAULT_REASON_MIN,
    type ReasonPromptDialogProps,
    type ReasonPromptApi,
    type ReasonRequiredInfo,
    type RunWithReasonOptions,
} from './reason-prompt'
export {
    useDynamicRowActions,
    type UseDynamicRowActionsParams,
    type DynamicRowActions,
} from './dynamic-row-actions'
export {
    resolveRequiresAddon,
    setAddonInstallHandler,
    getAddonInstallHandler,
    requiresAddonName,
    useRequiresAddonLabel,
    RequiresAddonLock,
    RequiresAddonDialog,
    type RequiresAddon,
    type RequiresAddonDialogProps,
} from './requires-addon'
export { ColorPickerField, DEFAULT_ROLE_COLOR, normalizeHex } from './color-picker-field'
export {
    PermissionsManager,
    moduleActionCapability,
    moduleCapabilities,
    grantedCountForModule,
    capabilitySetsEqual,
    defaultActionIcon,
    suggestRoleIcon,
    normalizeCatalogGroups,
    flattenGroups,
    filterModuleGroups,
    groupModuleActions,
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
export {
    applySidebarLayout,
    collectFolderKeys,
    folderAccessCapability,
    coreRefKey,
    addonModelRefKey,
    addonUrlRefKey,
    urlRefKey,
    leafRefFor,
    normalizeNavPath,
    slugifyFolderKey,
    isValidFolderKey,
    layoutTreeFromNavGroups,
    type CatalogLeaf,
    type SidebarLayoutDoc,
    type SidebarLayoutNode,
    type AppliedNavGroup,
    type AppliedNavItem,
} from './apply-sidebar-layout'
export {
    SidebarLayoutManager,
    type SidebarLayoutManagerProps,
} from './sidebar-layout-manager'
export * from './org-runtime-context'
export * from './business'
// Primitivos de negocio (PaymentAllocator, AgingTable, ApprovalInbox,
// contribuciones/modales federados, tipos de documento y contratos de paneles).
// Ver primitives/index.ts para el mapa completo.
export * from './primitives'
export * from './org-runtime-provider'
export * from './navigation-builder'
export * from './i18n-provider'
export * from './api-context'
export * from './use-addon-settings'
export * from './use-edge-device'
export * from './use-print-document'
export * from './print-document-button'
export * from './use-org-document-templates'
export * from './document-template-editor'
export * from './metadata-cache'
export {
    RealtimeProvider,
    useRealtimeClient,
    useRealtimeDefault,
    useRealtime,
    useRealtimeStatus,
    useRealtimeInvalidate,
    useRealtimeTick,
    queryKeyMatchesEvent,
    type RealtimeContextValue,
    type RealtimeProviderProps,
    type UseRealtimeOptions,
    type UseRealtimeInvalidateOptions,
    type UseRealtimeTickOptions,
} from './realtime-context'
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
    resolveAvatarSrc,
    resolveMissingActorLabel,
    resolveActorDisplayName,
    resolveRelationLabel,
    type DynamicColumnsHelpers,
} from './dynamic-columns'
export { humanizeToken, localizeFieldLabel, translateMetadataLabel } from './dynamic-columns-helpers'
export type { MetadataTranslator } from './dynamic-columns-helpers'
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
    ImageStack,
    OptionBadge,
    statusColorFor,
    useIsDarkTheme,
} from './display-value'
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
export { normalizeRefFieldsForSubmit } from './dialogs/normalize-submit'
export type { DynamicRecordDialogProps, FieldDef, FieldOption, GetImageUrl } from './dialogs/dynamic-record'
export { CreateRecordDialog } from './dialogs/create-record-dialog'
export { EntitySelect } from './entity-select'
export type { EntitySelectProps, EntitySelectOption } from './entity-select'
export { RecordPickerAction, PickerCreateItem, JOINED_TRIGGER_CLASS, hasRecordPickerAction } from './record-picker-actions'
export type { RecordPickerActionProps } from './record-picker-actions'
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
    isEmbedded,
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
    registerAgentResultRenderer,
    resolveAgentResultRenderer,
    listAgentResultRenderers,
    clearAgentResultRenderers,
    useAgentResultRegistryVersion,
    AgentResultView,
    type AgentResult,
    type AgentResultRenderer,
    type AgentResultRendererOptions,
    type AgentResultRendererProps,
    type AgentResultViewProps,
} from './agent-result-registry'
export {
    isColumnVisibleInTable,
    isColumnVisibleInModal,
    isColumnVisibleInLineSubtable,
    AUDIT_SUBTABLE_COLUMN_KEYS,
    getSearchableColumnKeys,
} from './column-visibility'
export {
    batchGet,
    loadQueryPart,
    nameBatchTokens,
    narrowInToken,
    optionsBatchToken,
    optionsModelFromUrl,
    rememberInRows,
    invalidateQueryBatchData,
    resetQueryBatchCache,
    splitInToken,
    tokenForGet,
    type InListToken,
    type NarrowedIn,
    type QueryPart,
} from './query-batch'
export {
    useOptionsResolver,
    invalidateOptionsCache,
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
    getVisibleWhen,
    evaluateVisibleWhen,
    ATTRIBUTE_CLASSES_KEY,
    scopeValueFromFilterToken,
    buildListScopeValues,
    evaluateVisibleWhenForListScope,
    applyLineItemRowFormulas,
    computeLineItemTotals,
    toNumber,
} from './dynamic-form-schema'
export {
    BranchCreateGateProvider,
    useBranchCreateGate,
    type BranchCreateGateApi,
} from './branch-create-gate'
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
    AuditInfo,
    readAuditMeta,
    resolveAuditActor,
    SYSTEM_ACTOR_ID,
    type AuditInfoProps,
    type AuditActor,
} from './audit-info'
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
export { DashboardEmptyMockup } from './dashboard-empty-mockup'
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
export { AssistInterview, AssistCardView } from './assist-interview'
export type { AssistSession, AssistTurn, AssistQuestion, AssistCard, AssistProgressStep } from './assist-interview'
export {
    useAttributeClasses,
    resolveAttributeClasses,
    resetAttributeClassCache,
    type AttributeClass,
    type AttributeClassSection,
} from './attribute-classes'

// Página de documento (benchmark §5/§6): cabecera, badges, acciones por estado, botones inteligentes.
export * from './document'

// Option filter — hide options of a relation / dynamic picker from the manifest
// (`option_filter` / `optionFilter` on the field).
export { getOptionFilter, applyOptionFilter, optionPassesRule } from './option-filter'
export type { OptionFilter, OptionFilterRule } from './option-filter'

// Addons instalados / capacidades provistas — primitivo único de «¿qué hay
// instalado?» para hosts y remotes federados. Sin provider los hooks devuelven
// `undefined` (desconocido): el consumidor NUNCA debe asumir ausente.
export {
    InstalledAddonsProvider,
    useAddonInstalled,
    useCapabilityProvided,
    useInstalledAddons,
    type InstalledAddonsValue,
} from './installed-addons-context'

// Ayudantes de captura (registerRecordPrefill de @asteby/metacore-sdk) arriba
// del formulario genérico de un modelo; DynamicRecordDialog ya lo monta.
export { RecordPrefillBar, type RecordPrefillBarProps } from './record-prefill-bar'

// Acciones primarias / secundarias de un registro: una sola primaria
// destacada; compartir/imprimir/correo/chat al «Más…» de la fila y al pie del
// documento. Las aportadas por addons (registerRecordAction del SDK) sólo con
// su proveedor instalado y activo.
export {
    RowActionsMenu,
    RowActionMenuItem,
    RowActionsModelContext,
    type RowActionsMenuProps,
} from './row-actions-menu'
export {
    classifyActionPriority,
    isActionProviderActive,
    isRecordActionProviderActive,
    resolveRecordActions,
    splitActionsByPriority,
    useRecordActions,
    type ActionPriority,
    type PrioritizableAction,
    type RecordActionContext,
    type RecordActionContribution,
    type ResolvedRecordAction,
    type SplitActions,
} from './record-actions'
