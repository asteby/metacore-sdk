import { type LucideIcon } from 'lucide-react'
import type { NavBadgeValue } from './badge-model'

export interface NavLinkItem {
  title: string
  url: string
  icon?: LucideIcon
  /**
   * Optional pill rendered to the right of the label. Accepts a string
   * (e.g. "new") or a number (e.g. a count of pending items). A numeric `0`
   * is treated as "no badge" and renders nothing, so consumers can pass a
   * raw count without guarding the falsy-zero case themselves. A
   * `NavBadgeValue` ({count, tone, label}) paints a severity-toned, 99+-capped,
   * accessible pill (see `NavBadge`).
   */
  badge?: number | string | NavBadgeValue
  role?: string
  /**
   * Id of the attention counter (kernel `navcounts` / `useNavBadges`) that feeds
   * this entry's badge. Folders sum their leaves deduplicating by this id.
   */
  badgeId?: string
  /**
   * Capability (`<model>.<action>`) the user needs to see this entry. When
   * absent, hosts derive it from the url (`/m/<model>` → `<model>.index`).
   */
  requires?: string
  /**
   * The model's default `view_type` for this entry's path (e.g. `'kanban'` or
   * `'list'`). Lets the active-state matcher resolve a view-less current URL
   * (`/m/x?per_page=15`, no `?view`) to the surface the model actually paints,
   * so exactly one of sibling view items (Board vs List) lights up. Hosts thread
   * it from `metadata.view_type`; omit it and a view-less URL only matches a
   * view-less item.
   */
  defaultView?: string
}

export type NavItem = NavLinkItem | NavCollapsibleItem

export interface NavCollapsibleItem extends NavLinkItem {
  /**
   * Children may be leaves OR further collapsibles (e.g. vertical preset →
   * addon module → screen). Hosts that only ever pass leaves keep working —
   * `NavLinkItem` is still a valid `NavItem`.
   */
  items: NavItem[]
}

export interface NavGroupData {
  title: string
  items: NavItem[]
}

export interface LayoutUser {
  name: string
  email: string
  avatar?: string
  role?: string
}
