import { useLayout } from '@/context/layout-provider'
import { Building2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@/hooks/use-navigation'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { NavGroup as NavGroupCmp } from './nav-group'
import type { NavGroup } from './types'
import { Organization } from './organization'
import { BranchSwitcher } from './branch-switcher'
import { Skeleton } from '@/components/ui/skeleton'

export interface AppSidebarProps {
  /**
   * Optional hook injected by the host app that returns addon-contributed
   * sidebar groups. Keeps starter-core decoupled from `@/features/metacore`.
   * Defaults to an empty-list hook.
   */
  useAddonSidebar?: () => NavGroup[]
}

const useEmptyAddonSidebar: () => NavGroup[] = () => []

export function AppSidebar({
  useAddonSidebar = useEmptyAddonSidebar,
}: AppSidebarProps = {}) {
  const { collapsible, variant } = useLayout()
  const { auth: { user } } = useAuthStore()
  const { t } = useTranslation()
  const { data: serverGroups = [], isLoading } = useNavigation()
  const addonGroups = useAddonSidebar()

  // Translate titles from i18n keys sent by backend
  const translatedServer = serverGroups.map(group => ({
    ...group,
    title: t(group.title),
    items: group.items.map(item => ({
      ...item,
      title: t(item.title),
      items: item.items?.map(subItem => ({
        ...subItem,
        title: t(subItem.title)
      }))
    }))
  }))

  // Splice addon-contributed groups before the last static group (typically Admin).
  const navGroups = addonGroups.length === 0 || translatedServer.length === 0
    ? [...translatedServer, ...addonGroups]
    : [
        ...translatedServer.slice(0, translatedServer.length - 1),
        ...addonGroups,
        translatedServer[translatedServer.length - 1],
      ]

  /* Default values from user or fallback */
  const orgName = user?.organization_name || t('common.main_company')
  const orgLogo = user?.organization_logo || Building2
  const orgPlan = user?.plan_name || t('common.business_plan')

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <Organization name={orgName} logo={orgLogo} plan={orgPlan} />
      </SidebarHeader>

      <SidebarContent>
        {isLoading ? (
          <SidebarSkeletonContent />
        ) : (
          navGroups.map((group) => (
            <NavGroupCmp key={group.title} {...group} />
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        <BranchSwitcher />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SidebarSkeletonContent() {
  return (
    <>
      {/* First group - e.g. General */}
      <SidebarGroup>
        <SidebarGroupLabel>
          <Skeleton className='h-3 w-16' />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: 4 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton className='pointer-events-none'>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-3 w-24' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      {/* Second group - e.g. Modules */}
      <SidebarGroup>
        <SidebarGroupLabel>
          <Skeleton className='h-3 w-20' />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: 5 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton className='pointer-events-none'>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-3 w-28' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      {/* Third group - e.g. System */}
      <SidebarGroup>
        <SidebarGroupLabel>
          <Skeleton className='h-3 w-14' />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: 3 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton className='pointer-events-none'>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-3 w-20' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}
