'use client';

import { usePathname } from 'next/navigation';
import { getSession, signOut } from '@/lib/auth';
import { useInstalledAddons } from '@/hooks/use-installed-addons';
import { metacoreConfig } from '../../../metacore.config';

// ---------------------------------------------------------------------------
// Inline icons — keeps the template self-contained without lucide dep
// ---------------------------------------------------------------------------

const ICONS: Record<string, (p: { className?: string }) => React.ReactNode> = {
  LayoutDashboard: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
  ),
  Settings: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  TicketCheck: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="m9 12 2 2 4-4" /></svg>
  ),
  Users: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  ShoppingCart: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
  ),
  Package: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
  ),
  Store: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /><path d="M2 7h20" /><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" /></svg>
  ),
  LogOut: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
  ),
  ChevronsLeft: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg>
  ),
  ChevronsRight: ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></svg>
  ),
};

function Icon({ name, className }: { name: string; className?: string }) {
  const Comp = ICONS[name];
  if (!Comp) return <span className={className}>?</span>;
  return <>{Comp({ className })}</>;
}

// ---------------------------------------------------------------------------
// Nav item
// ---------------------------------------------------------------------------

function NavItem({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <a
      href={href}
      className={`
        group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all
        ${active
          ? 'bg-primary/10 text-primary border-l-2 border-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent'
        }
        ${collapsed ? 'justify-center px-2' : ''}
      `}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname();
  const session = getSession();
  const { addons, loading } = useInstalledAddons();

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <aside
      className={`
        flex flex-col h-full bg-card/80 backdrop-blur border-r border-border/50
        transition-all duration-200 ease-in-out
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Logo */}
      <div className={`flex items-center h-14 border-b border-border/50 px-4 ${collapsed ? 'justify-center px-2' : 'gap-3'}`}>
        {metacoreConfig.logo ? (
          <img
            src={metacoreConfig.logo}
            alt={metacoreConfig.appName}
            className="h-7 w-7 shrink-0 rounded"
          />
        ) : (
          <div className="h-7 w-7 shrink-0 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
            {metacoreConfig.appName.charAt(0)}
          </div>
        )}
        {!collapsed && (
          <span className="text-sm font-semibold truncate">{metacoreConfig.appName}</span>
        )}
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-6">
        {/* Core navigation */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Core
            </p>
          )}
          <div className="space-y-0.5">
            {metacoreConfig.coreNavigation.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname === item.href}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>

        {/* Addon navigation */}
        {loading ? (
          <div className="space-y-2 px-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-8 rounded-md bg-muted/50 animate-pulse ${collapsed ? 'w-8' : ''}`} />
            ))}
          </div>
        ) : (
          addons.map((addon) => (
            <div key={addon.key}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {addon.name}
                </p>
              )}
              <div className="space-y-0.5">
                {addon.navigation.map((nav) => (
                  <NavItem
                    key={nav.href}
                    href={nav.href}
                    icon={nav.icon}
                    label={nav.label}
                    active={pathname === nav.href || pathname.startsWith(nav.href + '/')}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Marketplace link */}
        <div>
          {!collapsed && (
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Explore
            </p>
          )}
          <NavItem
            href="/marketplace"
            icon="Store"
            label="Marketplace"
            active={pathname.startsWith('/marketplace')}
            collapsed={collapsed}
          />
        </div>
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-1">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'ChevronsRight' : 'ChevronsLeft'} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* Footer: user info */}
      <div className={`border-t border-border/50 p-3 ${collapsed ? 'flex flex-col items-center gap-2 px-2' : ''}`}>
        <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : ''}`}>
          <div className="w-8 h-8 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
            {session?.name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session?.name ?? 'User'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {session?.orgId ?? 'Organization'}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
            title="Log out"
          >
            <Icon name="LogOut" />
          </button>
        </div>
      </div>
    </aside>
  );
}
