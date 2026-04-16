'use client';

import { useInstalledAddons } from '@/hooks/use-installed-addons';

interface SlotRendererProps {
  /** Slot name, e.g. "dashboard.widgets" */
  name: string;
  /** Fallback when no contributions exist */
  fallback?: React.ReactNode;
}

/**
 * Renders all addon contributions registered for a given slot.
 *
 * In production this would read from a SlotRegistry populated by the runtime.
 * For the template, it reads `manifest.slots[name]` and renders placeholders.
 */
export function SlotRenderer({ name, fallback }: SlotRendererProps) {
  const { addons, loading } = useInstalledAddons();

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  // Collect all slot contributions from installed addons
  const contributions: { addonKey: string; component: string }[] = [];
  for (const addon of addons) {
    const slotEntries = addon.slots?.[name];
    if (slotEntries) {
      for (const entry of slotEntries) {
        contributions.push({ addonKey: addon.key, component: entry.component });
      }
    }
  }

  if (contributions.length === 0) {
    return <>{fallback ?? null}</>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {contributions.map((c, idx) => (
        <div
          key={`${c.addonKey}-${idx}`}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="text-xs text-muted-foreground mb-2 font-mono">
            {c.component}
          </div>
          <div className="text-sm text-muted-foreground">
            Slot contribution from <span className="font-medium text-foreground">{c.addonKey}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
