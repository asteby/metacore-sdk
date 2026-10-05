// Record prefill registry — "ayudantes de captura" que un addon cuelga del
// formulario genérico de alta/edición de un modelo (DynamicRecordDialog).
//
// Caso de uso que lo motiva: fiscal_mexico aporta «Cargar constancia (CSF)»
// al alta de Customer/Supplier en CUALQUIER lugar donde aparezca el formulario
// (lista de Clientes, alta rápida del POS, CustomerPicker de cotizaciones,
// dynamic_select con «+»), sin que customers/pos/quotes sepan nada de México.
//
// Gating: un prefill sólo existe si el remote del addon dueño se cargó, y el
// host sólo carga remotes de addons INSTALADOS. Al desinstalar, el host hace
// unbind(addonKey) → unregisterRecordPrefillsByOwner(addonKey) y el botón
// desaparece sin recargar. Un prefill puede además declarar `permission` y
// `when(ctx)` para gatear por permiso o por estado del formulario.
//
// Mismo patrón que action-registry.ts (Map global + listeners para
// useSyncExternalStore) para no depender del puente de slots del host.
import type { ComponentType } from "react";

export type RecordFormMode = "create" | "edit";

export interface RecordPrefillProps {
  /** Modelo del formulario (p. ej. "Customer"). */
  model: string;
  mode: RecordFormMode;
  /** Valores vivos del formulario (claves = field.key, incluye fiscal_data.*). */
  values: Record<string, unknown>;
  /**
   * Mezcla `patch` en el formulario (mismo contrato que AssistInterview.onApply).
   * Sólo se aplican claves que el formulario declara; el resto se ignora.
   */
  applyValues: (patch: Record<string, unknown>) => void;
  /** Id del registro en edición (undefined en create). */
  recordId?: string;
}

export interface RecordPrefillContribution {
  /** Id estable, p. ej. "fiscal_mexico.csf". Re-registrar el mismo id reemplaza. */
  id: string;
  /** Modelos donde aparece. Acepta "Customer" o "customers.Customer". */
  models: string[];
  component: ComponentType<RecordPrefillProps>;
  /** Permiso requerido (el host lo evalúa con useCan). */
  permission?: string;
  modes?: RecordFormMode[];
  /** Mayor = primero. Default 0. */
  priority?: number;
}

interface OwnedPrefill {
  contribution: RecordPrefillContribution;
  owner?: string;
}

const registry = new Map<string, OwnedPrefill>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function notify() {
  snapshotVersion += 1;
  for (const l of [...listeners]) l();
}

const bare = (model: string) => model.split(".").pop() ?? model;

export function subscribeRecordPrefills(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Versión monotónica para useSyncExternalStore (snapshot estable). */
export function recordPrefillsVersion(): number {
  return snapshotVersion;
}

export function registerRecordPrefill(c: RecordPrefillContribution, owner?: string): () => void {
  registry.set(c.id, { contribution: c, owner });
  notify();
  return () => {
    const row = registry.get(c.id);
    if (row && row.contribution === c) {
      registry.delete(c.id);
      notify();
    }
  };
}

export function getRecordPrefills(model: string, mode: RecordFormMode): RecordPrefillContribution[] {
  const m = bare(model);
  return [...registry.values()]
    .map((r) => r.contribution)
    .filter((c) => c.models.some((x) => bare(x) === m))
    .filter((c) => !c.modes || c.modes.includes(mode))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/** Llamado por el host en el unbind del fiber del addon (desinstalar/deshabilitar). */
export function unregisterRecordPrefillsByOwner(addonKey: string): number {
  if (!addonKey) return 0;
  let removed = 0;
  for (const [id, row] of [...registry.entries()]) {
    if (row.owner === addonKey) {
      registry.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) notify();
  return removed;
}
