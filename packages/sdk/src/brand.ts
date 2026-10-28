/**
 * Product-identity contract every metacore host exposes at a stable URL:
 *
 *   GET {origin}/api/brand        JSON manifest
 *   GET {origin}/api/brand/icon   square mark
 *   GET {origin}/api/brand/logo   full identity (wordmark, else same as icon)
 *   GET {origin}/api/brand/og     1200×630 share card when shipped
 *
 * This is PRODUCT identity (Link, Ops, Pitsline, Hub), not tenant white-label.
 * Tenant artwork stays on GET /api/platform/branding.
 */

export const BRAND_SPEC = 1 as const;
export const BRAND_PATH = "/api/brand";

export type BrandAssetKind =
  | "icon"
  | "logo"
  | "og"
  | "logo-dark"
  | "favicon"
  | "maskable"
  | "monochrome"
  | "animated"
  | "animated-dark"
  | "assistant";

export interface BrandAsset {
  url: string;
  type: string;
  width?: number;
  height?: number;
}

/** Colour overrides for the dark variant of a product theme. */
export interface BrandThemeColors {
  primary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
}

export interface BrandTheme extends BrandThemeColors {
  dark?: BrandThemeColors;
  /** 2-4 `#rrggbb` stops, from -> to. */
  gradient?: string[];
  theme_color?: string;
  background_color?: string;
}

/** Declarative mascot skin carried by a product brand. */
export interface BrandMascotSkin {
  id: string;
  name?: string;
  tooth_shape: string;
  antenna: boolean;
  screen_tone: string;
  colors: Record<string, string>;
  face?: { stroke?: string; stroke_width?: number; tread_dot?: string };
}

export interface BrandAssistant {
  name?: string;
  avatar?: BrandAsset;
  mascot?: BrandMascotSkin;
}

export interface BrandManifest {
  spec: typeof BRAND_SPEC;
  key: string;
  name: string;
  color?: string;
  short_name?: string;
  description?: string;
  /** Display name per BCP-47 locale. */
  names?: Record<string, string>;
  /** Prefix for browser storage keys; defaults to `key`. */
  storage_namespace?: string;
  /** Content version (ETag-derived); appended to asset URLs as `?v=`. */
  version?: string;
  theme?: BrandTheme;
  assistant?: BrandAssistant;
  assets: {
    icon: BrandAsset;
    logo?: BrandAsset;
    og?: BrandAsset;
    logo_dark?: BrandAsset;
    favicon?: BrandAsset;
    maskable?: BrandAsset;
    monochrome?: BrandAsset;
    animated?: BrandAsset;
    animated_dark?: BrandAsset;
    assistant?: BrandAsset;
  };
}

/** Absolute URL of one brand artwork on a product origin. */
export function brandAssetURL(origin: string, kind: BrandAssetKind = "icon"): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${BRAND_PATH}/${kind}`;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function cleanColor(v: unknown): string | undefined {
  if (typeof v !== "string" || !HEX_RE.test(v)) return undefined;
  const h = v.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

function cleanString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function resolveURL(origin: string, url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return url;
  const base = origin.replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function cleanAsset(origin: string, v: unknown): BrandAsset | undefined {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  const url = cleanString(a.url);
  if (!url) return undefined;
  const out: BrandAsset = { url: resolveURL(origin, url), type: cleanString(a.type) ?? "" };
  if (typeof a.width === "number") out.width = a.width;
  if (typeof a.height === "number") out.height = a.height;
  return out;
}

function cleanColors(v: unknown): BrandThemeColors | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: BrandThemeColors = {};
  for (const k of ["primary", "accent", "background", "foreground"] as const) {
    const c = cleanColor(o[k]);
    if (c) out[k] = c;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanTheme(v: unknown): BrandTheme | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: BrandTheme = { ...(cleanColors(o) ?? {}) };
  const dark = cleanColors(o.dark);
  if (dark) out.dark = dark;
  if (Array.isArray(o.gradient)) {
    const g = o.gradient.map(cleanColor).filter((c): c is string => !!c);
    if (g.length >= 2 && g.length <= 4) out.gradient = g;
  }
  const tc = cleanColor(o.theme_color);
  if (tc) out.theme_color = tc;
  const bc = cleanColor(o.background_color);
  if (bc) out.background_color = bc;
  return Object.keys(out).length ? out : undefined;
}

function cleanAssistant(origin: string, v: unknown): BrandAssistant | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: BrandAssistant = {};
  const name = cleanString(o.name);
  if (name) out.name = name;
  const avatar = cleanAsset(origin, o.avatar);
  if (avatar) out.avatar = avatar;
  if (o.mascot && typeof o.mascot === "object" && cleanString((o.mascot as Record<string, unknown>).id)) {
    out.mascot = o.mascot as BrandMascotSkin;
  }
  return Object.keys(out).length ? out : undefined;
}

const ASSET_KEYS = [
  "icon",
  "logo",
  "og",
  "logo_dark",
  "favicon",
  "maskable",
  "monochrome",
  "animated",
  "animated_dark",
  "assistant",
] as const;

/**
 * Validates and sanitises a raw `/api/brand` payload. Unknown fields are
 * dropped, colours must be `#rgb`/`#rrggbb`, relative asset URLs are resolved
 * against `origin`. Returns null when the payload is not a spec-1 manifest.
 */
