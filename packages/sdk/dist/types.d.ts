/**
 * Manifest types for the metacore SDK.
 *
 * The CANONICAL contract is Module Contract v3 — the SDK toolchain emits v3
 * manifests (`apiVersion: "asteby.com/v3"`) and the types below re-export the
 * tygo-generated v3 shapes from ./generated/manifest-v3.ts. Re-generate the
 * generated files with: pnpm codegen (runs `tygo generate`). Do NOT hand-edit
 * the generated files — edit the kernel's manifest/v3/types.go and regenerate.
 *
 * The legacy v2 types remain available as `Legacy*` aliases (and under their
 * original names via ./generated/manifest) so consumers that still reference
 * the v2 shape keep type-checking during the migration window. The kernel
 * dual-reads v2 for backwards compatibility.
 */
import "./generated/manifest-v3";
import "./generated/manifest";
export { APIVersion as METACORE_API_VERSION } from "./generated/manifest-v3";
export type { Manifest, Metadata, MetadataLocale, Icon, Compatibility, Requirement, Tenancy, Capability, Model, Column, Index, ForeignKey, Reference, ModelExtension, Contributions, NavGroup, NavItem, SlotContribution as ManifestSlotContribution, Action, ActionField, FieldOption, FieldValidation, Tool, Subscription, Handler, ExtensionPoints, PublishedEvent, PublishedSlot, Lifecycle, UpgradeStep, I18n, I18nBundle, RBAC, Role, PermissionDef, Setting, SettingOption, Billing, MeteredEvent, Preset, PresetAddon, Theme, ConnectorPack, ConnectorProvider, Signature, Frontend, } from "./generated/manifest-v3";
export type { Module, FrontendSpec, BackendSpec, Permission, SettingDef, Option, ToolDef, ToolInputParam, ActionDef, ActionTrigger, FieldDef, HookDef, HookTarget, ModelDefinition, RelationDef, ColumnDef, ValidationRule, } from "./generated/manifest";
export type { Manifest as LegacyManifest, Capability as LegacyCapability, NavGroup as LegacyNavGroup, NavItem as LegacyNavItem, ModelExtension as LegacyModelExtension, Signature as LegacySignature, MetadataLocale as LegacyMetadataLocale, } from "./generated/manifest";
export { APIVersion as METACORE_API_VERSION_V2 } from "./generated/manifest";
/**
 * AddonLayout selects how the host shell wraps the federated addon when it
 * mounts. Default (undefined / "shell") keeps the legacy behaviour: the addon
 * renders inside the host chrome (Sidebar, Topbar, breadcrumbs).
 *
 *   "shell"     — render inside the host chrome. Default; semantic equivalent
 *                 of leaving the field unset.
 *   "immersive" — render full-viewport, no chrome. The shell hides Sidebar,
 *                 Topbar and breadcrumbs while the addon is active and
 *                 restores them as soon as the user navigates away. Used by
 *                 POS, kitchen-display, signage and any other addon that
 *                 owns the whole screen.
 *
 * Mirrors `v3.Frontend.layout`. The v3 `Frontend` interface already carries an
 * optional `layout: string` field; this union narrows the accepted values for
 * SDK consumers.
 */
export type AddonLayout = "shell" | "immersive";
export type CapabilityKind = "db:read" | "db:write" | "http:fetch" | "event:emit" | "event:subscribe" | "cron:register" | "queue:produce" | "queue:consume" | "file-storage:write" | "secrets:read" | "time:wallclock";
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