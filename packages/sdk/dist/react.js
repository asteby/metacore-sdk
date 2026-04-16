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
import { createContext, useContext, useEffect, useMemo, useState, } from "react";
const MetacoreCtx = createContext(null);
export function MetacoreProvider({ client, registry, children }) {
    const [manifests, setManifests] = useState([]);
    const [navigation, setNavigation] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [m, n] = await Promise.all([client.manifests(), client.navigation()]);
            if (cancelled)
                return;
            setManifests(m);
            setNavigation(n);
            setLoading(false);
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
