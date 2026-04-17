import { Outlet } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'
import { Header } from '@/components/layout/header'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { LanguageSwitcher } from '@/components/language-switcher'
import { PrinterConfig } from '@/components/print'
import { CoreUpdateBanner } from '@/components/core-update-banner'
import { AIChatWidget } from '@/components/ai-chat/ai-chat-widget'


type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

import { WebSocketProvider } from '@/context/websocket-provider'

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  return (
    <SearchProvider>
      <WebSocketProvider>
        <LayoutProvider>
          <SidebarProvider defaultOpen={defaultOpen}>
            <SkipToMain />
            <AppSidebar />
            <SidebarInset
              className={cn(
                // Set content container, so we can use container queries
                '@container/content',

                // If layout is fixed, set the height
                // to 100svh to prevent overflow
                'has-data-[layout=fixed]:h-svh',

                // If layout is fixed and sidebar is inset,
                // set the height to 100svh - spacing (total margins) to prevent overflow
                'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]'
              )}
            >
              <CoreUpdateBanner />
              <Header fixed>
                <div className='ms-auto flex items-center space-x-4'>
                  <Search />
                  <LanguageSwitcher />
                  <ThemeSwitch />

                  <PrinterConfig />
                  <ConfigDrawer />
                  <NotificationsDropdown />
                  <ProfileDropdown />
                </div>
              </Header>
              <main id='main-content' className='flex-1 flex flex-col min-h-0 outline-none'>
                {children ?? <Outlet />}
              </main>
            </SidebarInset>
            <AIChatWidget />
          </SidebarProvider>
        </LayoutProvider>
      </WebSocketProvider>
    </SearchProvider>
  )
}
