// GenUIBody: cuerpo reutilizable de un documento genui/v2 dentro de un host.
// Es el UNICO camino de render de `ui` para paginas declarativas, widgets de
// Tablero y el chat de la IA: una sola resolucion de fuentes y un solo juego de
// puentes. Lo que depende del host entra por {@link GenUIHostAdapter}
// (contrato `genui.host/v1`); aqui no hay router, HTTP ni i18n concretos.
//
// Reutiliza `GenUIProvider` + `PageView` (PageProvider/PageBlocks): no dibuja
// ningun bloque por su cuenta. Las referencias a bloques compartidos
// (`{type:"ref"}`) las expande el backend: aqui el `ui` llega expandido.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { PageView } from '../page/blocks'
import { createPageBus } from '../page/context'
import { registerPageBlock } from '../page/custom'
import { GenUIProvider } from '../registry'
import type { GenUIActionRequest } from '../registry'
import type { GenUIBodyDoc, GenUIHostAdapter, GenUIScope } from './contract'
import { collectBlockTypes, collectCustomBlockNames, isSafeInternalPath } from './paths'
import { useGenUISources } from './use-sources'

export interface GenUIBodyProps {
  /** Identidad del documento: bus del host y llaves de carga (`page` unico por addon / mensaje). */
  scope: GenUIScope
  ui: GenUIBodyDoc
  host: GenUIHostAdapter
  /** Refleja `ui.url_state` en la URL (con `host.urlState`). Una pagina si; un widget o un mensaje no. Default true. */
  syncUrl?: boolean
  /** Poll de respaldo de las fuentes (ms). Sin valor: sin poll. */
  refetchIntervalMs?: number
  /** Mientras cargan los bloques perezosos (`host.lazyBlocks`). */
  loadingFallback?: ReactNode
  className?: string
  testId?: string
}

export function GenUIBody({ scope, ui, host, syncUrl = true, refetchIntervalMs, loadingFallback = null, className, testId }: GenUIBodyProps) {
  // El bus vive lo que vive el documento (genui engancha sus efectos a su identidad).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- otra identidad, otro bus
  const bus = useMemo(() => createPageBus(), [scope.addon, scope.page])
  const connectBus = host.connectBus
  useEffect(() => connectBus?.(bus, scope) ?? undefined, [bus, connectBus, scope.addon, scope.page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bloques custom que el host sabe montar: se registran al renderizar (sin pintar un stub de un bloque
  // que esta por existir) y otra vez en el efecto (StrictMode), y se retiran al desmontar.
  const names = useMemo(() => collectCustomBlockNames(ui.blocks), [ui.blocks])
  const customKey = names.join('|')
  const customBlocks = host.customBlocks
  const early = useMemo(
    () => (customBlocks && names.length ? customBlocks(names).map((def) => registerPageBlock(def)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customKey, customBlocks],
  )
  useEffect(() => {
    if (!customBlocks || !names.length) return
    const offs = [...early, ...customBlocks(names).map((def) => registerPageBlock(def))]
    return () => offs.forEach((off) => off())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [early])

  // Carga perezosa por tipo de bloque (p. ej. MapLibre solo si hay `map`). Si falla, el bloque cae a su respaldo.
  const lazyKey = useMemo(() => {
    const used = collectBlockTypes(ui.blocks)
    return Object.keys(host.lazyBlocks ?? {}).filter((t) => used.has(t)).sort().join('|')
  }, [ui.blocks, host.lazyBlocks])
  const [lazyReady, setLazyReady] = useState(lazyKey === '')
  useEffect(() => {
    if (lazyKey === '') return setLazyReady(true)
    let alive = true
    setLazyReady(false)
    void Promise.allSettled(lazyKey.split('|').map((t) => host.lazyBlocks![t]!())).then(() => alive && setLazyReady(true))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lazyKey])

  const { sources, sourceStatus } = useGenUISources(ui.data, host.sources, scope, { refetchIntervalMs, labels: host.labels })

  const hostNavigate = host.onNavigate
  const onNavigate = useMemo(
    () => (path: string) => {
      if (isSafeInternalPath(path)) hostNavigate?.(path)
    },
    [hostNavigate],
  )
  const hostAction = host.onAction
  const onAction = useMemo(() => (req: GenUIActionRequest) => hostAction?.(req), [hostAction])

  if (!lazyReady) return <>{loadingFallback}</>
  return (
    <div data-testid={testId} data-genui-body={scope.page} className={className ?? 'min-w-0'}>
      <GenUIProvider
        sources={sources}
        t={host.t}
        locale={host.locale}
        currency={host.currency}
        onNavigate={onNavigate}
        onAction={onAction}
        resolveIcon={host.resolveIcon}
        allowExternalLinks={host.allowExternalLinks ?? false}
      >
        <PageView
          ui={ui as never}
          urlState={syncUrl && host.urlState ? ui.url_state : undefined}
          urlAdapter={syncUrl ? host.urlState : undefined}
          bus={bus}
          can={host.can}
          sourceStatus={sourceStatus}
          ctx={host.ctx}
        />
      </GenUIProvider>
    </div>
  )
}
