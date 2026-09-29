// Host hook that loads the federated remote behind an action's `modal` slug.
//
// The SDK does not know how the host resolves addon remotes (Module Federation
// manifests, fibers, lazy bundles). When ActionModalDispatcher opens an action
// that declares `modal` and no component is registered yet, it asks the host to
// load it through this hook and waits for the registry to report the component.
// The dispatcher re-invokes the loader while it waits, so a loader installed
// after the first click still gets called.

export type FederatedActionLoader = (req: {
    model: string
    actionKey: string
    modal?: string
}) => void | Promise<void>

let loader: FederatedActionLoader | null = null

/** Install (or clear with `null`) the host's federated action loader. */
export function setFederatedActionLoader(fn: FederatedActionLoader | null): void {
    loader = fn
}

/**
 * Ask the host to load the remote for (model, actionKey). No-op without a
 * loader; loader errors are logged, never thrown — the dispatcher keeps waiting
 * until its timeout and then shows the explicit error.
 */
export function requestFederatedAction(req: { model: string; actionKey: string; modal?: string }): void {
    if (!loader) return
    try {
        const pending = loader(req)
        if (pending && typeof (pending as Promise<void>).catch === 'function') {
            ;(pending as Promise<void>).catch((err) => {
                console.warn('[metacore] federated action loader failed', req, err)
            })
        }
    } catch (err) {
        console.warn('[metacore] federated action loader failed', req, err)
    }
}
