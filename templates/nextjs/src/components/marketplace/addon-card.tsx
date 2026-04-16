'use client';

import Link from 'next/link';
import type { CatalogAddon } from '@/lib/marketplace-client';
import { InstallButton } from './install-button';
import { AddonIcon } from './addon-icon';

// ---------------------------------------------------------------------------
// Category pill colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  integration: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  payments: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  communication: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
};

function categoryStyle(cat: string) {
  return CATEGORY_COLORS[cat] ?? 'bg-white/10 text-white/60 border-white/10';
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface AddonCardProps {
  addon: CatalogAddon;
  installed: boolean;
  onStatusChange: () => void;
}

export function AddonCard({ addon, installed, onStatusChange }: AddonCardProps) {
  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <Link href={`/marketplace/${addon.key}`} className="flex items-center gap-3 min-w-0">
          <AddonIcon
            iconType={addon.icon_type}
            iconSlug={addon.icon_slug}
            iconColor={addon.icon_color}
            size={40}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-white truncate">
                {addon.name}
              </h3>
              {addon.author === 'Metacore' && (
                <span title="Verificado por Metacore" className="text-pink-400 flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
            {addon.version && (
              <span className="text-[11px] text-white/30">v{addon.version}</span>
            )}
          </div>
        </Link>
      </div>

      {/* Description */}
      <Link href={`/marketplace/${addon.key}`}>
        <p className="text-xs text-white/50 leading-relaxed line-clamp-2 mb-4 min-h-[2.5rem]">
          {addon.description}
        </p>
      </Link>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${categoryStyle(addon.category)}`}
        >
          {addon.category}
        </span>

        <InstallButton
          addonKey={addon.key}
          version={addon.version}
          installed={installed}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

export function AddonCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-white/[0.06]" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-24 rounded bg-white/[0.06]" />
          <div className="h-2.5 w-12 rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="space-y-1.5 mb-4">
        <div className="h-2.5 w-full rounded bg-white/[0.04]" />
        <div className="h-2.5 w-3/4 rounded bg-white/[0.04]" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-5 w-16 rounded-full bg-white/[0.04]" />
        <div className="h-7 w-20 rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}
