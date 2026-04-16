/**
 * Mirror of github.com/anthropic/metacore/kernel/manifest.
 * Keep this file in sync with manifest.go — generated types land here
 * via `metacore codegen` in CI.
 */
export declare const METACORE_API_VERSION: "2.0.0";
export interface Manifest {
    key: string;
    name: string;
    description?: string;
    version: string;
    category?: string;
    icon?: string;
    kernel?: string;
    requires?: Module[];
    models?: Module[];
    navigation?: NavGroup[];
    extensions?: ModelExtension[];
    settings?: SettingDef[];
    hooks?: Record<string, string>;
    actions?: Record<string, ActionDef[]>;
    model_definitions?: ModelDefinition[];
    events?: string[];
    lifecycle_hooks?: Record<string, HookDef[]>;
    i18n?: Record<string, Record<string, string>>;
    frontend?: FrontendSpec;
    capabilities?: Capability[];
    permissions?: Permission[];
    signature?: Signature;
    author?: string;
    website?: string;
    license?: string;
    readme?: string;
    screenshots?: string[];
    features?: string[];
    price?: string;
}
export interface Module {
    key: string;
    label: string;
}
export interface NavGroup {
    title: string;
    icon?: string;
    target?: string;
    items: NavItem[];
}
export interface NavItem {
    title: string;
    url?: string;
    icon?: string;
    model?: string;
    permission?: string;
    owner?: string;
    items?: NavItem[];
}
export interface FrontendSpec {
    entry: string;
    format: "federation" | "script";
    expose?: string;
    integrity?: string;
    /**
     * Global `window` property the remoteEntry.js assigns itself to. When
     * omitted the SDK derives it deterministically from the manifest key
     * (`metacore_<sanitized_key>`). The addon's build MUST register under the
     * same name — see `@originjs/vite-plugin-federation` `name` option.
     */
    container?: string;
}
export type CapabilityKind = "db:read" | "db:write" | "http:fetch" | "event:emit" | "event:subscribe";
export interface Capability {
    kind: CapabilityKind | string;
    target: string;
    reason?: string;
}
export interface Permission {
    model: string;
    scope: string;
    reason?: string;
}
export interface SettingDef {
    key: string;
    label: string;
    type: "text" | "number" | "boolean" | "select" | "password";
    default_value?: unknown;
    options?: Option[];
    secret?: boolean;
}
export interface Option {
    value: string;
    label: string;
}
export interface ActionDef {
    key: string;
    name: string;
    label: string;
    icon?: string;
    fields?: FieldDef[];
    requiresState?: string[];
    confirm?: boolean;
    confirmMessage?: string;
    modal?: string;
}
export interface FieldDef {
    name: string;
    label: string;
    type: string;
    required?: boolean;
    default?: unknown;
    options?: Option[];
    size?: number;
}
export interface HookDef {
    event: string;
    target: HookTarget;
    priority?: number;
    async?: boolean;
}
export interface HookTarget {
    type: "webhook" | "wasm_call" | "agent_task";
    url?: string;
    function?: string;
    prompt?: string;
}
export interface ModelExtension {
    model: string;
    columns?: ColumnDef[];
    actions?: ActionDef[];
}
export interface ModelDefinition {
    table_name: string;
    model_key: string;
    label: string;
    org_scoped?: boolean;
    soft_delete?: boolean;
    columns: ColumnDef[];
    table?: unknown;
    modal?: unknown;
}
export interface ColumnDef {
    name: string;
    type: string;
    size?: number;
    required?: boolean;
    index?: boolean;
    unique?: boolean;
    default?: string;
    ref?: string;
}
export interface Signature {
    developer_id: string;
    developer_name: string;
    verified: boolean;
    signed_at: string;
    algorithm: string;
    digest: string;
    value: string;
    checksums?: Record<string, string>;
}
export interface Installation {
    id: string;
    organization_id: string;
    addon_key: string;
    version: string;
    status: "enabled" | "disabled";
    source: "compiled" | "bundle" | "federated";
    settings: Record<string, unknown>;
    installed_at: string;
    enabled_at?: string;
    disabled_at?: string;
}
//# sourceMappingURL=types.d.ts.map