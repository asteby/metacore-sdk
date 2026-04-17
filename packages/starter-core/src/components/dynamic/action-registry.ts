// Shim: the canonical registry lives in @asteby/metacore-sdk. Kept as a local re-export
// so existing imports (`@/components/dynamic/action-registry`) keep working.
export {
    type ActionFieldDef,
    type ActionMetadata,
    type ActionModalProps,
    registerActionComponent,
    getActionComponent,
    hasActionComponent,
    unregisterActionComponent,
} from '@asteby/metacore-sdk'
