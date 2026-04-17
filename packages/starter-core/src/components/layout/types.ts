import { type LucideIcon } from 'lucide-react'

export interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  badge?: string
  role?: string
  items?: {
    title: string
    url: string
    icon?: LucideIcon
    role?: string
  }[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export interface SidebarData {
  user: {
    name: string
    email: string
    avatar: string
  }
  teams: {
    name: string
    logo: LucideIcon
    plan: string
  }[]
  navGroups: NavGroup[]
}
