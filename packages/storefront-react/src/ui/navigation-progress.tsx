import { useEffect, useState, type CSSProperties } from 'react'

/** Fases de la barra: `idle` (nada), `running` (avanza), `done` (completa y se desvanece). */
type Phase = 'idle' | 'running' | 'done'

/**
 * `active` con retraso: devuelve `true` solo si `active` dura más de `delay` ms (sin parpadeo en
 * navegaciones rápidas) y, una vez visible, se mantiene al menos `minVisible` ms para que no se vea un destello.
 */
export function useDelayedFlag(active: boolean, delay = 120, minVisible = 0): boolean {
  const [shown, setShown] = useState(false)
  const [since, setSince] = useState(0)

  useEffect(() => {
    if (active) {
      if (shown) return
      const t = setTimeout(() => {
        setSince(Date.now())
        setShown(true)
      }, delay)
      return () => clearTimeout(t)
    }
    if (!shown) return
    const left = Math.max(0, minVisible - (Date.now() - since))
    if (left === 0) {
      setShown(false)
      return
    }
    const t = setTimeout(() => setShown(false), left)
    return () => clearTimeout(t)
  }, [active, shown, delay, minVisible, since])

  return shown
}

export interface NavigationProgressProps {
  /** `true` mientras hay una navegación o envío en curso (p. ej. `useNavigation().state !== 'idle'`). */
  active: boolean
  /** Ms que debe durar la espera antes de mostrar la barra. Por omisión 120. */
  delay?: number
  /** Texto para lectores de pantalla mientras la barra está visible. */
  label?: string
  /**
   * Selector del elemento que recibe `aria-busy="true"` mientras dura la espera (la región que va a cambiar).
   * Por omisión `main`. Con `null` no se toca ninguno.
   */
  busyTarget?: string | null
  className?: string
  style?: CSSProperties
}

/**
 * Barra fina de progreso arriba de la página (estilo NProgress) para navegaciones del lado del cliente.
 * Agnóstica del router: se alimenta con un booleano. Color por token CSS `--navigation-progress`
 * (por omisión `--primary`), alto por `--navigation-progress-height` (3px). Es una región `role="status"`
 * con el texto solo para lectores de pantalla; con `prefers-reduced-motion` no anima el avance (barra fija y tenue).
 * Estilos en `@asteby/storefront-react/progress.css`.
 */
export function NavigationProgress({ active, delay = 120, label = 'Cargando…', busyTarget = 'main', className = '', style }: NavigationProgressProps) {
  const visible = useDelayedFlag(active, delay)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (visible) {
      setPhase('running')
      return
    }
    setPhase((p) => (p === 'running' ? 'done' : p))
    const t = setTimeout(() => setPhase((p) => (p === 'done' ? 'idle' : p)), 400)
    return () => clearTimeout(t)
  }, [visible])

  useEffect(() => {
    if (!visible || !busyTarget || typeof document === 'undefined') return
    const el = document.querySelector(busyTarget)
    el?.setAttribute('aria-busy', 'true')
    return () => el?.removeAttribute('aria-busy')
  }, [visible, busyTarget])

  return (
    <div role="status" aria-live="polite" className={`sf-nav-progress ${className}`.trim()} style={style} data-phase={phase}>
      <span className="sf-nav-progress__bar" aria-hidden="true" />
      <span className="sf-nav-progress__label">{visible ? label : ''}</span>
    </div>
  )
}

/**
 * Bloque de carga con la forma del contenido real. Decorativo (`aria-hidden`): la región que lo contiene debe
 * llevar `aria-busy` / `role="status"`. Tamaño con `className` (Tailwind u otro) o `width`/`height`.
 */
export function Skeleton({ className = '', width, height, rounded, style }: { className?: string; width?: number | string; height?: number | string; rounded?: boolean; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`sf-skeleton ${rounded ? 'sf-skeleton--round' : ''} ${className}`.trim()} style={{ width, height, ...style }} />
}

/** Spinner de botón/enlace pendiente. Hereda el color del texto; decorativo (`aria-hidden`). */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={`sf-spinner ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
