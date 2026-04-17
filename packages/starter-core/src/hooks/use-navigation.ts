import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  LayoutDashboard, Users, Bot, Zap, Plug, BarChart, ShieldCheck,
  Building, History, Network, Package, Tags, Award, BookOpen,
  ShoppingCart, FileText, CreditCard, RotateCcw, DollarSign, Truck,
  ClipboardList, PackageCheck, Receipt, Warehouse, Layers,
  ArrowLeftRight, ClipboardMinus, Landmark, BookOpenCheck,
  CircleDollarSign, Building2, Scale, CalendarRange, UserCog,
  Briefcase, BadgeDollarSign, CircleUser, Settings, Box,
  Wrench, Hammer, Cog, Puzzle,
  Store, Monitor, Clock, Wallet, Banknote,
  type LucideIcon,
} from 'lucide-react'

// Map ALL icon name strings to Lucide components
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Bot, Zap, Plug, BarChart, ShieldCheck,
  Building, History, Network, Package, Tags, Award, BookOpen,
  ShoppingCart, FileText, CreditCard, RotateCcw, DollarSign, Truck,
  ClipboardList, PackageCheck, Receipt, Warehouse, Layers,
  ArrowLeftRight, ClipboardMinus, Landmark, BookOpenCheck,
  CircleDollarSign, Building2, Scale, CalendarRange, UserCog,
  Briefcase, BadgeDollarSign, CircleUser, Settings, Box,
  Wrench, Hammer, Cog, Puzzle,
  Store, Monitor, Clock, Wallet, Banknote,
}

export function resolveIcon(iconName?: string): LucideIcon | undefined {
  if (!iconName) return undefined
  return iconMap[iconName] || Box
}

interface ServerNavItem {
  title: string
  url: string
  icon?: string
  items?: ServerNavItem[]
}

interface ServerNavGroup {
  title: string
  items: ServerNavItem[]
}

export interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  items?: NavItem[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

function mapItem(item: ServerNavItem): NavItem {
  return {
    title: item.title,
    url: item.url,
    icon: resolveIcon(item.icon),
    items: item.items?.map(mapItem),
  }
}

export function useNavigation() {
  const queryClient = useQueryClient()

  const query = useQuery<NavGroup[]>({
    queryKey: ['navigation'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: { groups: ServerNavGroup[] } }>('/navigation')
      const groups = res.data?.data?.groups
      if (!groups) return []
      return groups.map((group): NavGroup => ({
        title: group.title,
        items: group.items.map(mapItem),
      }))
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  return {
    ...query,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['navigation'] }),
  }
}
