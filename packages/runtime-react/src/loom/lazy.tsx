// Componentes de Loom con carga perezosa. El índice principal del paquete exporta ESTOS: el
// chunk compartido de federación del host solo lleva el núcleo (registro, proveedor, cola,
// regla de apply) y la UI de los seams (montaje, diff, inspector) baja cuando hay injertos.
// Implementación real e import directo: `@asteby/metacore-runtime-react/loom`.
import { lazy, Suspense } from 'react'
import { useLoomConfig } from './provider'
import { useHasGrafts } from './has'
import type { ProposalReviewProps } from './proposals'
import type { SeamProps } from './seam'
import type { ResolvedSeam, SeamContract } from './types'

const SeamImpl = lazy(() => import('./seam').then((m) => ({ default: m.Seam })))
const ReviewImpl = lazy(() => import('./proposals').then((m) => ({ default: m.ProposalReview })))
const InspectorImpl = lazy(() => import('./seam').then((m) => ({ default: m.SeamInspector })))

/** `<Seam>`: no carga nada si el seam no tiene injertos (ni el inspector está activo). */
export function Seam(props: SeamProps) {
    const has = useHasGrafts(props.contract.id)
    const cfg = useLoomConfig()
    if (!has && !cfg?.inspect) return null
    return (
        <Suspense fallback={props.loading ?? null}>
            <SeamImpl {...props} />
        </Suspense>
    )
}

/** Diff de propuestas: solo baja cuando hay algo pendiente o recién aplicado. */
export function ProposalReview(props: ProposalReviewProps) {
    if (!props.queue.pending.length && !props.queue.applied) return null
    return (
        <Suspense fallback={null}>
            <ReviewImpl {...props} />
        </Suspense>
    )
}

export function SeamInspector(props: { contract: SeamContract; resolved: ResolvedSeam }) {
    return (
        <Suspense fallback={null}>
            <InspectorImpl {...props} />
        </Suspense>
    )
}
