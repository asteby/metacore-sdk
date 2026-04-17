import { useEffect, useState, useCallback, useRef } from 'react'
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { createAuthGuard } from '@asteby/metacore-auth/guards'
import { useAuthStore } from '@asteby/metacore-auth/store'
import { AuthenticatedLayout, AppSidebar, OrganizationCard } from '@asteby/metacore-ui/layout'
import { CommandMenu } from '@asteby/metacore-ui/command-menu'
import type { NavGroupData } from '@asteby/metacore-ui/layout'
import type { CommandMenuNavGroup } from '@asteby/metacore-ui/command-menu'
import {
  LayoutDashboard, LogOut, Settings, User, Sun, Moon, Search, Store,
  Package, Users, ShoppingCart, FileText, Truck,
  Wallet, BarChart3, ClipboardList, Boxes, Contact,
} from 'lucide-react'
import {
  Button,
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@asteby/metacore-ui/primitives'
import { NotificationsDropdown } from '@asteby/metacore-notifications/dropdown'
import { api } from '@/lib/api'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: createAuthGuard({ signInPath: '/sign-in' }),
  component: AuthLayout,
})

const ICON_MAP: Record<string, any> = {
  products: Package, customers: Contact, users: Users,
  orders: ShoppingCart, invoices: FileText, suppliers: Truck,
  payments: Wallet, reports: BarChart3, projects: ClipboardList,
  inventory: Boxes, contacts: Contact,
}

const SidebarLink = (props: any) => {
  const { to, children, ...rest } = props
  return <Link to={to} {...rest}>{children as any}</Link>
}

function AuthLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const user = auth.user as any

  const [commandOpen, setCommandOpen] = useState(false)
  const [navGroups, setNavGroups] = useState<NavGroupData[]>([
    { title: 'General', items: [{ title: 'Dashboard', url: '/', icon: LayoutDashboard }] },
  ])
  const [commandNavGroups, setCommandNavGroups] = useState<CommandMenuNavGroup[]>([])

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Fetch models → build sidebar + command menu
  useEffect(() => {
    api.get('/metadata/all').then((res) => {
      const tables = res.data?.data?.tables ?? {}
      const modelItems = Object.entries(tables).map(([key, meta]: [string, any]) => ({
        title: meta.title || key,
        url: `/m/${key}`,
        icon: ICON_MAP[key] || Package,
      }))

      const groups: NavGroupData[] = [
        {
          title: 'General',
          items: [{ title: 'Dashboard', url: '/', icon: LayoutDashboard }, ...modelItems],
        },
        {
          title: 'Plataforma',
          items: [
            { title: 'Marketplace', url: '/marketplace', icon: Store },
            { title: 'Configuración', url: '/settings', icon: Settings },
          ],
        },
      ]
      setNavGroups(groups)

      // Command menu nav groups
      setCommandNavGroups([
        {
          title: 'Navegación',
          items: [
            { title: 'Dashboard', url: '/' },
            ...modelItems.map((m) => ({ title: m.title, url: m.url })),
          ],
        },
      ])
    }).catch(() => {})
  }, [])

  const handleSignOut = useCallback(() => {
    auth.reset()
    navigate({ to: '/sign-in' })
  }, [auth, navigate])

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const token = auth.accessToken
  const [wsConnected, setWsConnected] = useState(false)

  // Native WebSocket — simple, no library overhead
  const wsRef = useRef<WebSocket | null>(null)
  const notifListenersRef = useRef<Set<(payload: any) => void>>(new Set())

  useEffect(() => {
    if (!token) return
    const ws = new WebSocket(`ws://localhost:7200/api/ws?token=${encodeURIComponent(token)}`)
    wsRef.current = ws
    ws.onopen = () => { setWsConnected(true); console.log('WS connected') }
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        console.log('WS message:', msg)
        if (msg.type === 'NOTIFICATION') {
          notifListenersRef.current.forEach(fn => fn(msg.payload))
        }
      } catch {}
    }
    ws.onclose = () => { setWsConnected(false); console.log('WS disconnected') }
    ws.onerror = () => {}
    return () => { ws.close() }
  }, [token])

  // Subscribe function for NotificationsDropdown
  const subscribeToNotifications = useCallback((handler: (payload: any) => void) => {
    notifListenersRef.current.add(handler)
    return () => { notifListenersRef.current.delete(handler) }
  }, [])

  return (
    <>
      {/* Command Menu (⌘K) */}
      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        navGroups={commandNavGroups}
        onNavigate={(url) => navigate({ to: url })}
        onThemeChange={(theme) => {
          if (theme === 'dark') document.documentElement.classList.add('dark')
          else if (theme === 'light') document.documentElement.classList.remove('dark')
          else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            document.documentElement.classList.toggle('dark', prefersDark)
          }
        }}
      />

      <AuthenticatedLayout
        sidebar={
          <AppSidebar
            navGroups={navGroups}
            currentHref={location.href}
            LinkComponent={SidebarLink}
            header={<OrganizationCard name={user?.organization_name || 'Metacore'} plan="Starter" />}
          />
        }
        headerChildren={
          <div className='ml-auto flex items-center gap-2 pr-4'>
            {/* Search trigger */}
            <Button variant='outline' size='sm' className='h-8 gap-2 text-muted-foreground' onClick={() => setCommandOpen(true)}>
              <Search className='h-3.5 w-3.5' />
              <span className='hidden sm:inline text-xs'>Buscar...</span>
              <kbd className='hidden sm:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground'>
                ⌘K
              </kbd>
            </Button>
            <NotificationsDropdown
              apiClient={api}
              apiBasePath='/notifications/me'
              onNotificationClick={(n: any) => n.url && navigate({ to: n.url })}
              subscribeToNotifications={subscribeToNotifications}
            />
            {/* Theme toggle */}
            <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => document.documentElement.classList.toggle('dark')}>
              <Sun className='h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0' />
              <Moon className='absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100' />
            </Button>
            {/* Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
                  <Avatar className='h-8 w-8'>
                    <AvatarFallback className='text-xs'>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-56' align='end' forceMount>
                <DropdownMenuLabel className='font-normal'>
                  <div className='flex flex-col space-y-1'>
                    <p className='text-sm font-medium leading-none'>{user?.name ?? 'Usuario'}</p>
                    <p className='text-xs leading-none text-muted-foreground'>{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: '/' })}>
                  <User className='mr-2 h-4 w-4' /> Perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: '/' })}>
                  <Settings className='mr-2 h-4 w-4' /> Configuración
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className='text-destructive'>
                  <LogOut className='mr-2 h-4 w-4' /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <Outlet />
      </AuthenticatedLayout>
    </>
  )
}
