import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router'
import { createAuthGuard } from '@asteby/metacore-auth/guards'
import { AuthenticatedLayout, AppSidebar, OrganizationCard } from '@asteby/metacore-ui/layout'
import type { NavGroupData } from '@asteby/metacore-ui/layout'
import { LayoutDashboard, Users } from 'lucide-react'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: createAuthGuard({ signInPath: '/sign-in' }),
  component: AuthLayout,
})

// Sidebar nav — extend or generate dynamically from your backend metadata.
const navGroups: NavGroupData[] = [
  {
    title: 'General',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'Users', url: '/users', icon: Users },
    ],
  },
]

// Adapter so tanstack-router's <Link> satisfies `AppSidebar`'s LinkComponent
// contract. Handles the `to` prop + forwards anchor attributes.
const SidebarLink = (props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => {
  const { to, children, ...rest } = props
  return (
    <Link to={to} {...rest}>
      {children as any}
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
