'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { getSession, signOut } from '@/lib/auth';
import { metacoreConfig } from '../../../metacore.config';

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid lucide dependency issues in template)
// ---------------------------------------------------------------------------

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark' | 'system';

function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('mc-theme') as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem('mc-theme', theme);
    const root = document.documentElement;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const cycle = () => {
    setTheme((prev) => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'system';
      return 'dark';
    });
  };

  return { theme, cycle };
}

// ---------------------------------------------------------------------------
// Breadcrumb builder
// ---------------------------------------------------------------------------

function buildBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const crumbs: { label: string; href: string }[] = [
    { label: 'Home', href: '/dashboard' },
  ];

  const segments = pathname.split('/').filter(Boolean);

  let path = '';
  for (const seg of segments) {
    path += `/${seg}`;
    const label = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
    crumbs.push({ label, href: path });
  }

  return crumbs;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AppTopbarProps {
  onMenuClick?: () => void;
}

export function AppTopbar({ onMenuClick }: AppTopbarProps) {
  const pathname = usePathname();
  const { theme, cycle } = useTheme();
  const session = getSession();
  const breadcrumbs = buildBreadcrumbs(pathname);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/50 bg-background/80 backdrop-blur-sm px-4 lg:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 flex-1">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1 truncate">
            {i > 0 && <span className="mx-1 text-muted-foreground/50">/</span>}
            {i === breadcrumbs.length - 1 ? (
              <span className="text-foreground font-medium truncate">{crumb.label}</span>
            ) : (
              <a href={crumb.href} className="hover:text-foreground transition-colors truncate">
                {crumb.label}
              </a>
            )}
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Search */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted transition-colors border border-border/50"
          onClick={() => {/* TODO: Cmd+K modal */}}
        >
          <SearchIcon />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={cycle}
          className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          title={`Theme: ${theme}`}
        >
          {theme === 'dark' ? <MoonIcon /> : theme === 'light' ? <SunIcon /> : <SunIcon />}
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
              {session?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <span className="hidden sm:inline text-sm font-medium">{session?.name ?? 'User'}</span>
            <ChevronDownIcon className="text-muted-foreground" />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-border bg-card shadow-lg py-1">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-medium">{session?.name}</p>
                  <p className="text-xs text-muted-foreground">{session?.email}</p>
                </div>
                <a href="/settings" className="block px-3 py-2 text-sm hover:bg-muted transition-colors">
                  Profile
                </a>
                <a href="/settings" className="block px-3 py-2 text-sm hover:bg-muted transition-colors">
                  Settings
                </a>
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-muted transition-colors"
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
