/**
 * Estilos de cada modo como objetos planos. Los comparten el loader (`Object.assign(el.style, …)`,
 * CSSOM) y el embed en codigo (prop `style` de React, que tambien asigna por CSSOM), para que el
 * widget se vea igual venga del loader o del componente y para respetar una CSP `style-src` estricta.
 */
import { DISPLAY_LIMITS, SHAPE_RADIUS, type DisplaySettings } from './display'

export type Styles = Record<string, string>

export const Z_INDEX = '2147483000'
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const DEFAULT_BRAND = { color: '#0f172a', on: '#ffffff' }

export interface Brand {
  color: string
  on: string
}

const side = (left: boolean) => (left ? 'left' : 'right')

/** Panel flotante sobre el lanzador. */
export function floatingPanelStyle(s: DisplaySettings, open: boolean): Styles {
  const off = s.offset ?? DISPLAY_LIMITS.offset.def
  const left = s.position === 'bottom-left'
  const w = s.width ?? DISPLAY_LIMITS.floatingWidth
  return {
    position: 'fixed',
    bottom: `${off + 64}px`,
    left: left ? `${off}px` : 'auto',
    right: left ? 'auto' : `${off}px`,
    width: `${w}px`,
    maxWidth: 'calc(100vw - 32px)',
    height: '600px',
    maxHeight: `calc(100vh - ${off + 80}px)`,
    border: '0',
    borderRadius: '12px',
    boxShadow: '0 8px 30px rgba(0,0,0,.25)',
    zIndex: Z_INDEX,
    display: open ? 'block' : 'none',
    colorScheme: 'normal',
  }
}

export function floatingLauncherStyle(s: DisplaySettings, brand: Brand | null): Styles {
  const off = s.offset ?? DISPLAY_LIMITS.offset.def
  const left = s.position === 'bottom-left'
  const b = brand ?? DEFAULT_BRAND
  return {
    position: 'fixed',
    bottom: `${off}px`,
    left: left ? `${off}px` : 'auto',
    right: left ? 'auto' : `${off}px`,
    display: brand ? 'inline-flex' : 'none', // se muestra al recibir el perfil validado
    zIndex: Z_INDEX,
    border: '0',
    borderRadius: SHAPE_RADIUS[s.shape ?? 'round'],
    padding: '12px 18px',
    font: '600 14px system-ui, sans-serif',
    cursor: 'pointer',
    background: b.color,
    color: b.on,
    boxShadow: '0 4px 14px rgba(0,0,0,.25)',
  }
}

/** Panel lateral a pantalla completa que entra desde el borde. */
export function pushPanelStyle(s: DisplaySettings, open: boolean): Styles {
  const left = s.position === 'bottom-left'
  const w = s.width ?? DISPLAY_LIMITS.width.def
  return {
    position: 'fixed',
    top: '0',
    bottom: '0',
    left: left ? '0' : 'auto',
    right: left ? 'auto' : '0',
    width: `${w}px`,
    maxWidth: '100vw',
    height: '100vh',
    border: '0',
    boxShadow: '0 0 48px -8px rgba(15,23,42,.32)',
    zIndex: Z_INDEX,
    display: 'block',
    transform: open ? 'translateX(0)' : `translateX(${left ? '-100%' : '100%'})`,
    visibility: open ? 'visible' : 'hidden',
    transition: `transform 320ms ${EASE}, visibility 0s linear ${open ? '0s' : '320ms'}`,
    colorScheme: 'normal',
  }
}

/** Riel: pegado al borde cerrado; abierto viaja al borde interior del panel y hace de asa. */
export function pushLauncherStyle(s: DisplaySettings, open: boolean, brand: Brand | null, viewportWidth: number): Styles {
  const left = s.position === 'bottom-left'
  const w = s.width ?? DISPLAY_LIMITS.width.def
  const b = brand ?? DEFAULT_BRAND
  return {
    position: 'fixed',
    top: '0',
    bottom: '0',
    left: 'auto',
    right: 'auto',
    [side(left)]: open ? `${Math.min(w, viewportWidth || w)}px` : '0',
    width: '46px',
    boxSizing: 'border-box',
    display: brand ? 'flex' : 'none',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    zIndex: Z_INDEX,
    border: '0',
    borderRadius: left ? '0 14px 14px 0' : '14px 0 0 14px',
    padding: '0',
    font: '600 14px system-ui, sans-serif',
    cursor: 'pointer',
    background: b.color,
    color: b.on,
    transition: `${side(left)} 320ms ${EASE}`,
  }
}

export const railChevron = (s: DisplaySettings, open: boolean): string => ((s.position === 'bottom-left') === open ? '‹' : '›')

export const railChevronStyle: Styles = { fontSize: '22px', lineHeight: '1' }

export const railLabelStyle = (s: DisplaySettings): Styles => ({
  writingMode: 'vertical-rl',
  whiteSpace: 'nowrap',
  maxHeight: '60vh',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  transform: s.position === 'bottom-left' ? 'none' : 'rotate(180deg)',
})

/** Contenedor incrustado: a ras del destino, sin esquinas ni sombra. */
export function inlinePanelStyle(s: DisplaySettings): Styles {
  return {
    display: 'block',
    width: '100%',
    height: `${s.height ?? DISPLAY_LIMITS.height.def}px`,
    border: '0',
    borderRadius: '0',
    colorScheme: 'normal',
  }
}
