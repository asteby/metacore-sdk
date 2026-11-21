// Textos fijos de genui (v2, paginas y bloques de tablero), con clave i18n y respaldo en espanol.
// Se resuelven con el `t` del `GenUIProvider`; si el host no lo da, o devuelve la propia clave, gana el respaldo.
// Las traducciones es/en viven en `@asteby/metacore-i18n` (claves `genui.*`).
import { useCallback } from 'react'
import { useGenUI } from './registry'

export const GENUI_LABELS = {
  'genui.denied': 'No tienes acceso a esta seccion.',
  'genui.section_failed': 'Esta seccion fallo al mostrarse.',
  'genui.block_failed': 'Este bloque fallo al mostrarse.',
  'genui.page_invalid': 'La pagina no es valida.',
  'genui.error': 'No se pudo cargar.',
  'genui.retry': 'Reintentar',
  'genui.loading': 'Cargando',
  'genui.view': 'Vista',
  'genui.custom_unavailable': 'Bloque personalizado no disponible: {{name}}',
  'genui.trend.up': 'al alza',
  'genui.trend.down': 'a la baja',
  'genui.trend.flat': 'estable',
  'genui.series.chart': 'Grafica',
  'genui.series.table': 'Tabla',
  'genui.series.period': 'Periodo',
  'genui.series.show_table': 'Ver tabla',
  'genui.series.show_chart': 'Ver grafica',
  'genui.ranked.position': 'Posicion {{n}}',
} as const

export type GenUILabelKey = keyof typeof GENUI_LABELS

const fill = (s: string, args?: Record<string, unknown>) => (args ? s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(args[k] ?? '')) : s)

/** `(clave, args?) => texto`: el `t` del host con respaldo en espanol. */
export function useGenUILabel(): (key: GenUILabelKey, args?: Record<string, unknown>) => string {
  const { t } = useGenUI()
  return useCallback(
    (key, args) => {
      let r: string | undefined
      try {
        r = t?.(key, args)
      } catch {
        r = undefined
      }
      return r && r !== key ? r : fill(GENUI_LABELS[key], args)
    },
    [t],
  )
}
