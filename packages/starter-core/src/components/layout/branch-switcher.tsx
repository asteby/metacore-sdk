import * as React from 'react'
import { ChevronsUpDown, MapPin, Check } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useBranchStore, type Branch } from '@/stores/branch-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

function useBranches() {
  return useQuery({
    queryKey: ['branches-list'],
    queryFn: async () => {
      const { data } = await api.get('/branches/list')
      return data as { success: boolean; data: Branch[] }
    },
    staleTime: 60_000,
  })
}

export function BranchSwitcher() {
  const { isMobile } = useSidebar()
  const { currentBranch, setCurrentBranch } = useBranchStore()
  const { data } = useBranches()
  const branches = data?.data || []

  // Auto-select first branch if none selected
  React.useEffect(() => {
    if (!currentBranch && branches.length > 0) {
      setCurrentBranch(branches[0])
    }
  }, [branches, currentBranch, setCurrentBranch])

  const activeBranch = currentBranch || branches[0]

  if (!activeBranch) return null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='sm'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <MapPin className='size-4 shrink-0 text-muted-foreground' />
              <span className='truncate text-sm'>{activeBranch.name}</span>
              <ChevronsUpDown className='ms-auto size-4 shrink-0 text-muted-foreground' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-48 rounded-lg'
            align='start'
            side={isMobile ? 'top' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className='text-muted-foreground text-xs'>
              Sucursales
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch.id}
                onClick={() => setCurrentBranch(branch)}
                className='gap-2 p-2'
              >
                <MapPin className='size-4 shrink-0 text-muted-foreground' />
                <div className='flex flex-col flex-1'>
                  <span className='truncate'>{branch.name}</span>
                  <span className='text-xs text-muted-foreground'>{branch.code}</span>
                </div>
                {currentBranch?.id === branch.id && (
                  <Check className='size-4 shrink-0 text-primary' />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
