const registry = new Map();
const keyOf = (model, actionKey) => `${model}::${actionKey}`;
export function registerActionComponent(model, actionKey, component) {
    registry.set(keyOf(model, actionKey), component);
}
export function getActionComponent(model, actionKey) {
    return registry.get(keyOf(model, actionKey));
}
export function hasActionComponent(model, actionKey) {
    return registry.has(keyOf(model, actionKey));
}
export function unregisterActionComponent(model, actionKey) {
    registry.delete(keyOf(model, actionKey));
}
