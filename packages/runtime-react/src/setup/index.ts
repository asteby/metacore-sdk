// Setup flow + health components (kernel `contributions.setup` / `.health`) and
// the unified addon configuration surface. Import from the package root or from
// `@asteby/metacore-runtime-react/setup` to pull only this slice.
export * from './types'
export * from './flow-model'
export { useSetupT, SETUP_MESSAGES_ES, SETUP_MESSAGES_EN } from './messages'
export { StepStatusBadge, type StepStatusBadgeProps } from './step-status-badge'
export { RecordsTable, copyText, type RecordsTableProps } from './records-table'
export { HealthCard, type HealthCardProps } from './health-card'
export { SetupFlow, type SetupFlowProps, type SetupCustomStepProps } from './setup-flow'
export { SetupFormStep, type SetupFormStepProps } from './setup-form-step'
export {
    AddonConfigSurface,
    clearConnectorLookupCache,
    type AddonConfigSurfaceProps,
    type AddonConfigAddon,
    type AddonConfigNotifier,
    type AddonSettingDef,
    type ConnectorEntry,
    type ConnectorCredentialField,
    type ConnectorFormLayout,
} from './addon-config-surface'
export * from './connector-form-model'
