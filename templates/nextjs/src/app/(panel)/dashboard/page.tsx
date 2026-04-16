'use client';

import { useInstalledAddons } from '@/hooks/use-installed-addons';
import { SlotRenderer } from '@/components/shell/slot-renderer';

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { addons, loading } = useInstalledAddons();

  const totalAddons = addons.length;
  const activeAddons = addons.length;
  const totalModels = addons.reduce((sum, a) => sum + a.model_definitions.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your metacore panel
        </p>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Addons" value={String(totalAddons)} description="Installed addons" />
          <StatCard label="Active" value={String(activeAddons)} description="Running now" />
          <StatCard label="Models" value={String(totalModels)} description="Data models registered" />
          <StatCard label="Revenue" value="$0.00" description="Coming soon" />
        </div>
      )}

      {/* Addon-contributed widgets */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Addon Widgets</h2>
        <SlotRenderer name="dashboard.widgets" />
      </div>

      {/* Empty state */}
      {!loading && addons.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-1">No addons installed</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Install your first addon from the marketplace to get started.
          </p>
          <a
            href="/marketplace"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Browse Marketplace
          </a>
        </div>
      )}

      {/* Quick links to models */}
      {!loading && addons.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {addons.flatMap((addon) =>
              addon.model_definitions.map((model) => (
                <a
                  key={`${addon.key}-${model.model_key}`}
                  href={`/m/${model.model_key}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {model.label.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{model.label_plural}</p>
                    <p className="text-xs text-muted-foreground">{addon.name}</p>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
