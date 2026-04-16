'use client';

import { useMemo } from 'react';
import { getSession, type Session } from '@/lib/auth';
import { useInstalledAddons } from './use-installed-addons';
import { metacoreConfig } from '../../metacore.config';

export interface MetacoreContext {
  /** Current authenticated session (null if not logged in) */
  session: Session | null;
  /** Host configuration */
  config: typeof metacoreConfig;
  /** Installed addon manifests */
  addons: ReturnType<typeof useInstalledAddons>;
}

/**
 * Central hook for accessing the metacore host context.
 * Combines session, config, and addon data into one access point.
 */
export function useMetacore(): MetacoreContext {
  const session = useMemo(() => getSession(), []);
  const addons = useInstalledAddons();

  return {
    session,
    config: metacoreConfig,
    addons,
  };
}
