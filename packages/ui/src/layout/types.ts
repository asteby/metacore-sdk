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
