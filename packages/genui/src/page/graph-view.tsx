// Renderizador del grafo de pagina (`genui.page-graph/v1`). Valida, poda por permiso/ajuste,
// compila a bloques de pagina y los pinta con `PageView`. Cada nodo va aislado: si su render
// lanza, solo el cae (con su `fallback_node` si lo declara, o con un aviso y reintento) y el
// resto de la pagina sigue. Los estados de carga/error/vacio de las fuentes son por bloque
// (los resuelven `section` y los bloques del nucleo); aqui no se duplican.
import { Component, useEffect, useMemo, useRef, type ErrorInfo, type ReactNode } from 'react'
import { Button, cn } from '@asteby/metacore-ui'
import { PageBlockFrameContext, PageBlockView, PageView, type PageBlockDef, type PageBlockFrame, type PageViewProps } from './blocks'
import { parsePageGraph, resolveGraph, type GraphError, type HiddenNode, type PageGraph } from './graph'

export interface PageGraphLabels {
  failed: string
  retry: string
  invalid: string
}

const LABELS: PageGraphLabels = { failed: 'Este bloque fallo al mostrarse.', retry: 'Reintentar', invalid: 'La pagina no es valida.' }

export interface PageGraphViewProps extends Omit<PageViewProps, 'ui' | 'can'> {
  /** Grafo sin confiar: se valida aqui. */
  graph: unknown
  /** Permisos efectivos (poda estatica de nodos con `visible.permission`). */
  can?: (permission: string) => boolean
  /** Ajustes de la organizacion/preset (poda estatica de nodos con `visible.setting`). */
  settings?: Record<string, unknown>
  /** Un nodo lanzo al renderizar (telemetria; no incluir datos del usuario). */
  onNodeError?: (info: { id: string; error: Error }) => void
  /** Grafo invalido: el host decide que mostrar a quien administra. */
  onInvalid?: (errors: GraphError[]) => void
  /** Nodos podados y por que (alimenta "Explain": por que no veo esto). */
  onResolved?: (info: { hidden: HiddenNode[] }) => void
  /** Textos ya traducidos. */
  labels?: Partial<PageGraphLabels>
}

interface BoundaryProps {
  id: string
  labels: PageGraphLabels
  fallback?: ReactNode
  onError?: (info: { id: string; error: Error }) => void
  children?: ReactNode
}

class NodeBoundary extends Component<BoundaryProps, { error: Error | null }> {
  override state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError?.({ id: this.props.id, error })
  }
  override render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div role='alert' data-genui-block='node-error' className='flex flex-col items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm'>
        <p className='m-0'>{this.props.labels.failed}</p>
        <Button size='sm' variant='secondary' onClick={() => this.setState({ error: null })}>
          {this.props.labels.retry}
        </Button>
      </div>
    )
  }
}

/** Pagina a partir de un grafo de bloques. Ver `README` ("Pagina como datos"). */
export function PageGraphView({ graph, can, settings, onNodeError, onInvalid, onResolved, labels, className, ...provider }: PageGraphViewProps) {
  const parsed = useMemo(() => parsePageGraph(graph), [graph])
  const resolved = useMemo(() => (parsed.ok ? resolveGraph(parsed.graph, { can, settings }) : null), [parsed, can, settings])
  const text = useMemo<PageGraphLabels>(() => ({ ...LABELS, ...labels }), [labels])

  useEffect(() => {
    if (!parsed.ok) onInvalid?.(parsed.errors)
  }, [parsed, onInvalid])
  useEffect(() => {
    if (resolved) onResolved?.({ hidden: resolved.hidden })
  }, [resolved, onResolved])

  // El marco es ESTABLE (no cambia de identidad entre renders: si no, React remontaria toda la pagina);
  // lo que cambia (fallbacks, textos, callback) se lee de una referencia viva.
  const live = useRef({ fallbacks: resolved?.fallbacks, text, onNodeError })
  live.current = { fallbacks: resolved?.fallbacks, text, onNodeError }
  const Frame = useMemo<PageBlockFrame>(
    () =>
      function GraphNodeFrame({ block, children }: { block: PageBlockDef; children: ReactNode }) {
        const id = block.id as string
        const { fallbacks, text: t, onNodeError: onError } = live.current
        const fb = fallbacks?.[id]
        // `contents`: el marco no crea caja, asi que no altera el layout ni las areas de la cuadricula.
        return (
          <div data-graph-node={id} style={{ display: 'contents' }}>
            <NodeBoundary id={id} labels={t} onError={onError} fallback={fb ? <PageBlockView block={fb} /> : undefined}>
              {children}
            </NodeBoundary>
          </div>
        )
      },
    [],
  )

  if (!parsed.ok || !resolved) {
    return (
      <p role='alert' data-genui-block='page-graph-invalid' className={cn('m-0 rounded-lg border border-destructive/40 p-3 text-sm', className)}>
        {text.invalid}
      </p>
    )
  }
  const g: PageGraph = parsed.graph
  return (
    <PageBlockFrameContext.Provider value={Frame}>
      <PageView ui={{ state: g.state, data: g.data, blocks: resolved.blocks }} can={can} className={className} {...provider} />
    </PageBlockFrameContext.Provider>
  )
}
