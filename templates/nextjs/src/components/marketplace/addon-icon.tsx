'use client';

// Renders an addon icon — either a Lucide icon or a brand logo placeholder.
// For brand icons we render a colored circle with the first letter (in a real
// app these would be actual SVG brand logos fetched from the hub CDN).

import {
  Ticket,
  FileText,
  ShoppingCart,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const LUCIDE_MAP: Record<string, LucideIcon> = {
  Ticket,
  FileText,
  ShoppingCart,
  Package,
};

interface AddonIconProps {
  iconType: 'lucide' | 'brand';
  iconSlug: string;
  iconColor: string;
  size?: number;
}

export function AddonIcon({ iconType, iconSlug, iconColor, size = 40 }: AddonIconProps) {
  const color = `#${iconColor}`;

  if (iconType === 'lucide') {
    const Icon = LUCIDE_MAP[iconSlug];
    return (
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: `${color}15`,
        }}
      >
        {Icon ? (
          <Icon size={size * 0.5} style={{ color }} />
        ) : (
          <Package size={size * 0.5} style={{ color }} />
        )}
      </div>
    );
  }

  // Brand icon — colored circle with first letter as placeholder.
  // In production, replace with <img src={`${hubCdn}/icons/${iconSlug}.svg`} />.
  const letter = iconSlug.charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-lg font-bold text-white flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.4,
      }}
    >
      {letter}
    </div>
  );
}
