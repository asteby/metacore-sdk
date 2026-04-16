'use client';

import { useState } from 'react';
import { installAddon, uninstallAddon } from '@/lib/marketplace-client';

type ButtonState = 'idle' | 'installing' | 'installed' | 'uninstalling';

interface InstallButtonProps {
  addonKey: string;
  version?: string;
  installed: boolean;
  onStatusChange?: () => void;
  size?: 'sm' | 'md';
}

export function InstallButton({
  addonKey,
  version = 'latest',
  installed,
  onStatusChange,
  size = 'sm',
}: InstallButtonProps) {
  const [state, setState] = useState<ButtonState>(installed ? 'installed' : 'idle');
  const [hovering, setHovering] = useState(false);

  async function handleClick() {
    if (state === 'installing' || state === 'uninstalling') return;

    if (state === 'installed') {
      setState('uninstalling');
      try {
        await uninstallAddon(addonKey);
        setState('idle');
        onStatusChange?.();
      } catch {
        setState('installed');
      }
    } else {
      setState('installing');
      try {
        await installAddon(addonKey, version);
        setState('installed');
        onStatusChange?.();
      } catch {
        setState('idle');
      }
    }
  }

  const pad = size === 'sm' ? 'px-4 py-1.5 text-xs' : 'px-6 py-2.5 text-sm';

  if (state === 'installing') {
    return (
      <button
        disabled
        className={`${pad} rounded-lg font-medium bg-white/5 text-white/50 border border-white/10 cursor-wait transition-all duration-300`}
      >
        <span className="inline-flex items-center gap-1.5">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Instalando...
        </span>
      </button>
    );
  }

  if (state === 'uninstalling') {
    return (
      <button
        disabled
        className={`${pad} rounded-lg font-medium bg-red-500/10 text-red-400/60 border border-red-500/20 cursor-wait transition-all duration-300`}
      >
        <span className="inline-flex items-center gap-1.5">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Removiendo...
        </span>
      </button>
    );
  }

  if (state === 'installed') {
    return (
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`${pad} rounded-lg font-medium border transition-all duration-300 ${
          hovering
            ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        }`}
      >
        {hovering ? 'Desinstalar' : 'Instalado \u2713'}
      </button>
    );
  }

  // idle
  return (
    <button
      onClick={handleClick}
      className={`${pad} rounded-lg font-medium text-white bg-gradient-to-r from-pink-500 to-rose-500 shadow-lg shadow-pink-500/20 hover:from-pink-600 hover:to-rose-600 transition-all duration-300 hover:shadow-pink-500/30`}
    >
      Instalar
    </button>
  );
}
