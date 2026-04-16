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
import type { Manifest, NavGroup } from "./types.js";
interface Ctx {
    client: MarketplaceClient;
    registry: Registry;
    manifests: Manifest[];
    navigation: NavGroup[];
    loading: boolean;
}
export interface MetacoreProviderProps {
    client: MarketplaceClient;
    registry: Registry;
    children: ReactNode;
}
export declare function MetacoreProvider({ client, registry, children }: MetacoreProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useMetacore(): Ctx;
export declare function useAddonRoutes(): import("./registry.js").RouteContribution[];
export declare function useNavigation(): NavGroup[];
export interface SlotProps {
    name: string;
    payload?: Record<string, unknown>;
    /** Rendered when the slot has no contributors. */
    fallback?: ReactNode;
}
export declare function Slot({ name, payload, fallback }: SlotProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=react.d.ts.map