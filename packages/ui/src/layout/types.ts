import { type LucideIcon } from 'lucide-react'

export interface NavLinkItem {
  title: string
  url: string
  icon?: LucideIcon
  /**
   * Optional pill rendered to the right of the label. Accepts a string
   * (e.g. "new") or a number (e.g. a count of pending items). A numeric `0`
   * is treated as "no badge" and renders nothing, so consumers can pass a
   * raw count without guarding the falsy-zero case themselves.
   */
  badge?: number | string
  role?: string
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

export interface NavCollapsibleItem extends NavLinkItem {
  items: NavLinkItem[]
}

export type NavItem = NavLinkItem | NavCollapsibleItem

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
