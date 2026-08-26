import type { LucideIcon } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import type { NotificationType } from './types'

/** Convert kebab-case / snake_case to PascalCase ("shopping-cart" → "ShoppingCart"). */
export function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Known addon → human label (bell chip / toast eyebrow). Hosts may extend via registerModuleLabel. */
const MODULE_LABELS: Record<string, string> = {
  inventory: 'Inventario',
  warehouse: 'Almacén',
  customers: 'Clientes',
  pos: 'POS',
  caja: 'Caja',
  fiscal_mexico: 'Fiscal',
  workshop: 'Taller',
  accounting_lite: 'Contabilidad',
  products: 'Productos',
  payroll: 'Nómina',
  hr: 'RRHH',
  vehicles: 'Vehículos',
  tires_inventory: 'Llantas',
  link_inbox: 'Link Inbox',
  team_chat: 'Equipo',
}

/** Hosts can register extra addon keys without forking the package. */
export function registerModuleLabel(addonKey: string, label: string): void {
  const k = addonKey.trim()
  if (!k || !label.trim()) return
  MODULE_LABELS[k] = label.trim()
}

export type NotificationMeta = {
  addon_key?: string
  apartado?: string
  module?: string
  model?: string
  rule?: string
  source?: string
  color?: string
  [key: string]: unknown
}

export function parseNotificationMeta(raw?: string | NotificationMeta | null): NotificationMeta {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as NotificationMeta) : {}
  } catch {
    return {}
  }
}

/** Chip label for Inventario / Almacén / POS / … */
export function moduleLabelFromMeta(meta: NotificationMeta): string {
  if (typeof meta.apartado === 'string' && meta.apartado.trim()) return meta.apartado.trim()
  if (typeof meta.module === 'string' && meta.module.trim()) return meta.module.trim()
  const key = (meta.addon_key || '').trim()
  if (!key) return ''
  return MODULE_LABELS[key] || key.replace(/_/g, ' ')
}

export type NotificationTone = {
  /** Circle behind the Lucide icon — always pair with text-white for contrast. */
  iconClass: string
  /** Thin straight accent bar (left of the row). */
  lineClass: string
  /** @deprecated kept for callers that still read it */
  rowAccentClass: string
  /** Optional explicit hex/css color from payload metadata.color */
  customColor?: string
}

const TONES: Record<NotificationType | 'default', NotificationTone> = {
  success: {
    iconClass: 'bg-emerald-500 text-white',
    lineClass: 'bg-emerald-500',
    rowAccentClass: 'border-l-emerald-500',
  },
  warning: {
    iconClass: 'bg-amber-500 text-white',
    lineClass: 'bg-amber-500',
    rowAccentClass: 'border-l-amber-500',
  },
  error: {
    iconClass: 'bg-red-500 text-white',
    lineClass: 'bg-red-500',
    rowAccentClass: 'border-l-red-500',
  },
  info: {
    // Force white glyph — primary-foreground is often a washed gray on brand themes.
    iconClass: 'bg-primary text-white',
    lineClass: 'bg-primary',
    rowAccentClass: 'border-l-primary',
  },
  default: {
    iconClass: 'bg-primary text-white',
    lineClass: 'bg-primary',
    rowAccentClass: 'border-l-primary',
  },
}

export function resolveNotificationTone(
  type?: NotificationType | string | null,
  meta?: NotificationMeta,
): NotificationTone {
  const base = TONES[(type as NotificationType) || 'info'] || TONES.default
  const custom =
    typeof meta?.color === 'string' && meta.color.trim() ? meta.color.trim() : undefined
  return custom ? { ...base, customColor: custom } : base
}

export function resolveNotificationIcon(
  icon?: string | null,
  type?: NotificationType | string | null,
): LucideIcon {
  if (icon) {
    const Dynamic = (LucideIcons as unknown as Record<string, LucideIcon>)[toPascalCase(icon)]
    if (Dynamic) return Dynamic
  }
  switch (type) {
    case 'warning':
      return LucideIcons.AlertTriangle
    case 'success':
      return LucideIcons.CheckCircle2
    case 'error':
      return LucideIcons.XCircle
    case 'info':
    default:
      return LucideIcons.Bell
  }
}

/** One-shot resolve for toast + list rows. */
export function resolveNotificationVisual(input: {
  icon?: string | null
  type?: NotificationType | string | null
  metadata?: string | NotificationMeta | null
  addonKey?: string | null
}) {
  const meta = {
    ...parseNotificationMeta(input.metadata),
    ...(input.addonKey ? { addon_key: input.addonKey } : {}),
  }
  return {
    Icon: resolveNotificationIcon(input.icon, input.type),
    tone: resolveNotificationTone(input.type, meta),
    moduleLabel: moduleLabelFromMeta(meta),
    meta,
  }
}
