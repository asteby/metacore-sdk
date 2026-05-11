// AddonRoute — route wrapper that closes RFC-0001 D1 ("immersive end-to-end")
// on the host side.
//
// runtime-react already publishes the addon's declared layout via
// `useAddonLayout()` (set either as a prop on <AddonLoader> or via
// `useDeclareAddonLayout("immersive")` from the addon's entry component).
// This component is the host-side counterpart: it reads the context and
// either renders the addon inside the normal app shell (`layout === "shell"`,
// default) or strips the chrome away and pins the addon to the viewport
// (`layout === "immersive"`).
//
// Why a route-level wrapper rather than branching inside `AuthenticatedLayout`:
//
//   * `@asteby/metacore-ui` (where the shell primitive lives) does NOT depend
//     on `@asteby/metacore-runtime-react`, so it cannot import the addon
//     layout context directly. Adding the dependency would invert the layer
//     model (UI primitives must remain consumable without the runtime).
//
//   * `starter-core` already pulls in both packages as peer deps, so it is
//     the natural place to compose them. Apps that adopt the starter wire
//     this component once around their `<Outlet />` (or per-addon route).
//
//   * Keeping the switch at the route level means the immersive transition
//     is co-located with the route component — easy to reason about,
//     easy to unit-test, and the cleanup of `useDeclareAddonLayout` runs
//     on unmount without needing extra plumbing.
//
// Lifecycle of an immersive addon, end-to-end:
//
//   1. User navigates to /addons/kitchen-display.
//   2. <AddonRoute> mounts. `useAddonLayout()` returns "shell" (default).
//      The shell renders, then <AddonLoader> mounts inside it.
//   3. The addon's `register()` runs and its entry component is rendered.
//      That component calls `useDeclareAddonLayout("immersive")`.
//   4. The context flips to "immersive". <AddonRoute> re-renders and now
//      bypasses the shell, mounting the addon under `fixed inset-0`.
//      React preserves the addon's mounted state across the switch because
//      the inner subtree (the AddonLoader + its children) is referentially
//      stable — we only swap the wrapping `<div>`.
//   5. User navigates away. AddonLoader unmounts, its useDeclareAddonLayout
//      cleanup fires, the context reverts to "shell". The shell renders for
//      the next route as usual.
//
// The "flash" risk in step 3 is real (shell renders for one frame before the
// addon swaps to immersive). For addons that always run immersive — POS,
// kitchen-display, signage — the caller should pass `layout="immersive"` as
// a prop so AddonRoute starts immersive immediately, skipping the shell
// frame. The `layout` prop short-circuits the context read for that case.

import { useEffect, type ReactNode } from 'react'
import {
    useAddonLayout,
    useAddonLayoutControl,
    type AddonLayout,
} from '@asteby/metacore-runtime-react'

export interface AddonRouteProps {
    /**
     * Route content — typically an `<Outlet />` or the addon's entry
     * component wrapped in `<AddonLoader>`.
     */
    children: ReactNode
    /**
     * Optional layout hint. When provided, AddonRoute uses this value
     * directly and ignores the context, eliminating the one-frame shell
     * flash for routes that are known up-front to be immersive (POS,
     * kitchen-display, signage). When omitted, AddonRoute defers to
     * `useAddonLayout()` so the inner addon can flip the layout via
     * `useDeclareAddonLayout(...)` after mount.
     */
    layout?: AddonLayout
    /**
     * Extra CSS classes applied to the immersive wrapper. Defaults are
     * already viewport-pinned (`fixed inset-0 z-50 overflow-hidden`) —
     * pass extras (e.g. background colour) without re-stating those.
     */
    immersiveClassName?: string
    /**
     * Render the shell when `layout === "shell"`. Most apps pass their
     * `<AuthenticatedLayout>` here. Optional because some setups already
     * wrap the router outlet in the shell at a higher level and only
     * want AddonRoute to handle the immersive escape hatch — in that
     * case, omit `shell` and AddonRoute renders `children` verbatim
     * when not immersive.
     */
    shell?: (content: ReactNode) => ReactNode
}

/**
 * Wraps an addon route and switches between the app shell and a full-
 * viewport "immersive" rendering based on the addon's declared layout.
 *
 * @example
 *   // app router file
 *   <AddonRoute shell={(c) => <AuthenticatedLayout>{c}</AuthenticatedLayout>}>
 *     <Outlet />
 *   </AddonRoute>
 */
export function AddonRoute({
    children,
    layout: layoutProp,
    immersiveClassName,
    shell,
}: AddonRouteProps) {
    const ctxLayout = useAddonLayout()
    const { setLayout } = useAddonLayoutControl()
    const layout: AddonLayout = layoutProp ?? ctxLayout

    // When a static prop pins the route to a layout, push that value into
    // the context so any consumer downstream (e.g. an addon that also
    // reads `useAddonLayout()` for cosmetic decisions) sees the same
    // value. Restore "shell" on unmount so navigating to a non-immersive
    // sibling route brings the chrome back.
    useEffect(() => {
        if (!layoutProp) return
        if (layoutProp === ctxLayout) return
        setLayout(layoutProp)
        return () => {
            setLayout('shell')
        }
        // ctxLayout intentionally excluded — we only want to push on a
        // change of the static prop, not chase the context value we just
        // wrote (would create a feedback loop).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layoutProp, setLayout])

    if (layout === 'immersive') {
        // No shell, no body scroll-lock from the sidebar — the addon owns
        // the viewport. `isolation-auto` keeps stacking contexts behaving;
        // `z-50` keeps Sonner toasts/Radix portals above the addon while
        // still letting the addon paint over the rest of the host UI.
        return (
            <div
                data-metacore-addon-layout="immersive"
                className={[
                    'fixed inset-0 z-50 overflow-hidden bg-background',
                    immersiveClassName ?? '',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {children}
            </div>
        )
    }

    if (shell) {
        return <>{shell(children)}</>
    }
    return <>{children}</>
}

export default AddonRoute
