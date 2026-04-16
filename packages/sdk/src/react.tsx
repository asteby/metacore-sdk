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
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { MarketplaceClient } from "./client.js";
import type { Registry, SlotContribution } from "./registry.js";
import type { Manifest, NavGroup } from "./types.js";

interface Ctx {
  client: MarketplaceClient;
  registry: Registry;
  manifests: Manifest[];
  navigation: NavGroup[];
  loading: boolean;
}

const MetacoreCtx = createContext<Ctx | null>(null);

export interface MetacoreProviderProps {
  client: MarketplaceClient;
  registry: Registry;
  children: ReactNode;
}

export function MetacoreProvider({ client, registry, children }: MetacoreProviderProps) {
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [navigation, setNavigation] = useState<NavGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, n] = await Promise.all([client.manifests(), client.navigation()]);
      if (cancelled) return;
      setManifests(m);
      setNavigation(n);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const value = useMemo<Ctx>(
    () => ({ client, registry, manifests, navigation, loading }),
    [client, registry, manifests, navigation, loading],
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
    if (e.type === "route") setRoutes(registry.getRoutes());
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
        if (e.type === "slot" && e.contribution.name === name) {
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
