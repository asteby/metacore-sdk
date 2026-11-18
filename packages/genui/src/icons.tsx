// Resolutor de iconos por nombre (un solo punto para todo genui). El host lo
// inyecta con `<GenUIProvider resolveIcon>`; sin el, o si no resuelve el nombre,
// se usa el conjunto interno y, al final, un icono neutro. Nunca lanza.
import { BarChart3, Calendar, Circle, LayoutDashboard, LayoutGrid, List, Map as MapIcon, Table2 } from 'lucide-react'
import type { ComponentType } from 'react'
import { useGenUI } from './registry'

/** Componente de icono que genui sabe pintar: solo necesita `className`. */
export type GenUIIconComponent = ComponentType<{ className?: string }>

/** Resolutor del host: nombre declarado en el manifiesto -> componente (o null/undefined si no lo conoce). */
export type GenUIIconResolver = (name: string) => GenUIIconComponent | null | undefined

/** Forma aceptada para nombres de icono (la misma que el kernel debe admitir ademas del enum). */
export const ICON_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/

/** Conjunto interno (retrocompatible con el enum cerrado `TabIcon`). */
export const BUILTIN_ICONS: Readonly<Record<string, GenUIIconComponent>> = {
  map: MapIcon,
  cards: LayoutGrid,
  table: Table2,
  dashboard: LayoutDashboard,
  list: List,
  calendar: Calendar,
  chart: BarChart3,
}

/** Icono neutro cuando el nombre es valido pero nadie lo resuelve. */
export const FALLBACK_ICON: GenUIIconComponent = Circle

/**
 * Orden: host -> conjunto interno -> icono neutro. `null` solo si no hay nombre
 * o no es un nombre valido (no se pinta nada). Un resolutor que lanza se ignora.
 */
export function resolveGenUIIcon(name: unknown, resolver?: GenUIIconResolver): GenUIIconComponent | null {
  if (typeof name !== 'string' || !ICON_NAME_PATTERN.test(name)) return null
  if (resolver) {
    try {
      const hit = resolver(name)
      if (hit) return hit
    } catch {
      // un resolutor roto del host no debe romper el render
    }
  }
  return (Object.hasOwn(BUILTIN_ICONS, name) ? BUILTIN_ICONS[name] : undefined) ?? FALLBACK_ICON
}

/** Hook unico para pintar un icono por nombre con el resolutor del `GenUIProvider`. */
export function usePageIcon(name: unknown): GenUIIconComponent | null {
  return resolveGenUIIcon(name, useGenUI().resolveIcon)
}
