/**
 * Runtime registry an addon populates to contribute UI to the host.
 *
 * An addon's `Plugin.register(api)` pushes modals, routes, widgets and
 * action components. Host renders them through `<Slot>` and reads routes
 * to wire its router.
 *
 * Contributions are tagged with an owner addon key when registered through
 * {@link Registry.scope}. {@link Registry.unbind} drops every contribution
 * of that owner so a fiber can remount without leaking routes/actions/slots
 * — the Cordis dispose equivalent for the host UI registry.
 *
 * Write-through: modales, acciones de registro y slots se publican además en
 * los stores canónicos (action-registry.ts / slot-store.ts) con su addon
 * dueño, que es lo que leen ActionModalDispatcher, `<Slot>` de runtime-react y
 * los menús de acciones. Los getters de esta clase siguen sirviendo a quien
 * los use (sdk/react `<Slot>`, rutas), pero la fuente de verdad es el store.
 */
import { registerRecordPrefill, unregisterRecordPrefillsByOwner, } from "./record-prefill-registry.js";
import { registerActionComponent, registerModalComponent, registerRecordAction, unregisterActionComponentsByOwner, unregisterContributionsByOwner, withAdaptedActionProps, } from "./action-registry.js";
import { slotStore } from "./slot-store.js";
/**
 * Registry is shared across all addons within a single host shell.
 * The host creates exactly one and hands a {@link Registry.scope scoped}
 * view to each plugin so {@link Registry.unbind} can tear a fiber down.
 */
export class Registry {
    routes = [];
    modals = new Map();
    actions = new Map();
    slots = new Map();
    listeners = new Set();
    /**
     * Scoped mutators for one addon. Every contribution is tagged with
     * `addonKey` so a later {@link unbind} can drop them as a unit.
     */
    scope(addonKey) {
        return {
            registerRoute: (c) => this.registerRoute(c, addonKey),
            registerModal: (c) => this.registerModal(c, addonKey),
            registerAction: (c) => this.registerAction(c, addonKey),
            registerSlot: (c) => this.registerSlot(c, addonKey),
            registerRecordPrefill: (c) => {
                registerRecordPrefill(c, addonKey);
            },
            registerRecordAction: (c) => {
                registerRecordAction(c, addonKey);
            },
        };
    }
    /**
     * Drop every contribution owned by `addonKey`. Idempotent. Emits one
     * `{ type: "unbind" }` event so host subscribers (routes, slots, action
     * bridge) refresh. Returns how many contributions were removed.
     */
    unbind(addonKey) {
        if (!addonKey)
            return 0;
        let removed = 0;
        const nextRoutes = [];
        for (const row of this.routes) {
            if (row.owner === addonKey)
                removed += 1;
            else
                nextRoutes.push(row);
        }
        this.routes = nextRoutes;
        for (const [slug, row] of [...this.modals.entries()]) {
            if (row.owner === addonKey) {
                this.modals.delete(slug);
                removed += 1;
            }
        }
        for (const [key, row] of [...this.actions.entries()]) {
            if (row.owner === addonKey) {
                this.actions.delete(key);
                removed += 1;
            }
        }
        for (const [name, list] of [...this.slots.entries()]) {
            const kept = list.filter((row) => {
                if (row.owner === addonKey) {
                    removed += 1;
                    return false;
                }
                return true;
            });
            if (kept.length === 0)
                this.slots.delete(name);
            else
                this.slots.set(name, kept);
        }
        removed += unregisterRecordPrefillsByOwner(addonKey);
        // Stores canónicos: lo que este addon publicó por write-through (y lo que
        // registró directo con registerRecordAction) se va con él. No suma a
        // `removed` para no contar dos veces lo ya contado arriba.
        const canonical = unregisterActionComponentsByOwner(addonKey) +
            unregisterContributionsByOwner(addonKey) +
            slotStore.removeByOwner(addonKey);
        if (removed > 0 || canonical > 0)
            this.emit({ type: "unbind", addonKey });
        return removed;
    }
    // ---- mutators used by addons via AddonAPI ----
    registerRoute(c, owner) {
        this.routes.push({ owner, contribution: c });
        this.emit({ type: "route", contribution: c, owner });
    }
    registerModal(c, owner) {
        this.modals.set(c.slug, { owner, contribution: c });
        // Antes nadie leía este mapa: el dispatcher sólo conocía (modelo, acción).
        registerModalComponent({ slug: c.slug, component: c.component, owner });
        this.emit({ type: "modal", contribution: c, owner });
    }
    registerAction(c, owner) {
        this.actions.set(`${c.model}::${c.action}`, { owner, contribution: c });
        // El host puede re-registrar encima (alias de tabla, error boundary) al
        // escuchar el evento; sin host-bridge, esto basta para que el dispatcher
        // lo encuentre.
        if (c.component) {
            registerActionComponent(c.model, c.action, withAdaptedActionProps(c.component), owner);
        }
        this.emit({ type: "action", contribution: c, owner });
    }
    registerSlot(c, owner) {
        const list = this.slots.get(c.name) ?? [];
        list.push({ owner, contribution: c });
        // Higher priority renders first — canonical across SDK and runtime-react.
        // See docs/slot-priority.md.
        list.sort((a, b) => (b.contribution.priority ?? 0) - (a.contribution.priority ?? 0));
        this.slots.set(c.name, list);
        slotStore.register(c.name, c.component, { priority: c.priority, owner });
        this.emit({ type: "slot", contribution: c, owner });
    }
    // ---- readers used by the shell ----
    getRoutes() {
        return this.routes.map((r) => r.contribution);
    }
    getModal(slug) {
        return this.modals.get(slug)?.contribution;
    }
    getAction(model, action) {
        return this.actions.get(`${model}::${action}`)?.contribution;
    }
    getSlot(name) {
        return this.slots.get(name)?.map((s) => s.contribution) ?? [];
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    emit(e) {
        for (const l of this.listeners)
            l(e);
    }
}
