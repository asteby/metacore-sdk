// Regla de `apply` de las propuestas (RFC 0005 §16.2). Sin dependencias: el diálogo la usa sin cargar la UI de Loom.
import type { DataClass } from './types'

/**
 * Modo efectivo de una propuesta: `auto` solo si el injerto/Part tiene revisión propia y ningún campo
 * del parche es `secret`. Cualquier otro caso es `review` (diff revisable).
 */
export function effectiveApply(
    requested: 'review' | 'auto' | undefined,
    selfReview: boolean,
    keys: readonly string[],
    fieldClasses: Readonly<Record<string, DataClass>> | undefined,
): 'review' | 'auto' {
    if (requested !== 'auto' || !selfReview) return 'review'
    return keys.some((k) => fieldClasses?.[k] === 'secret') ? 'review' : 'auto'
}