export function parseBrand(raw: unknown, origin = ""): BrandManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.spec !== BRAND_SPEC) return null;
  const key = cleanString(r.key);
  const name = cleanString(r.name);
  const rawAssets = r.assets && typeof r.assets === "object" ? (r.assets as Record<string, unknown>) : {};
  const icon = cleanAsset(origin, rawAssets.icon);
  if (!key || !name || !icon) return null;

  const assets: Record<string, BrandAsset> = { icon };
  for (const k of ASSET_KEYS) {
    if (k === "icon") continue;
    const a = cleanAsset(origin, rawAssets[k]);
    if (a) assets[k] = a;
  }
  const out: BrandManifest = { spec: BRAND_SPEC, key, name, assets: assets as BrandManifest["assets"] };
  const color = cleanColor(r.color);
  if (color) out.color = color;
  for (const k of ["short_name", "description", "storage_namespace", "version"] as const) {
    const s = cleanString(r[k]);
    if (s) out[k] = s;
  }
  if (r.names && typeof r.names === "object") {
    const names: Record<string, string> = {};
    for (const [loc, n] of Object.entries(r.names as Record<string, unknown>)) {
      const s = cleanString(n);
      if (s) names[loc] = s;
    }
    if (Object.keys(names).length) out.names = names;
  }
  const theme = cleanTheme(r.theme);
  if (theme) out.theme = theme;
  const assistant = cleanAssistant(origin, r.assistant);
  if (assistant) out.assistant = assistant;
  return out;
}

export interface FetchBrandInit {
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

/** Fetches and sanitises the product brand manifest of `origin` (default: same origin). */
export async function fetchBrand(origin = "", init: FetchBrandInit = {}): Promise<BrandManifest> {
  const f = init.fetch ?? globalThis.fetch;
  const base = origin.replace(/\/+$/, "");
  const res = await f(`${base}${BRAND_PATH}`, {
    signal: init.signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`brand: GET ${BRAND_PATH} -> ${res.status}`);
  const m = parseBrand(await res.json(), base);
  if (!m) throw new Error("brand: invalid manifest");
  return m;
}

/**
 * Picks the artwork for a colour mode with a fallback chain:
 * logo: logo_dark -> logo -> icon (dark) | logo -> icon (light);
 * mark: icon; animated: animated_dark -> animated (dark) | animated (light) -> null.
 */
export function pickLogo(
  m: BrandManifest,
  mode: "light" | "dark" = "light",
  kind: "logo" | "mark" | "animated" = "logo",
): BrandAsset | null {
  const a = m.assets;
  if (kind === "mark") return a.icon;
  if (kind === "animated") {
    return (mode === "dark" ? a.animated_dark ?? a.animated : a.animated) ?? null;
  }
  if (mode === "dark") return a.logo_dark ?? a.logo ?? a.icon;
  return a.logo ?? a.icon;
}

/** Namespaced browser-storage key: `${storage_namespace ?? key}:${name}`. */
export function brandStorageKey(m: Pick<BrandManifest, "key" | "storage_namespace">, name: string): string {
  return `${m.storage_namespace || m.key}:${name}`;
}
