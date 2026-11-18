// Ejemplo: el host (Ops, con lucide-react) resuelve los iconos que los addons
// declaran por nombre en `tabs[].icon` (p.ej. "MapPin"). Sin resolutor se usa el
// conjunto interno (map, cards, table...) y un icono neutro para el resto.
// No se compila con el paquete (fuera de `src`); es documentacion ejecutable.
import * as lucide from 'lucide-react'
import { GenUIProvider, PageView, type GenUIIconResolver } from '@asteby/metacore-genui'
import ui from './fleet-switcher.page.json'

const resolveIcon: GenUIIconResolver = (name) => (lucide as unknown as Record<string, ReturnType<GenUIIconResolver>>)[name] ?? null

export function FleetSwitcherPage({ rows, can }: { rows: Record<string, Record<string, unknown>[]>; can: (p: string) => boolean }) {
  return (
    <GenUIProvider sources={rows} resolveIcon={resolveIcon}>
      <PageView ui={ui as never} can={can} />
    </GenUIProvider>
  )
}
