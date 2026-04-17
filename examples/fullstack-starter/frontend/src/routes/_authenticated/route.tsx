import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { createAuthGuard } from '@asteby/metacore-auth/guards'
import { AuthenticatedLayout, AppSidebar, OrganizationCard } from '@asteby/metacore-ui/layout'
import type { NavGroupData } from '@asteby/metacore-ui/layout'
import { LayoutDashboard, Package, Users, Webhook } from 'lucide-react'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: createAuthGuard({ signInPath: '/sign-in' }),
  component: AuthLayout,
})

const navGroups: NavGroupData[] = [
  {
    title: 'General',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'Products', url: '/products', icon: Package },
      { title: 'Customers', url: '/customers', icon: Users },
    ],
  },
  {
    title: 'Settings',
    items: [
      { title: 'Webhooks', url: '/webhooks', icon: Webhook },
    ],
  },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SidebarLink = (props: any) => {
  const { to, children, ...rest } = props
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  )
}

function AuthLayout() {
  const location = useLocation()
  return (
    <AuthenticatedLayout
      sidebar={
        <AppSidebar
          navGroups={navGroups}
          currentHref={location.href}
          LinkComponent={SidebarLink}
          header={<OrganizationCard name="Metacore" plan="Starter" />}
        />
      }
    >
      <Outlet />
    </AuthenticatedLayout>
  )
}
