import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth-store'
import { getStorageUrl } from '@/lib/utils'

type OrganizationProps = {
    name: string
    logo: React.ElementType | string
    plan: string
}

export function Organization({ name, logo, plan }: OrganizationProps) {
    const role = useAuthStore((s) => s.auth.user?.role)
    const isAdmin = role === 'owner' || role === 'admin' || role === 'superadmin'

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton
                    size='lg'
                    className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-default hover:bg-transparent'
                >
                    <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
                        {typeof logo === 'string' ? (
                            <img src={getStorageUrl(logo, 'organizations')} alt={name} className='size-6 rounded-lg object-cover' />
                        ) : (
                            React.createElement(logo as React.ElementType, { className: 'size-4' })
                        )}
                    </div>
                    <div className='grid flex-1 text-start text-sm leading-tight'>
                        <span className='truncate font-semibold'>
                            {name}
                        </span>
                        <span className='truncate text-xs'>{plan}</span>
                    </div>
                    {isAdmin && (
                        <Link
                            to='/organization-settings'
                            className='flex size-6 items-center justify-center rounded-md text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors'
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Settings className='size-3.5' />
                        </Link>
                    )}
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    )
}
