// Cola de propuestas (sin UI): estado, aplicar, descartar, deshacer. La vista del diff
// (`ProposalReview`) se carga perezosa.
import { useCallback, useRef, useState } from 'react'
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
