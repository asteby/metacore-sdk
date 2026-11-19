// Resolucion de las fuentes de un documento (`ui.data`) con el `SourceResolver`
// del host. Cada fuente es independiente: una que falla o se niega no tumba a
// las demas (error aislado, con reintento). Mientras llega una recarga o un poll
// se conserva el dato anterior (sin parpadeo).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SourceStatus } from '../page/context'
import type { GenUISources, GenUIRow } from '../registry'
import { isSourceDenied, type GenUIBodyLabels, type GenUIScope, type SourceResolver } from './contract'

export const DEFAULT_LABELS: GenUIBodyLabels = {
  sourceDenied: 'No tienes acceso a estos datos.',
  sourceError: 'No se pudieron cargar los datos.',
}

type Entry = { status: 'loading' | 'ready' | 'error'; rows?: GenUIRow[]; denied?: boolean }

export interface UseSourcesOptions {
  /** Poll de respaldo (ms). Sin valor: sin poll. */
  refetchIntervalMs?: number
  labels?: Partial<GenUIBodyLabels>
}

export function useGenUISources(
  data: Record<string, unknown> | undefined,
  resolver: SourceResolver | undefined,
  scope: GenUIScope,
  opts: UseSourcesOptions = {},
): { sources: GenUISources; sourceStatus: Record<string, SourceStatus> } {
  const defs = useMemo(() => Object.entries(data ?? {}), [data])
  // La identidad de lo declarado es su contenido, no la del objeto.
  const key = useMemo(() => JSON.stringify([scope.addon, scope.page, defs]), [scope.addon, scope.page, defs])
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const resolverRef = useRef(resolver)
  resolverRef.current = resolver
  const defsRef = useRef(defs)
  defsRef.current = defs
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const live = useRef(new Map<string, AbortController>())

  const load = useCallback((name: string, silent: boolean) => {
    const def = defsRef.current.find(([n]) => n === name)?.[1]
    live.current.get(name)?.abort()
    const ctl = new AbortController()
    live.current.set(name, ctl)
    const set = (e: Entry) => !ctl.signal.aborted && setEntries((prev) => ({ ...prev, [name]: e }))
    const r = resolverRef.current
    if (!r) return set({ status: 'error', denied: true })
    if (!silent) setEntries((prev) => ({ ...prev, [name]: { status: 'loading', rows: prev[name]?.rows } }))
    r.resolve({ name, def, scope: scopeRef.current, signal: ctl.signal }).then(
      (rows) => set({ status: 'ready', rows: Array.isArray(rows) ? rows : [] }),
      (err: unknown) => set({ status: 'error', denied: isSourceDenied(err) }),
    )
  }, [])

  useEffect(() => {
    const names = defsRef.current.map(([n]) => n)
    for (const n of names) load(n, false)
    const ctls = live.current
    const timer = opts.refetchIntervalMs ? setInterval(() => names.forEach((n) => load(n, true)), opts.refetchIntervalMs) : undefined
    return () => {
      if (timer) clearInterval(timer)
      ctls.forEach((c) => c.abort())
      ctls.clear()
    }
  }, [key, load, opts.refetchIntervalMs])

  const labels = { ...DEFAULT_LABELS, ...opts.labels }
  return useMemo(() => {
    const sources: GenUISources = {}
    const sourceStatus: Record<string, SourceStatus> = {}
    for (const [name] of defs) {
      const e = entries[name] ?? { status: 'loading' as const }
      if (e.rows) sources[name] = e.rows
      sourceStatus[name] =
        e.status === 'error'
          ? { status: 'error', error: e.denied ? labels.sourceDenied : labels.sourceError, retry: e.denied ? undefined : () => load(name, false) }
          : { status: e.status }
      // Una fuente en error no deja filas viejas a la vista.
      if (e.status === 'error') delete sources[name]
    }
    return { sources, sourceStatus }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, defs, labels.sourceDenied, labels.sourceError, load])
}
