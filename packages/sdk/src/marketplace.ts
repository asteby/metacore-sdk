/**
 * Marketplace shapes — used by hub-server / hub catalog frontends.
 */

import type { Manifest } from "./types.js";

export type { Installation } from "./types.js";
export { METACORE_API_VERSION } from "./types.js";

export type {
  Manifest,
  Module,
  NavGroup,
  NavItem,
  FrontendSpec,
  BackendSpec,
  Capability,
  Permission,
  SettingDef,
  Option,
  ToolDef,
  ToolInputParam,
  ActionDef,
  FieldDef,
  HookDef,
  HookTarget,
  ModelExtension,
  ModelDefinition,
  ColumnDef,
  Signature,
} from "./types.js";

export type CapabilityKind =
  | "db:read"
  | "db:write"
  | "http:fetch"
  | "event:emit"
  | "event:subscribe";

export interface AddonVersion {
  version: string;
  published_at: string;
  checksum: string;
}

export interface CatalogAddon {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  featured: boolean;
  created_at: string;
  latest_version?: string;
  icon_type?: "brand" | "lucide" | "url" | "";
  icon_slug?: string;
  icon_color?: string;
}

export interface AddonDetail extends CatalogAddon {
  manifest?: Manifest;
  versions: AddonVersion[];
  download_url?: string;
}