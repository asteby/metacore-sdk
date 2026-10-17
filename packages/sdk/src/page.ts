/**
 * Federated pages (`manifest.frontend.pages[]`, Module Contract v3).
 *
 * A page is one `expose` of the addon's remote that default-exports a React
 * component. The host decides where it mounts from the manifest alone, before
 * downloading anything:
 *
 *   layout "shell"     → embedded, inside the host chrome: /a/<addon>/<path>/*
 *   layout "immersive" → full screen, no chrome:           /addons/<addon>/<path>/*
 *
 * Remote side:
 *
 *   // src/pages/control-tower.tsx  (exposed as "./pages/control-tower")
 *   import { definePage } from "@asteby/metacore-sdk/page";
 *   export default definePage(function ControlTower({ host, basePath }) { … });
 *
 * Inside the page, host services come from runtime-react hooks
 * (`useHostApi`, `useHostContext`, `useAddonNavigate`, `useBreadcrumbs`,
 * `usePageChrome`). No `register()` call is needed for pages: the manifest is
 * the registry.
 *
 * Kernel rules mirrored here (manifest/v3/ui.go) are the ones a host needs at
 * runtime; validation itself stays in the kernel.
 */

import type { ComponentType } from "react";

import type { FrontendPage } from "./generated/manifest-v3.js";
import {
  MaxPageBudgetKB,
  PageLayoutImmersive,
  PageLayoutShell,
} from "./generated/manifest-v3.js";
import type { AddonHostContext } from "./realtime.js";
import type { AddonLayout } from "./types.js";

export type { FrontendPage };

/** Props every page component receives from the host. */
export interface AddonPageProps {
  /** Host context (org, user, branch, locale, realtime…). */
  host: AddonHostContext;
  /**
   * Absolute URL prefix the page is mounted at, without trailing slash
   * (`/a/shipping/control-tower`). Deep links live below it.
   */
  basePath: string;
  /**
   * Route params: `"*"` is the deep-link remainder below `basePath`
   * (`"shipments/42"`), plus whatever the host router extracted.
   */
  params: Record<string, string>;
  /** The manifest entry being rendered (key, path, layout, title…). */
  page: Pick<FrontendPage, "key" | "path" | "title"> &
    Partial<Omit<FrontendPage, "key" | "path" | "title">>;
}

const PAGE_MARK = Symbol.for("metacore.addon-page");

/** A component returned by {@link definePage}. */
export type AddonPageComponent<P extends AddonPageProps = AddonPageProps> =
  ComponentType<P> & { readonly [PAGE_MARK]: true };

/**
 * Declare a federated page. Identity at runtime (returns the same component,
 * tagged), typed at compile time; the expose's default export must be this.
 *
 *   export default definePage(function Tower({ basePath }) { … })
 */
export function definePage<P extends AddonPageProps = AddonPageProps>(
  component: ComponentType<P>,
): AddonPageComponent<P> {
  if (typeof component !== "function" && typeof component !== "object") {
    throw new TypeError("definePage: expected a React component");
  }
  Object.defineProperty(component, PAGE_MARK, { value: true, enumerable: false });
  if (!(component as { displayName?: string }).displayName) {
    const name = (component as { name?: string }).name;
    if (name) (component as { displayName?: string }).displayName = name;
  }
  return component as AddonPageComponent<P>;
}

/** True for components produced by {@link definePage}. */
export function isAddonPage(value: unknown): value is AddonPageComponent {
  return (
    (typeof value === "function" || (typeof value === "object" && value !== null)) &&
    (value as Record<symbol, unknown>)[PAGE_MARK] === true
  );
}

/**
 * Pull the page component out of a loaded expose module. Accepts the shapes
 * bundlers produce (`{ default: C }`, `{ default: { default: C } }`, `C`).
 * Throws with an actionable message otherwise.
 */
export function resolvePageModule(mod: unknown, expose = "page"): ComponentType<AddonPageProps> {
  let cur: unknown = mod;
  for (let i = 0; i < 3; i++) {
    if (typeof cur === "function" || isAddonPage(cur)) return cur as ComponentType<AddonPageProps>;
    if (cur && typeof cur === "object" && "default" in cur) {
      cur = (cur as { default: unknown }).default;
      continue;
    }
    break;
  }
  // React.memo / forwardRef objects are valid components too.
  if (cur && typeof cur === "object" && "$$typeof" in cur) {
    return cur as ComponentType<AddonPageProps>;
  }
  throw new Error(
    `metacore: expose "${expose}" has no default-exported page component. ` +
      `Export one with definePage() from @asteby/metacore-sdk/page.`,
  );
}

// ---------------------------------------------------------------------------
// Routing helpers the host uses (mirrors manifest/v3/ui.go).
// ---------------------------------------------------------------------------

