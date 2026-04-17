import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  Wrench,
  ClipboardList,
  Warehouse,
  Hammer,
  Package,
  Settings,
  Plug,
  Box,
  Cog,
  FileText,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { NavGroup } from '@/components/layout/types'

// Map icon name strings from the backend to actual Lucide components
const iconMap: Record<string, LucideIcon> = {
  Wrench,
  ClipboardList,
  Warehouse,
  Hammer,
  Package,
  Settings,
  Plug,
  Box,
  Cog,
  FileText,
  Truck,
  Users,
}

function resolveIcon(iconName?: string): LucideIcon | undefined {
  if (!iconName) return undefined
  return iconMap[iconName] || Box
}

interface AddonNavItem {
  title: string
  url: string
  icon?: string
}

interface AddonNavGroup {
  title: string
  icon?: string
  items: AddonNavItem[]
}

interface NavigationResponse {
  success: boolean
  data: {
    addons: AddonNavGroup[] | null
  }
}

export function useAddonNavigation() {
  return useQuery<NavGroup[]>({
    queryKey: ['addon-navigation'],
    queryFn: async () => {
      const res = await api.get<NavigationResponse>('/navigation')
      const addonGroups = res.data?.data?.addons

      if (!addonGroups || addonGroups.length === 0) return []

      return addonGroups.map((group): NavGroup => ({
        title: group.title,
        items: [{
          title: group.title,
          url: group.items[0]?.url || '#',
          icon: resolveIcon(group.icon),
          items: group.items.map(item => ({
            title: item.title,
            url: item.url,
            icon: resolveIcon(item.icon),
          })),
        }],
      }))
    },
    staleTime: 5 * 60 * 1000, // Cache 5 minutes
    retry: 1,
  })
}
