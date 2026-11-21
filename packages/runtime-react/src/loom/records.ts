// records.find: la capacidad mediada de Loom (RFC 0005). Una Part sin red (el lector de
// constancia) pregunta «¿ya existe un cliente con este RFC?» y el ANFITRIÓN contesta con su
// cliente de datos y los permisos del usuario. Reglas (contrato):
//   - solo modelos declarados en `recordsFind` de la Part/injerto;
//   - el usuario debe poder listar el modelo (`<modelo>.index`);
//   - igualdad exacta de UN campo (nombre simple), valor de 1 a 128 caracteres;
//   - como mucho RECORDS_FIND_MAX resultados, copiados y congelados;
//   - cada uso deja un evento `records_find` (modelo, campo, resultado, conteo), NUNCA el valor.
import { modelCapability } from '../permissions-context'
import { RECORDS_FIND_MAX, type LoomEvent, type RecordsFinder, type RecordsFindQuery } from './types'

const bare = (m: string) => m.split('.').pop() ?? m
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/

export class RecordsFindError extends Error {
    readonly code: 'not_declared' | 'forbidden' | 'invalid' | 'failed'
    constructor(code: RecordsFindError['code'], message: string) {
        super(message)
        this.name = 'RecordsFindError'
        this.code = code
    }
}

function freezeRow(row: Record<string, unknown>): Readonly<Record<string, unknown>> {
    const copy: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row ?? {})) copy[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v
    return Object.freeze(copy)
}

export interface RecordsCapOptions {
    /** Modelos declarados por la Part/injerto. */
    allowed: readonly string[] | undefined
    finder: RecordsFinder | undefined
    can: (permission: string) => boolean
    report: (e: LoomEvent) => void
    meta: { seam: string; graft: string; addon: string }
}

/** La capacidad `caps.records`, o undefined si la Part no la declaró o el host no la ofrece. */
export function makeRecordsCap(o: RecordsCapOptions) {
    if (!o.allowed?.length || !o.finder) return undefined
    const finder = o.finder
    const declared = new Set(o.allowed.map(bare))
    return {
        async find(q: RecordsFindQuery): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> {
            const model = String(q?.model ?? '')
            const field = String(q?.field ?? '')
            const audit = (outcome: 'ok' | 'denied' | 'error', count: number, reason?: string) =>
                o.report({ type: 'records_find', ...o.meta, model, field, outcome, count, reason })
            if (!declared.has(bare(model))) {
                audit('denied', 0, 'not_declared')
                throw new RecordsFindError('not_declared', `records.find: ${model} no está en needs.records.find`)
            }
            if (!o.can(modelCapability(bare(model), 'index'))) {
                audit('denied', 0, 'forbidden')
                throw new RecordsFindError('forbidden', `records.find: sin permiso para listar ${model}`)
            }
            const value = typeof q.value === 'string' ? q.value.trim() : ''
            if (!FIELD.test(field) || !value || value.length > 128) {
                audit('denied', 0, 'invalid')
                throw new RecordsFindError('invalid', 'records.find: campo o valor inválido (igualdad exacta de un campo)')
            }
            const limit = Math.min(RECORDS_FIND_MAX, Math.max(1, Math.floor(q.limit ?? 3)))
            try {
                const rows = await finder({ model, field, value, limit })
                const out = (Array.isArray(rows) ? rows : []).slice(0, limit).map(freezeRow)
                audit('ok', out.length)
                return Object.freeze(out)
            } catch {
                // El error del host puede traer el valor buscado: no se propaga ni se registra.
                audit('error', 0, 'failed')
                throw new RecordsFindError('failed', 'records.find: la búsqueda falló')
            }
        },
    }
}
