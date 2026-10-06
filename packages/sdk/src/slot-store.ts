// Store global de slots con nombre — el mismo que pinta `<Slot>` de
// runtime-react y donde escriben `Registry.registerSlot` (AddonAPI) y
// `registerDocumentContribution`. Antes cada capa tenía su mapa y una
// contribución hecha por AddonAPI no llegaba al `<Slot>` de runtime-react.
// Cada entrada lleva su addon dueño (`owner`) para filtrarla por instalado y
// soltarla en bloque al desmontar el remote (Registry.unbind).
import type { ComponentType } from "react";

export type SlotComponent<P = any> = ComponentType<P>;

export interface SlotEntry {
  id: string;
  component: SlotComponent;
  priority: number;
  /** Etiqueta libre para keys/diagnóstico. */
  source?: string;
  /** Addon dueño: si consta como no instalado, `<Slot>` no lo pinta. */
  owner?: string;
}

type Listener = () => void;

const EMPTY: SlotEntry[] = [];

export class SlotStore {
  private slots = new Map<string, SlotEntry[]>();
  private listeners = new Set<Listener>();

  register(
    slotId: string,
    component: SlotComponent,
    opts?: { priority?: number; source?: string; owner?: string },
  ): () => void {
    const entry: SlotEntry = {
      id: slotId,
      component,
      priority: opts?.priority ?? 0,
      source: opts?.source ?? opts?.owner,
      owner: opts?.owner,
    };
    // Higher priority renders first — canonical across SDK and runtime-react.
    // See docs/slot-priority.md. A new array per change keeps snapshots stable
    // for useSyncExternalStore.
    const list = [...(this.slots.get(slotId) ?? []), entry].sort(
      (a, b) => b.priority - a.priority,
    );
    this.slots.set(slotId, list);
    this.emit();
    return () => {
      const arr = this.slots.get(slotId);
      if (!arr || !arr.includes(entry)) return;
      const next = arr.filter((e) => e !== entry);
      if (next.length === 0) this.slots.delete(slotId);
      else this.slots.set(slotId, next);
      this.emit();
    };
  }

  get(slotId: string): SlotEntry[] {
    return this.slots.get(slotId) ?? EMPTY;
  }

  /** Quita todas las entradas de `owner`. Devuelve cuántas. */
  removeByOwner(owner: string): number {
    if (!owner) return 0;
    let removed = 0;
    for (const [id, list] of [...this.slots.entries()]) {
      const kept = list.filter((e) => e.owner !== owner);
      removed += list.length - kept.length;
      if (kept.length === list.length) continue;
      if (kept.length === 0) this.slots.delete(id);
      else this.slots.set(id, kept);
    }
    if (removed > 0) this.emit();
    return removed;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const l of [...this.listeners]) l();
  }
}

export const slotStore = new SlotStore();
