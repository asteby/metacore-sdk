'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchCatalog, type CatalogAddon } from '@/lib/marketplace-client';
import { AddonDetail } from '@/components/marketplace/addon-detail';
import { ArrowLeft } from 'lucide-react';

export default function MarketplaceDetailPage() {
  const params = useParams<{ key: string }>();
  const router = useRouter();
  const [addon, setAddon] = useState<CatalogAddon | null>(null);
  const [installed, setInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchCatalog();
      const found = data.addons.find((a) => a.key === params.key);
      if (!found) {
        setNotFound(true);
        return;
      }
      setAddon(found);
      setInstalled(data.installed.includes(params.key));
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  }, [params.key]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-lg bg-white/[0.06]" />
            <div className="space-y-2 flex-1">
              <div className="h-6 w-40 rounded bg-white/[0.06]" />
              <div className="h-4 w-24 rounded bg-white/[0.04]" />
            </div>
          </div>
          <div className="h-4 w-full rounded bg-white/[0.04]" />
          <div className="h-4 w-3/4 rounded bg-white/[0.04]" />
          <div className="h-10 w-28 rounded-lg bg-white/[0.06]" />
        </div>
      </div>
    );
  }

  if (notFound || !addon) {
    return (
      <div className="p-6 lg:p-10 max-w-3xl mx-auto text-center py-20">
        <p className="text-white/40 text-sm mb-4">Addon no encontrado</p>
        <button
          onClick={() => router.push('/marketplace')}
          className="text-sm text-pink-400 hover:text-pink-300 transition-colors"
        >
          Volver al Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      {/* Back link */}
      <button
        onClick={() => router.push('/marketplace')}
        className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Marketplace
      </button>

      <AddonDetail addon={addon} installed={installed} onStatusChange={load} />
    </div>
  );
}
