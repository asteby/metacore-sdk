import { type LucideIcon } from 'lucide-react'

export interface NavLinkItem {
  title: string
  url: string
  icon?: LucideIcon
  badge?: string
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
