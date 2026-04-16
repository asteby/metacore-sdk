/**
 * Runtime registry an addon populates to contribute UI to the host.
 *
 * An addon's `Plugin.register(api)` pushes modals, routes, widgets and
 * action components. Host renders them through `<Slot>` and reads routes
 * to wire its router.
 */
/**
 * Registry is shared across all addons within a single host shell.
 * The host creates exactly one and hands `AddonAPI` to each plugin.
 */
export class Registry {
    routes = [];
    modals = new Map();
    actions = new Map();
    slots = new Map();
    listeners = new Set();
    // ---- mutators used by addons via AddonAPI ----
    registerRoute(c) {
        this.routes.push(c);
        this.emit({ type: "route", contribution: c });
    }
    registerModal(c) {
        this.modals.set(c.slug, c);
        this.emit({ type: "modal", contribution: c });
    }
    registerAction(c) {
        this.actions.set(`${c.model}::${c.action}`, c);
        this.emit({ type: "action", contribution: c });
    }
    registerSlot(c) {
        const list = this.slots.get(c.name) ?? [];
        list.push(c);
        list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        this.slots.set(c.name, list);
        this.emit({ type: "slot", contribution: c });
    }
    // ---- readers used by the shell ----
    getRoutes() {
        return this.routes.slice();
    }
    getModal(slug) {
        return this.modals.get(slug);
    }
    getAction(model, action) {
        return this.actions.get(`${model}::${action}`);
    }
    getSlot(name) {
        return this.slots.get(name)?.slice() ?? [];
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
