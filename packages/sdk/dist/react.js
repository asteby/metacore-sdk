import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
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
import { createContext, useContext, useEffect, useMemo, useRef, useState, } from "react";
// The installed-addon catalog (manifests + navigation) drives the host's addon
// modules (sidebar module items, dynamic routes). It's fetched into state, so a
// full page reload starts empty and the addon modules pop in only once the two
// network calls resolve — the sidebar visibly gains its "Módulos" late. Persist
// the last result to localStorage and hydrate the initial state from it so a
// reload paints the addon modules instantly and revalidates in the background
// (stale-while-revalidate). The payload is plain serialisable data (manifests +
// nav groups whose icons are string slugs, not components).
const CATALOG_CACHE_KEY = "mc:sdk:catalog:v1";
function readCatalogCache() {
    try {
        if (typeof localStorage === "undefined")
            return null;
        const raw = localStorage.getItem(CATALOG_CACHE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        return parsed &&
            Array.isArray(parsed.manifests) &&
            Array.isArray(parsed.navigation)
            ? parsed
            : null;
    }
    catch {
        return null;
    }
}
function writeCatalogCache(manifests, navigation) {
    try {
        if (typeof localStorage === "undefined")
            return;
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ manifests, navigation }));
    }
    catch {
        // quota / private mode — the cache is a nicety, never fatal
    }
}
const MetacoreCtx = createContext(null);
export function MetacoreProvider({ client, registry, children }) {
    // Read the persisted catalog ONCE so the first render already has the addon
    // modules instead of an empty sidebar until the fetch resolves.
    const bootRef = useRef(undefined);
    if (bootRef.current === undefined)
        bootRef.current = readCatalogCache();
    const boot = bootRef.current;
    const [manifests, setManifests] = useState(boot?.manifests ?? []);
    const [navigation, setNavigation] = useState(boot?.navigation ?? []);
    // Seeded from cache → don't block on the initial load; the fetch below still
    // runs and revalidates.
    const [loading, setLoading] = useState(!boot);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [m, n] = await Promise.all([client.manifests(), client.navigation()]);
            if (cancelled)
                return;
            setManifests(m);
            setNavigation(n);
            setLoading(false);
            writeCatalogCache(m, n);
        })();
        return () => {
            cancelled = true;
        };
    }, [client]);
    const value = useMemo(() => ({ client, registry, manifests, navigation, loading }), [client, registry, manifests, navigation, loading]);
    return _jsx(MetacoreCtx.Provider, { value: value, children: children });
}
export function useMetacore() {
    const v = useContext(MetacoreCtx);
    if (!v)
        throw new Error("useMetacore: missing <MetacoreProvider>");
    return v;
}
export function useAddonRoutes() {
    const { registry } = useMetacore();
    const [routes, setRoutes] = useState(registry.getRoutes());
    useEffect(() => registry.subscribe((e) => {
        if (e.type === "route")
            setRoutes(registry.getRoutes());
    }), [registry]);
    return routes;
}
export function useNavigation() {
    return useMetacore().navigation;
}
export function Slot({ name, payload, fallback = null }) {
    const { registry } = useMetacore();
    const [items, setItems] = useState(registry.getSlot(name));
    useEffect(() => registry.subscribe((e) => {
        if (e.type === "slot" && e.contribution.name === name) {
            setItems(registry.getSlot(name));
        }
    }), [registry, name]);
    if (items.length === 0)
        return _jsx(_Fragment, { children: fallback });
    return (_jsx(_Fragment, { children: items.map((it, i) => {
            const C = it.component;
            return _jsx(C, { ...(payload ?? {}) }, i);
        }) }));
}
