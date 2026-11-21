// Cola de propuestas (sin UI): estado, aplicar, descartar, deshacer. La vista del diff
// (`ProposalReview`) se carga perezosa.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Proposal } from './types'

export interface ProposalQueue {
    pending: Proposal[]
    /** Último parche aplicado, mientras se pueda deshacer. */
    applied: Proposal | null
    /** Entra a la cola (o se aplica directo si `apply: 'auto'`). */
    push: (p: Proposal) => void
    accept: (id: string) => void
    discard: (id: string) => void
    undo: () => void
}

/**
 * Cola de propuestas sobre unos valores. `apply` recibe el parche a fusionar; para el
 * deshacer se fusionan los valores previos de las claves tocadas.
 */
export function useProposalQueue(
    values: Record<string, unknown>,
    apply: (patch: Record<string, unknown>) => void,
): ProposalQueue {
    const [pending, setPending] = useState<Proposal[]>([])
    const [applied, setApplied] = useState<Proposal | null>(null)
    const valuesRef = useRef(values)
    valuesRef.current = values

    // La barra «Se aplicaron N campos» solo tiene sentido mientras esos valores siguen en el
    // formulario: si el anfitrión los reemplazó (recarga del registro, cambio de modo, reinicio),
    // se retira para no mostrar un «deshacer» de algo que ya no está.
    // Solo después de haberlos visto en el formulario (el anfitrión puede aplicarlos un render después).
    const seenApplied = useRef<Proposal | null>(null)
    useEffect(() => {
        if (!applied) {
            seenApplied.current = null
            return
        }
        const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
        const keys = Object.keys(applied.patch)
        const present = keys.some((k) => same(values[k], applied.patch[k]))
        if (present) seenApplied.current = applied
        else if (seenApplied.current === applied) setApplied(null)
    }, [values, applied])

    const commit = useCallback(
        (p: Proposal) => {
            // El "antes" se toma al aplicar (el usuario pudo teclear desde que llegó la propuesta).
            const previous: Record<string, unknown> = {}
            for (const k of Object.keys(p.patch)) previous[k] = valuesRef.current[k]
            apply(p.patch)
            setApplied({ ...p, previous })
        },
        [apply],
    )

    const push = useCallback(
        (p: Proposal) => {
            if (p.apply === 'auto') commit(p)
            else setPending((list) => [...list.filter((x) => x.graft !== p.graft), p])
        },
        [commit],
    )
    const pendingRef = useRef(pending)
    pendingRef.current = pending
    const appliedRef = useRef(applied)
    appliedRef.current = applied
    const accept = useCallback(
        (id: string) => {
            const p = pendingRef.current.find((x) => x.id === id)
            if (p) commit(p)
            setPending((list) => list.filter((x) => x.id !== id))
        },
        [commit],
    )
    const discard = useCallback((id: string) => setPending((list) => list.filter((x) => x.id !== id)), [])
    const undo = useCallback(() => {
        const a = appliedRef.current
        if (a) apply(a.previous)
        setApplied(null)
    }, [apply])

    return { pending, applied, push, accept, discard, undo }
}
