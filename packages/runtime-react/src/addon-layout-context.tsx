// AddonLayoutContext — broadcast the active addon entry's layout selection
// (`shell` vs `immersive`) up to the host so it can hide/show its chrome
// (Sidebar, Topbar, breadcrumbs) when an immersive addon is mounted.
//
// Why a context rather than a prop on the host shell:
//
//   1. The host shell is rendered ABOVE the addon route in the tree, but the
//      decision about what layout the addon wants comes from the addon itself
//      (manifest.frontend.layout) which the AddonLoader knows about at mount
//      time. A bottom-up signal via context inverts the dependency cleanly.
//
//   2. Addon entries can swap layouts at runtime (think a kiosk-mode toggle
//      inside a POS). A context value reactively updates the host without
//      asking each route to wire props.
//
//   3. When the user navigates AWAY from an immersive addon, the AddonLoader
//      unmounts, its layout context updater fires `setLayout("shell")` from
//      a cleanup effect, and the chrome restores automatically.
//
// Host integration (starter-core, ops, …):
//
//   function AppShell({ children }) {
//     const layout = useAddonLayout()
//     const chrome = layout !== "immersive"
//     return (
//       <div className={chrome ? "grid grid-cols-[280px_1fr]" : "h-dvh w-dvw"}>
//         {chrome && <Sidebar />}
//         <main>{chrome && <Topbar />}{children}</main>
//       </div>
//     )
//   }
//
// The context defaults to `"shell"`, so apps that never mount an
// `<AddonLayoutProvider>` keep the legacy behaviour.

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react'
import type { AddonLayout } from '@asteby/metacore-sdk'

export type { AddonLayout }

interface AddonLayoutState {
    /** Active layout. `"shell"` (default) or `"immersive"`. */
    layout: AddonLayout
    /**
     * Imperative setter for the host or an addon-loader to mutate the active
     * layout. Exposed for advanced use; most callers should use
     * `useDeclareAddonLayout(layout)` from a route component, which scopes the
     * change to the route's mount lifetime.
     */
    setLayout: (layout: AddonLayout) => void
}

const defaultState: AddonLayoutState = {
    layout: 'shell',
    setLayout: () => {
        /* noop — provider missing; consumers degrade to legacy "shell" */
    },
}

const AddonLayoutContext = createContext<AddonLayoutState>(defaultState)

export interface AddonLayoutProviderProps {
    /** Initial layout — usually `"shell"`. */
    initial?: AddonLayout
    children: React.ReactNode
}

/**
 * Wrap the host app once, above the router outlet. The provider keeps the
 * currently-active layout in state; addon-loader and `useDeclareAddonLayout`
 * mutate it from below.
 */
export function AddonLayoutProvider({
    initial = 'shell',
    children,
}: AddonLayoutProviderProps) {
    const [layout, setLayout] = useState<AddonLayout>(initial)
    const value = useMemo<AddonLayoutState>(
        () => ({ layout, setLayout }),
        [layout],
    )
    return (
        <AddonLayoutContext.Provider value={value}>
            {children}
        </AddonLayoutContext.Provider>
    )
}

/**
 * Read the currently-active layout. The host shell calls this and decides
 * whether to render its chrome. Returns `"shell"` when no provider is
 * mounted, so apps that have not adopted immersive addons keep working.
 */
export function useAddonLayout(): AddonLayout {
    return useContext(AddonLayoutContext).layout
}

/**
 * Imperative API — the value returned mirrors `useAddonLayout()` but also
 * exposes the setter for hosts that need to flip the layout outside of a
 * route lifecycle (e.g. a hotkey forcing kiosk mode). Most addon entries do
 * NOT need this; prefer `useDeclareAddonLayout`.
 */
export function useAddonLayoutControl(): AddonLayoutState {
    return useContext(AddonLayoutContext)
}

/**
 * Declare the layout from the addon side. Mounts the value, restores
 * `"shell"` on unmount. Skip when `layout` is undefined so route components
 * can pass `manifest.frontend?.layout` directly without branching.
 *
 *   function PosEntry({ manifest }: { manifest: Manifest }) {
 *     useDeclareAddonLayout(manifest.frontend?.layout)
 *     return <PosScreen />
 *   }
 */
export function useDeclareAddonLayout(layout: AddonLayout | undefined): void {
    const { setLayout } = useAddonLayoutControl()
    // useCallback so the effect only re-runs on a real layout change, not on
    // every render of the consumer that happens to forward an inline literal.
    const apply = useCallback(setLayout, [setLayout])
    useEffect(() => {
        if (!layout || layout === 'shell') return
        apply(layout)
        return () => {
            apply('shell')
        }
    }, [layout, apply])
}
