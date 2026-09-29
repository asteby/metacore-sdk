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
import { type ReactNode } from "react";
import type { MarketplaceClient } from "./client.js";
import type { Registry } from "./registry.js";
import type { LegacyManifest as Manifest, NavGroup } from "./types.js";
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
export interface MetacoreProviderProps {
    client: MarketplaceClient;
    registry: Registry;
    children: ReactNode;
}
export declare function MetacoreProvider({ client, registry, children }: MetacoreProviderProps): import("react").JSX.Element;
export declare function useMetacore(): Ctx;
export declare function useAddonRoutes(): import("./registry.js").RouteContribution[];
export declare function useNavigation(): NavGroup[];
export interface SlotProps {
    name: string;
    payload?: Record<string, unknown>;
    /** Rendered when the slot has no contributors. */
    fallback?: ReactNode;
}
export declare function Slot({ name, payload, fallback }: SlotProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=react.d.ts.map