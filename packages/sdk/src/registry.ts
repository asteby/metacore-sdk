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
 */

import type { ComponentType } from "react";

export interface RouteContribution {
  path: string;
  component: ComponentType<unknown>;
  /** Optional parent layout — defaults to the authenticated layout. */
  layout?: string;
}

export interface ModalContribution {
  /** Key used by manifest action defs (`actions[model][].modal`). */
  slug: string;
  component: ComponentType<ModalProps>;
}

export interface ActionContribution {
  model: string;
  action: string;
  component: ComponentType<ActionProps>;
}

export interface SlotContribution {
  /** Slot name: "invoice.header.right", "dashboard.widget", etc. */
  name: string;
  component: ComponentType<unknown>;
  /** Sort weight; higher renders first. Default 0. See docs/slot-priority.md. */
  priority?: number;
}

export interface ModalProps {
  payload: Record<string, unknown>;
  close: (result?: unknown) => void;
}

export interface ActionProps {
  recordId: string;
  payload: Record<string, unknown>;
  close: (result?: unknown) => void;
}

export type RegistryEvent =
  | { type: "route"; contribution: RouteContribution; owner?: string }
  | { type: "modal"; contribution: ModalContribution; owner?: string }
  | { type: "action"; contribution: ActionContribution; owner?: string }
  | { type: "slot"; contribution: SlotContribution; owner?: string }
  | { type: "unbind"; addonKey: string };

export interface RegistryListener {
  (event: RegistryEvent): void;
}

/** Mutators handed to an addon via AddonAPI — always scoped to one owner. */
export interface ScopedRegistry {
  registerRoute(c: RouteContribution): void;
  registerModal(c: ModalContribution): void;
  registerAction(c: ActionContribution): void;
  registerSlot(c: SlotContribution): void;
}

interface OwnedRoute {
  owner?: string;
  contribution: RouteContribution;
}

interface OwnedModal {
  owner?: string;
  contribution: ModalContribution;
}

interface OwnedAction {
  owner?: string;
  contribution: ActionContribution;
}

interface OwnedSlot {
  owner?: string;
  contribution: SlotContribution;
}

/**
 * Registry is shared across all addons within a single host shell.
 * The host creates exactly one and hands a {@link Registry.scope scoped}
 * view to each plugin so {@link Registry.unbind} can tear a fiber down.
 */
export class Registry {
  private routes: OwnedRoute[] = [];
  private modals = new Map<string, OwnedModal>();
  private actions = new Map<string, OwnedAction>();
  private slots = new Map<string, OwnedSlot[]>();
  private listeners = new Set<RegistryListener>();

  /**
   * Scoped mutators for one addon. Every contribution is tagged with
   * `addonKey` so a later {@link unbind} can drop them as a unit.
   */
  scope(addonKey: string): ScopedRegistry {
    return {
      registerRoute: (c) => this.registerRoute(c, addonKey),
      registerModal: (c) => this.registerModal(c, addonKey),
      registerAction: (c) => this.registerAction(c, addonKey),
      registerSlot: (c) => this.registerSlot(c, addonKey),
    };
  }

  /**
   * Drop every contribution owned by `addonKey`. Idempotent. Emits one
   * `{ type: "unbind" }` event so host subscribers (routes, slots, action
   * bridge) refresh. Returns how many contributions were removed.
   */
  unbind(addonKey: string): number {
    if (!addonKey) return 0;
    let removed = 0;

    const nextRoutes: OwnedRoute[] = [];
    for (const row of this.routes) {
      if (row.owner === addonKey) removed += 1;
      else nextRoutes.push(row);
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
      if (kept.length === 0) this.slots.delete(name);
      else this.slots.set(name, kept);
    }

    if (removed > 0) this.emit({ type: "unbind", addonKey });
    return removed;
  }

  // ---- mutators used by addons via AddonAPI ----

  registerRoute(c: RouteContribution, owner?: string): void {
    this.routes.push({ owner, contribution: c });
    this.emit({ type: "route", contribution: c, owner });
  }

  registerModal(c: ModalContribution, owner?: string): void {
    this.modals.set(c.slug, { owner, contribution: c });
    this.emit({ type: "modal", contribution: c, owner });
  }

  registerAction(c: ActionContribution, owner?: string): void {
    this.actions.set(`${c.model}::${c.action}`, { owner, contribution: c });
    this.emit({ type: "action", contribution: c, owner });
  }

  registerSlot(c: SlotContribution, owner?: string): void {
    const list = this.slots.get(c.name) ?? [];
    list.push({ owner, contribution: c });
    // Higher priority renders first — canonical across SDK and runtime-react.
    // See docs/slot-priority.md.
    list.sort(
      (a, b) => (b.contribution.priority ?? 0) - (a.contribution.priority ?? 0),
    );
    this.slots.set(c.name, list);
    this.emit({ type: "slot", contribution: c, owner });
  }

  // ---- readers used by the shell ----

  getRoutes(): RouteContribution[] {
    return this.routes.map((r) => r.contribution);
  }

  getModal(slug: string): ModalContribution | undefined {
    return this.modals.get(slug)?.contribution;
  }

  getAction(model: string, action: string): ActionContribution | undefined {
    return this.actions.get(`${model}::${action}`)?.contribution;
  }

  getSlot(name: string): SlotContribution[] {
    return this.slots.get(name)?.map((s) => s.contribution) ?? [];
  }

  subscribe(fn: RegistryListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: RegistryEvent): void {
    for (const l of this.listeners) l(e);
  }
}
