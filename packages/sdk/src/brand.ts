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

export type BrandAssetKind = "icon" | "logo" | "og";

export interface BrandAsset {
  url: string;
  type: string;
  width?: number;
  height?: number;
}

export interface BrandManifest {
  spec: typeof BRAND_SPEC;
  key: string;
  name: string;
  color?: string;
  assets: {
    icon: BrandAsset;
    logo?: BrandAsset;
    og?: BrandAsset;
  };
}

/** Absolute URL of one brand artwork on a product origin. */
export function brandAssetURL(origin: string, kind: BrandAssetKind = "icon"): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${BRAND_PATH}/${kind}`;
}
