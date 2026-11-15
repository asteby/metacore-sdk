// Logo de la marca de un vehículo en una caja cuadrada de tamaño fijo (sin saltos de layout). Va sobre una
// placa clara en ambos temas porque buena parte de los logos son negros. Sin logo, o si la imagen falla,
// muestra las iniciales de la marca en la misma caja.

import { useState, type CSSProperties } from 'react'
import { resolveVehicleMake, vehicleMakeInitials, vehicleMakeLogoSrc } from './vehicle-make.js'

export type VehicleMakeLogoProps = {
  /** Nombre de la marca tal como lo publica el catálogo («Nissan», «VW», «MERCEDES BENZ»). */
  make: string | null | undefined
  /** Lado de la caja en px (por omisión 32). */
  size?: number
  /** Carpeta pública donde la tienda copió los logos (por omisión `/vehicle-makes`). */
  base?: string
  /**
   * `true` (por omisión): el logo es decorativo y la marca ya se lee junto a él (`alt=""`).
   * `false`: el logo es el único texto y lleva `alt` con el nombre.
   */
  decorative?: boolean
  className?: string
  /** `lazy` por omisión; usa `eager` para logos que se ven al cargar (p. ej. el chip de la cabecera). */
  loading?: 'lazy' | 'eager'
}

const box = (size: number): CSSProperties => ({
  width: size,
  height: size,
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
})

/**
 * Logo de marca de vehículo. La clase `sf-vehicle-make` permite a la tienda darle su placa (por omisión: fondo
 * blanco, borde sutil y esquinas redondeadas vía estilos en línea, sobreescribibles con `className`).
 */
export function VehicleMakeLogo({ make, size = 32, base, decorative = true, className, loading = 'lazy' }: VehicleMakeLogoProps) {
  const src = vehicleMakeLogoSrc(make, base)
  const [failed, setFailed] = useState(false)
  const label = make?.trim() ?? ''
  const plate: CSSProperties = {
    ...box(size),
    background: '#fff',
    borderRadius: Math.round(size / 5),
    boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.08)',
  }
  const cls = ['sf-vehicle-make', className].filter(Boolean).join(' ')
  const slug = resolveVehicleMake(make) ?? undefined

  if (!src || failed) {
    return (
      <span
        className={cls}
        data-make={slug}
        data-fallback=""
        style={{ ...plate, color: '#3f3f46', fontWeight: 700, fontSize: Math.max(9, Math.round(size * 0.36)), letterSpacing: '-0.02em' }}
        {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      >
        {vehicleMakeInitials(make)}
      </span>
    )
  }
  return (
    <span className={cls} data-make={slug} style={plate}>
      <img
        src={src}
        alt={decorative ? '' : label}
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </span>
  )
}
