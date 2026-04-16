'use client';

import { useEffect, useState } from 'react';
import { type AddonManifest, MOCK_ADDONS } from '@/lib/mock-addons';

interface UseInstalledAddonsReturn {
  addons: AddonManifest[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the list of installed addon manifests.
 * In the starter template this returns mock data.
 * In production it would call `/api/metacore/installations`.
 */
export function useInstalledAddons(): UseInstalledAddonsReturn {
  const [addons, setAddons] = useState<AddonManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Production: const res = await fetch('/api/metacore/installations');
        // For the template, simulate a network delay then return mocks.
        await new Promise((r) => setTimeout(r, 300));
        if (!cancelled) {
          setAddons(MOCK_ADDONS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load addons');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { addons, loading, error };
}
