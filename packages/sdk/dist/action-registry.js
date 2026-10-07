import { createElement } from 'react';
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
const modals = new Map();
/**
 * Registra el modal del slug. Re-registrar el mismo slug reemplaza. Devuelve el
 * disposer (no borra si otro registro ya lo reemplazó).
 */
export function registerModalComponent(entry) {
    if (!entry.component && !entry.load)
        throw new Error(`modal ${entry.slug}: component o load es obligatorio`);
    const owned = { ...entry, owner: entry.owner ?? ownerOfSlug(entry.slug) };
    modals.set(entry.slug, owned);
    notify();
    return () => {
        if (modals.get(entry.slug) === owned) {
            modals.delete(entry.slug);
            notify();
        }
    };
}
export function getModalComponent(slug) {
    return modals.get(slug);
}
/** `<addon>.<nombre>` → `<addon>`; sin punto no hay dueño deducible. */
export function ownerOfSlug(slug) {
    const i = slug.indexOf('.');
    return i > 0 ? slug.slice(0, i) : undefined;
}
const recordActions = new Map();
let recordActionsSnapshot = [];
export function registerRecordAction(c, owner) {
    if (!c.run && !c.expand && !c.render)
        throw new Error(`record action ${c.id}: run, expand o render es obligatorio`);
    const row = { contribution: c, owner };
    recordActions.set(c.id, row);
    recordActionsChanged();
    return () => {
        if (recordActions.get(c.id) === row) {
            recordActions.delete(c.id);
            recordActionsChanged();
        }
    };
}
/** Snapshot estable (cambia de identidad sólo al registrar/quitar): apto para useSyncExternalStore. */
export function listRecordActions() {
    return recordActionsSnapshot;
}
function recordActionsChanged() {
    recordActionsSnapshot = [...recordActions.values()];
    notify();
}
/** Quita modales y acciones de registro de `addonKey` (fiber unbind). */
export function unregisterContributionsByOwner(addonKey) {
    if (!addonKey)
        return 0;
    let removed = 0;
    for (const [slug, m] of [...modals.entries()]) {
        if (m.owner === addonKey) {
            modals.delete(slug);
            removed += 1;
        }
    }
    let actionsRemoved = 0;
    for (const [id, a] of [...recordActions.entries()]) {
        if (a.owner === addonKey) {
            recordActions.delete(id);
            actionsRemoved += 1;
        }
    }
    if (actionsRemoved > 0)
        recordActionsSnapshot = [...recordActions.values()];
    removed += actionsRemoved;
    if (removed > 0)
        notify();
    return removed;
}
export function closeResultIsSuccess(result) {
    return (result === true ||
        (typeof result === 'object' && result !== null && result.ok === true));
}
export function adaptActionProps(p) {
    return {
        ...p,
        recordId: p.record?.id != null ? String(p.record.id) : '',
        payload: (p.record ?? {}),
        close: (result) => {
            p.onOpenChange(false);
            if (closeResultIsSuccess(result))
                p.onSuccess?.();
        },
    };
}
export function withAdaptedActionProps(component) {
    const Adapted = (p) => createElement(component, adaptActionProps(p));
    Adapted.displayName = `AdaptedAction(${component.displayName || component.name || 'Anonymous'})`;
    return Adapted;
}
