'use client';

import { useRequireAuth } from '@/hooks/use-require-auth';
import { AppShell } from '@/components/shell/app-shell';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, loading } = useRequireAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    // useRequireAuth already redirects; this prevents flash
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