/** URL prefix of embedded pages (layout "shell"). */
export const EMBEDDED_PAGE_PREFIX = "/a";
/** URL prefix of full-screen pages (layout "immersive"). */
export const FULLSCREEN_PAGE_PREFIX = "/addons";

/**
 * Lazy host-provided modules a page may import (closed set, kernel
 * `v3.PageShares`). Each maps to the host capability it implies.
 */
export const PAGE_SHARES = {
  "@asteby/metacore-maps": "ui.maps",
  "maplibre-gl": "ui.maps",
  "@asteby/metacore-charts": "ui.charts",
  recharts: "ui.charts",
} as const;

export type PageShare = keyof typeof PAGE_SHARES;

/** True when `name` is an allowed page share. */
export function isPageShare(name: string): name is PageShare {
  return Object.prototype.hasOwnProperty.call(PAGE_SHARES, name);
}

/** Default and maximum per-page JS budget (gzip KB, shares excluded). */
export const DEFAULT_PAGE_BUDGET_KB: number = MaxPageBudgetKB;

/** Budget that applies to a page: `budget_kb` capped at the kernel max. */
export function pageBudgetKB(page: Pick<FrontendPage, "budget_kb">): number {
  const b = page.budget_kb ?? 0;
  return b > 0 ? Math.min(b, MaxPageBudgetKB) : MaxPageBudgetKB;
}

/** Page layout: its own, else the addon's `frontend.layout`, else "shell". */
export function effectivePageLayout(
  page: Pick<FrontendPage, "layout">,
  addonLayout?: string | null,
): AddonLayout {
  const l = page.layout || addonLayout || PageLayoutShell;
  return l === PageLayoutImmersive ? "immersive" : "shell";
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

/** Absolute mount path of a page (`/a/shipping/control-tower`). */
export function pageMountPath(
  addonKey: string,
  page: Pick<FrontendPage, "path" | "layout">,
  addonLayout?: string | null,
): string {
  const prefix =
    effectivePageLayout(page, addonLayout) === "immersive"
      ? FULLSCREEN_PAGE_PREFIX
      : EMBEDDED_PAGE_PREFIX;
  return `${prefix}/${encodeURIComponent(addonKey)}/${trimSlashes(page.path)}`;
}

/** Find the page whose `path` matches (exact, slashes ignored). */
export function findPage(
  pages: readonly FrontendPage[] | undefined | null,
  path: string,
): FrontendPage | undefined {
  const want = trimSlashes(path);
  return pages?.find((p) => trimSlashes(p.path) === want);
}

/** Result of {@link resolveAddonUrl}. */
export interface ResolvedAddonUrl {
  addonKey: string;
  /** Path below the addon (`control-tower/shipments/42`). */
  path: string;
  /** Matched page (longest `path` prefix), when the manifest declares one. */
  page?: FrontendPage;
  layout: AddonLayout;
  /** Host URL to navigate to. */
  href: string;
}

/**
 * Resolve a nav `addon://<key>/<path>` URL against the addon's
 * `frontend.pages[]` WITHOUT loading the remote. The longest page path that
 * prefixes `<path>` wins, and the remainder is kept as a deep link. Without a
 * matching page the addon's `frontend.layout` decides (legacy `registerRoute`
 * addons keep their full-screen URL unless they declared `shell`).
 * Returns `null` for anything that is not an `addon://` URL.
 */
export function resolveAddonUrl(
  url: string,
  frontend: { layout?: string | null; pages?: readonly FrontendPage[] | null } | null | undefined,
): ResolvedAddonUrl | null {
  const m = /^addon:\/\/([^/?#]+)\/?([^?#]*)([?#].*)?$/.exec(url);
  if (!m) return null;
  const addonKey = decodeURIComponent(m[1]);
  const path = trimSlashes(m[2] ?? "");
  const suffix = m[3] ?? "";
  let page: FrontendPage | undefined;
  for (const p of frontend?.pages ?? []) {
    const pp = trimSlashes(p.path);
    if ((path === pp || path.startsWith(`${pp}/`)) && (!page || pp.length > trimSlashes(page.path).length)) {
      page = p;
    }
  }
  const layout: AddonLayout = page
    ? effectivePageLayout(page, frontend?.layout)
    : frontend?.layout === PageLayoutShell
      ? "shell"
      : "immersive";
  const prefix = layout === "immersive" ? FULLSCREEN_PAGE_PREFIX : EMBEDDED_PAGE_PREFIX;
  const href = `${prefix}/${encodeURIComponent(addonKey)}${path ? `/${path}` : ""}${suffix}`;
  return { addonKey, path, page, layout, href };
}
