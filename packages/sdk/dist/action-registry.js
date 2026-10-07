const registry = new Map();
const listeners = new Set();
const keyOf = (model, actionKey) => `${model}::${actionKey}`;
function notify() {
    for (const listener of [...listeners])
        listener();
}
/**
 * Subscribe to registry changes (register / unregister). Federated remotes
 * register after the host has already rendered, so readers use this with
 * `useSyncExternalStore` to pick the component up the moment it lands.
 * Returns the unsubscribe function.
 */
export function subscribeActionComponents(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
export function registerActionComponent(model, actionKey, component, owner) {
    registry.set(keyOf(model, actionKey), { component, owner });
    notify();
}
export function getActionComponent(model, actionKey) {
    return registry.get(keyOf(model, actionKey))?.component;
}
export function hasActionComponent(model, actionKey) {
    return registry.has(keyOf(model, actionKey));
}
export function unregisterActionComponent(model, actionKey) {
    if (registry.delete(keyOf(model, actionKey)))
        notify();
}
/** Drop every action modal owned by `addonKey`. Used on fiber unbind. */
export function unregisterActionComponentsByOwner(addonKey) {
    if (!addonKey)
        return 0;
    let removed = 0;
    for (const [key, row] of [...registry.entries()]) {
        if (row.owner === addonKey) {
            registry.delete(key);
            removed += 1;
        }
    }
    if (removed > 0)
        notify();
    return removed;
}
