// Logos de marcas de vehículo: del nombre que publique el catálogo («VW», «Mercedes Benz», «CHEVROLET»)
// a un slug normalizado y, si hay logo, a su ruta pública. Funciones puras: el componente vive en
// vehicle-make-logo.tsx y los archivos en vehicle-makes/ (se copian a la tienda con `asteby-vehicle-makes`).

import { VEHICLE_MAKE_LOGO_SLUGS } from './vehicle-makes.generated.js'

const AVAILABLE = new Set(VEHICLE_MAKE_LOGO_SLUGS)

/**
 * Nombres alternos → slug. Las claves ya van normalizadas con `vehicleMakeSlug` (sin acentos, minúsculas,
 * espacios y símbolos como guiones). Cubre abreviaturas y grafías comunes en catálogos de México.
 */
export const VEHICLE_MAKE_ALIASES: Readonly<Record<string, string>> = {
  vw: 'volkswagen',
  'volks-wagen': 'volkswagen',
  'volkswagen-vw': 'volkswagen',
  chevy: 'chevrolet',
  mercedes: 'mercedes-benz',
  'mercedes-benz-amg': 'mercedes-benz',
  mb: 'mercedes-benz',
  benz: 'mercedes-benz',
  'land-rover-range-rover': 'land-rover',
  'range-rover': 'land-rover',
  landrover: 'land-rover',
  alfa: 'alfa-romeo',
  alfaromeo: 'alfa-romeo',
  'mini-cooper': 'mini',
  'ram-trucks': 'ram',
  'dodge-ram': 'ram',
  'ssang-yong': 'ssangyong',
  'skoda-auto': 'skoda',
  'gmc-trucks': 'gmc',
  aston: 'aston-martin',
  astonmartin: 'aston-martin',
  'smart-fortwo': 'smart',
}

/** Slug normalizado de una marca: sin acentos, en minúsculas y con guiones («Mercedes Benz» → «mercedes-benz»). */
export function vehicleMakeSlug(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Slug canónico de la marca (aplica los alias) o `null` si el nombre viene vacío. */
export function resolveVehicleMake(name: string | null | undefined): string | null {
  const slug = vehicleMakeSlug(name)
  if (!slug) return null
  return VEHICLE_MAKE_ALIASES[slug] ?? slug
}

/** `true` si hay logo para esa marca. */
export function hasVehicleMakeLogo(name: string | null | undefined): boolean {
  const slug = resolveVehicleMake(name)
  return !!slug && AVAILABLE.has(slug)
}

/**
 * Ruta pública del logo (`/vehicle-makes/nissan.webp`) o `null` si no hay: así la tienda nunca pide un
 * archivo que no existe. `base` es la carpeta donde la tienda copió los logos.
 */
export function vehicleMakeLogoSrc(name: string | null | undefined, base = '/vehicle-makes'): string | null {
  const slug = resolveVehicleMake(name)
  if (!slug || !AVAILABLE.has(slug)) return null
  return `${base.replace(/\/+$/, '')}/${slug}.webp`
}

/** Iniciales de respaldo cuando no hay logo: «Mercedes Benz» → «MB», «Nissan» → «NI», «BMW» → «BM». */
export function vehicleMakeInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[1]![0]!).toUpperCase()
}
