import * as React from 'react'
import { cn } from '@/lib/utils'
import { getCookie } from '@/lib/cookies'
import { SidebarInset, SidebarProvider } from '@/primitives/sidebar'
import { SkipToMain } from '@/dialogs/skip-to-main'
import { Header } from './header'

export interface AuthenticatedLayoutProps {
  /**
   * The page content. Usually a `<Outlet />` from the consumer's router.
   */
  children: React.ReactNode
  /**
   * Sidebar element — consumers typically pass an `<AppSidebar>` configured
   * with their nav data. Required.
   */
  sidebar: React.ReactNode
  /**
   * Header content (e.g. theme switch, profile dropdown). Placed inside a
   * sticky `<Header>` at the top of the main area.
   */
  headerChildren?: React.ReactNode
  /**
   * Optional wrapper rendered above the main content (e.g. a core-update banner).
   */
  topBanner?: React.ReactNode
  /**
   * Optional widget rendered as a sibling of the sidebar (e.g. an AI chat widget).
   */
  widget?: React.ReactNode
  /**
   * Controlled open state for the sidebar; delegates to cookie by default.
   */
  defaultOpen?: boolean
}

/**
 * Authenticated shell — sidebar + header + main content.
 *
 * The original app coupled this to `LayoutProvider`, `SearchProvider`,
 * `WebSocketProvider`, and a dozen app-specific widgets. In the SDK version
 * consumers compose their own provider tree around this shell and pass the
 * sidebar as a prop.
 */
export function AuthenticatedLayout({
  children,
  sidebar,
  headerChildren,
  topBanner,
  widget,
  defaultOpen,
}: AuthenticatedLayoutProps) {
  const initialOpen =
    typeof defaultOpen === 'boolean'
      ? defaultOpen
      : getCookie('sidebar_state') !== 'false'

  return (
    <SidebarProvider defaultOpen={initialOpen}>
      <SkipToMain />
      {sidebar}
      <SidebarInset
        className={cn(
          '@container/content',
          'has-data-[layout=fixed]:h-svh',
          'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
        )}
      >
        {topBanner}
        <Header fixed>
          <div className='ms-auto flex items-center space-x-4'>
            {headerChildren}
          </div>
        </Header>
        <main
          id='main-content'
          className='flex-1 flex flex-col min-h-0 outline-none'
        >
          {children}
        </main>
      </SidebarInset>
      {widget}
    </SidebarProvider>
  )
}
