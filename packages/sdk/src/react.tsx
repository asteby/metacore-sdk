/**
 * React bindings: <MetacoreProvider>, <Slot>, hooks.
 *
 * Usage in host shell:
 *
 *   <MetacoreProvider client={client} registry={registry}>
 *     <Sidebar />
 *     <Routes>
 *       {useAddonRoutes().map(r => <Route {...r} />)}
 *     </Routes>
 *   </MetacoreProvider>
 *
 * Usage in an addon (inside its register() call):
 *
 *   api.registry.registerSlot({ name: "invoice.header.right", component: MyWidget });
 *
 * Usage anywhere in host:
 *
 *   <Slot name="invoice.header.right" payload={{ invoiceId }} />
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { MarketplaceClient } from "./client.js";
import type { Registry, SlotContribution } from "./registry.js";
// Runtime/host-facing manifest shape (the kernel's legacy/flat projection
// served by MarketplaceClient.manifests()), not the v3 authoring contract.
import type { LegacyManifest as Manifest, NavGroup } from "./types.js";

// The installed-addon catalog (manifests + navigation) drives the host's addon
// modules (sidebar module items, dynamic routes). It's fetched into state, so a
// full page reload starts empty and the addon modules pop in only once the two
// network calls resolve — the sidebar visibly gains its "Módulos" late. Persist
// the last result to localStorage and hydrate the initial state from it so a
// reload paints the addon modules instantly and revalidates in the background
// (stale-while-revalidate). The payload is plain serialisable data (manifests +
// nav groups whose icons are string slugs, not components).
const CATALOG_CACHE_KEY = "mc:sdk:catalog:v1";
interface CatalogCache {
  manifests: Manifest[];
  navigation: NavGroup[];
}

function readCatalogCache(): CatalogCache | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed &&
      Array.isArray(parsed.manifests) &&
      Array.isArray(parsed.navigation)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writeCatalogCache(manifests: Manifest[], navigation: NavGroup[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({ manifests, navigation }),
    );
  } catch {
    // quota / private mode — the cache is a nicety, never fatal
  }
}

/** An installed addon whose served version changed after this window loaded it. */
export interface AddonUpdate {
  key: string;
  /** Version this window is running (first seen after mount). */
  from: string;
  /** Version the host is now serving. */
  to: string;
}

interface Ctx {
  client: MarketplaceClient;
  registry: Registry;
  manifests: Manifest[];
  navigation: NavGroup[];
  loading: boolean;
  /**
   * Addons whose served version moved after this window first loaded them.
   * Hosts fiber-swap the federation container in place (AddonLoader remount)
   * and then call {@link acknowledgeRunningVersion} so the entry drops without
   * a full page reload. A non-empty list is a signal, not a hard-refresh order.
   */
  updatedAddons: AddonUpdate[];
  /**
   * Mark `key@version` as the version this window is now running — called by
   * the host after a successful L1 fiber swap (or first load). Clears that
   * addon from {@link updatedAddons}.
   */
  acknowledgeRunningVersion: (key: string, version: string) => void;
}

const MetacoreCtx = createContext<Ctx | null>(null);

function seedVersions(manifests: Manifest[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of manifests) {
    if (m.key && m.version) map.set(m.key, m.version);
  }
  return map;
}

export interface MetacoreProviderProps {
  client: MarketplaceClient;
  registry: Registry;
  children: ReactNode;
}

