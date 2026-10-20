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

/**
 * Legacy built-in names (Spanish) used ONLY when nothing better is known: no
 * label registered by the host and no `metadata.addon_name` from the server.
 * Prefer the translated addon name; see {@link moduleLabelFromMeta}.
 */
const LEGACY_MODULE_LABELS: Record<string, string> = {
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

/**
 * Names the host registered (addon key → name in the viewer's language). The
 * host fills this from the addon catalog it already loads (e.g. the org i18n
 * bundle's `addon_names.<key>`), so it also labels notifications that were
 * stored before the server started stamping `metadata.addon_name`.
 */
const REGISTERED_MODULE_LABELS: Record<string, string> = {}

/** Hosts can register an addon's display name without forking the package. */
export function registerModuleLabel(addonKey: string, label: string): void {
  const k = addonKey.trim()
  if (!k || !label.trim()) return
  REGISTERED_MODULE_LABELS[k] = label.trim()
}

/** Bulk form of {@link registerModuleLabel}: `{ channel_orders: 'Pedidos de canal' }`. */
export function registerModuleLabels(labels: Record<string, string | undefined | null>): void {
  for (const [key, label] of Object.entries(labels)) {
    if (typeof label === 'string') registerModuleLabel(key, label)
  }
}

/**
 * Last-resort label for an addon key: `channel_orders` → `Channel Orders`,
 * `pos` → `POS`. Never the raw key.
 */
export function humanizeModuleKey(key: string): string {
  return key
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      return MODULE_ACRONYMS.has(lower) ? lower.toUpperCase() : lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

const MODULE_ACRONYMS = new Set(['pos', 'sku', 'api', 'crm', 'erp', 'hr', 'iva', 'rfc', 'cfdi'])

export type NotificationMeta = {
  addon_key?: string
  /** Translated addon name stamped by the server when it created the notification. */
  addon_name?: string
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

/**
 * Chip / eyebrow label of a notification's origin. Always the addon's
 * translated name; resolution order:
 *
 *  1. `apartado` / `module`: explicit label set by whoever created the notice
 *  2. name the host registered for `addon_key` (viewer's language, live)
 *  3. `addon_name` stamped by the server (platform language)
 *  4. legacy built-in Spanish names
 *  5. the humanized key (`channel_orders` → "Channel Orders"), never the raw key
 */
export function moduleLabelFromMeta(meta: NotificationMeta): string {
  if (typeof meta.apartado === 'string' && meta.apartado.trim()) return meta.apartado.trim()
  if (typeof meta.module === 'string' && meta.module.trim()) return meta.module.trim()
  const key = (meta.addon_key || '').trim()
  if (key && REGISTERED_MODULE_LABELS[key]) return REGISTERED_MODULE_LABELS[key]
  if (typeof meta.addon_name === 'string' && meta.addon_name.trim()) return meta.addon_name.trim()
  if (!key) return ''
  return LEGACY_MODULE_LABELS[key] || humanizeModuleKey(key)
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
