// Public surface — keep names stable. `ActionMetadata` is intentionally
// re-exported once from `./types` (the mirror used by runtime-react internally)
// and NOT re-exported from `./action-modal-dispatcher` here to avoid a
// duplicate-symbol conflict; consumers who want the canonical SDK type
// should import from `@asteby/metacore-sdk` directly.
export * from './types'
export * from './options-context'
export * from './dynamic-table'
export * from './dynamic-form'
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
    type CanFn,
    type PermissionsProviderProps,
} from './permissions-context'
export {
    PermissionsManager,
    moduleActionCapability,
    moduleCapabilities,
    grantedCountForModule,
    capabilitySetsEqual,
    defaultActionIcon,
    type PermissionsManagerProps,
    type PermissionsCatalog,
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
export { registerValidator } from './dynamic-form-schema'
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
