const registry = new Map();
const keyOf = (model, actionKey) => `${model}::${actionKey}`;
export function registerActionComponent(model, actionKey, component, owner) {
    registry.set(keyOf(model, actionKey), { component, owner });
}
export function getActionComponent(model, actionKey) {
    return registry.get(keyOf(model, actionKey))?.component;
}
export function hasActionComponent(model, actionKey) {
    return registry.has(keyOf(model, actionKey));
}
export function unregisterActionComponent(model, actionKey) {
    registry.delete(keyOf(model, actionKey));
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
    return removed;
}
