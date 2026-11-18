// Ejemplo minimo: pagina "mapa de flota" (grid con areas + KPIs + mapa + detalle custom).
// El bloque custom solo declara su contrato; la federacion la resuelve el host.
// No se compila con el paquete (fuera de `src`); es documentacion ejecutable.
import { GenUIProvider, PageView, defineBlock, registerPageBlock, usePageEvent } from '@asteby/metacore-genui'
import { registerGenUIMapBlock } from '@asteby/metacore-maps/genui'
import ui from './fleet-map.page.json'

registerGenUIMapBlock()

registerPageBlock(
  defineBlock({
    name: 'hub_fleet.instance_detail@1',
    reads: ['state.selected'],
    writes: ['state.selected'],
    events: ['open_record'],
    component: ({ context, emit }) => (
      <button type='button' onClick={() => emit('open_record', { id: String(context['state.selected'] ?? '') })}>
        {String(context['state.selected'] ?? 'Elige una instancia')}
      </button>
    ),
  }),
)

export function FleetMapPage({ rows, can }: { rows: Record<string, Record<string, unknown>[]>; can: (p: string) => boolean }) {
  usePageEvent('select', (e) => console.log('seleccion', e.payload))
  return (
    <GenUIProvider sources={rows}>
      <PageView ui={ui as never} urlState={['selected']} can={can} />
    </GenUIProvider>
  )
}