export function MetacoreProvider({ client, registry, children }: MetacoreProviderProps) {
  // Read the persisted catalog ONCE so the first render already has the addon
  // modules instead of an empty sidebar until the fetch resolves.
  const bootRef = useRef<CatalogCache | null | undefined>(undefined);
  if (bootRef.current === undefined) bootRef.current = readCatalogCache();
  const boot = bootRef.current;

  const [manifests, setManifests] = useState<Manifest[]>(boot?.manifests ?? []);
  const [navigation, setNavigation] = useState<NavGroup[]>(boot?.navigation ?? []);
  // Seeded from cache → don't block on the initial load; the fetch below still
  // runs and revalidates.
  const [loading, setLoading] = useState(!boot);

  // Versions this window is actually RUNNING: seeded from the first manifest
  // list that renders (cache or first fetch). Revalidations compare against
  // this baseline. After an L1 fiber swap the host calls
  // `acknowledgeRunningVersion` so the flag clears without a page reload.
  const runningVersions = useRef<Map<string, string> | null>(
    boot ? seedVersions(boot.manifests) : null,
  );
  const [updatedAddons, setUpdatedAddons] = useState<AddonUpdate[]>([]);

  const acknowledgeRunningVersion = useCallback((key: string, version: string) => {
    if (!key || !version) return;
    if (!runningVersions.current) runningVersions.current = new Map();
    runningVersions.current.set(key, version);
    setUpdatedAddons((prev) => (prev.some((u) => u.key === key) ? prev.filter((u) => u.key !== key) : prev));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const revalidate = async () => {
      try {
        const [m, n] = await Promise.all([client.manifests(), client.navigation()]);
        if (cancelled) return;
        setManifests(m);
        setNavigation(n);
        setLoading(false);
        writeCatalogCache(m, n);
        if (!runningVersions.current) {
          runningVersions.current = seedVersions(m);
          return;
        }
        const changed: AddonUpdate[] = [];
        for (const mf of m) {
          const from = runningVersions.current.get(mf.key);
          if (!from) {
            // First time this window sees the addon (install mid-session):
            // seed as running. The fiber loader mounts it; this is not an update.
            if (mf.version) runningVersions.current.set(mf.key, mf.version);
            continue;
          }
          if (mf.version && mf.version !== from) {
            changed.push({ key: mf.key, from, to: mf.version });
          }
        }
        setUpdatedAddons((prev) =>
          changed.length === prev.length &&
          changed.every((c, i) => prev[i]?.key === c.key && prev[i]?.to === c.to)
            ? prev
            : changed,
        );
      } catch {
        // network blip — keep serving the current state; next tick retries
      }
    };
    void revalidate();
    const onFocus = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void revalidate();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onFocus);
    }
    const interval = setInterval(revalidate, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onFocus);
      }
    };
  }, [client]);

  const value = useMemo<Ctx>(
    () => ({
      client,
      registry,
      manifests,
      navigation,
      loading,
      updatedAddons,
      acknowledgeRunningVersion,
    }),
    [client, registry, manifests, navigation, loading, updatedAddons, acknowledgeRunningVersion],
  );

  return <MetacoreCtx.Provider value={value}>{children}</MetacoreCtx.Provider>;
}

export function useMetacore(): Ctx {
  const v = useContext(MetacoreCtx);
  if (!v) throw new Error("useMetacore: missing <MetacoreProvider>");
  return v;
}

export function useAddonRoutes() {
  const { registry } = useMetacore();
  const [routes, setRoutes] = useState(registry.getRoutes());
  useEffect(() => registry.subscribe((e) => {
    if (e.type === "route" || e.type === "unbind") setRoutes(registry.getRoutes());
  }), [registry]);
  return routes;
}

export function useNavigation(): NavGroup[] {
  return useMetacore().navigation;
}

export interface SlotProps {
  name: string;
  payload?: Record<string, unknown>;
  /** Rendered when the slot has no contributors. */
  fallback?: ReactNode;
}

export function Slot({ name, payload, fallback = null }: SlotProps) {
  const { registry } = useMetacore();
  const [items, setItems] = useState<SlotContribution[]>(registry.getSlot(name));
  useEffect(
    () =>
      registry.subscribe((e) => {
        if (
          e.type === "unbind" ||
          (e.type === "slot" && e.contribution.name === name)
        ) {
          setItems(registry.getSlot(name));
        }
      }),
    [registry, name],
  );
  if (items.length === 0) return <>{fallback}</>;
  return (
    <>
      {items.map((it, i) => {
        const C = it.component;
        return <C key={i} {...(payload ?? {})} />;
      })}
    </>
  );
}
