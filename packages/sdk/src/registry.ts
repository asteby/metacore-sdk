/**
 * Runtime registry an addon populates to contribute UI to the host.
 *
 * An addon's `Plugin.register(api)` pushes modals, routes, widgets and
 * action components. Host renders them through `<Slot>` and reads routes
 * to wire its router.
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
  /** Lower renders first. */
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
  | { type: "route"; contribution: RouteContribution }
  | { type: "modal"; contribution: ModalContribution }
  | { type: "action"; contribution: ActionContribution }
  | { type: "slot"; contribution: SlotContribution };

export interface RegistryListener {
  (event: RegistryEvent): void;
}

/**
 * Registry is shared across all addons within a single host shell.
 * The host creates exactly one and hands `AddonAPI` to each plugin.
 */
export class Registry {
  private routes: RouteContribution[] = [];
  private modals = new Map<string, ModalContribution>();
  private actions = new Map<string, ActionContribution>();
  private slots = new Map<string, SlotContribution[]>();
  private listeners = new Set<RegistryListener>();

  // ---- mutators used by addons via AddonAPI ----

  registerRoute(c: RouteContribution): void {
    this.routes.push(c);
    this.emit({ type: "route", contribution: c });
  }

  registerModal(c: ModalContribution): void {
    this.modals.set(c.slug, c);
    this.emit({ type: "modal", contribution: c });
  }

  registerAction(c: ActionContribution): void {
    this.actions.set(`${c.model}::${c.action}`, c);
    this.emit({ type: "action", contribution: c });
  }

  registerSlot(c: SlotContribution): void {
    const list = this.slots.get(c.name) ?? [];
    list.push(c);
    list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.slots.set(c.name, list);
    this.emit({ type: "slot", contribution: c });
  }

  // ---- readers used by the shell ----

  getRoutes(): RouteContribution[] {
    return this.routes.slice();
  }

  getModal(slug: string): ModalContribution | undefined {
    return this.modals.get(slug);
  }

  getAction(model: string, action: string): ActionContribution | undefined {
    return this.actions.get(`${model}::${action}`);
  }

  getSlot(name: string): SlotContribution[] {
    return this.slots.get(name)?.slice() ?? [];
  }

  subscribe(fn: RegistryListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: RegistryEvent): void {
    for (const l of this.listeners) l(e);
  }
}
