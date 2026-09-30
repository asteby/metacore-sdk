// Registro por modelo de la «página de documento». Igual que
// `registerModelExtension`: singleton de módulo, se registra una vez al arrancar
// (o desde el `register()` federado de un addon) y la ruta de detalle del host
// compone la página sin código por modelo.
import type { DocumentContext, DocumentSpec, StatusMachine } from './types'

export interface DocumentPageRegistration {
    spec: DocumentSpec
    /**
     * Calcula derivados (`$.x`) a partir del registro y las fuentes cargadas —
     * p. ej. el estado fiscal a partir de fiscal_documents y el de cobro a
     * partir de saldo y vencimiento. Función pura, sin efectos.
     */
    derive?: (ctx: Omit<DocumentContext, 'derived'>) => Record<string, unknown>
}

const registry = new Map<string, DocumentPageRegistration>()

/**
 * Registra la página bajo `spec.model` y, opcionalmente, bajo alias (la ruta
 * `/m/<model>` puede llegar como `invoices` o `Invoice` según el enlace).
 */
export function registerDocumentPage(reg: DocumentPageRegistration, aliases: string[] = []): void {
    registry.set(reg.spec.model, reg)
    for (const a of aliases) registry.set(a, reg)
}

export function getDocumentPage(model: string): DocumentPageRegistration | undefined {
    return registry.get(model)
}

export function clearDocumentPages(): void {
    registry.clear()
}

/** Catálogo compartido de estados por id de máquina (lo usan las columnas `status` de las pestañas). */
export function findStatusMachine(spec: DocumentSpec, id: string): StatusMachine | undefined {
    return spec.statuses.find((s) => s.id === id) ?? spec.catalogs?.find((s) => s.id === id)
}
