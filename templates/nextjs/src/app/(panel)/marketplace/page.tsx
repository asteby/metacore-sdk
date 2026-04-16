'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchCatalog, type CatalogAddon } from '@/lib/marketplace-client';
import { AddonCard, AddonCardSkeleton } from '@/components/marketplace/addon-card';
import { Search } from 'lucide-react';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'productivity', label: 'Productividad' },
  { key: 'integration', label: 'Integración' },
  { key: 'payments', label: 'Pagos' },
  { key: 'communication', label: 'Comunicación' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MarketplacePage() {
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  const load = useCallback(async () => {
    try {
      const data = await fetchCatalog();
      setAddons(data.addons);
      setInstalled(new Set(data.installed));
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter
  const filtered = addons.filter((a) => {
    const matchesSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || a.category === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Marketplace</h1>
        <p className="text-sm text-white/40 mt-1">
          Instala addons para extender tu panel
        </p>
      </div>

      {/* Search + Categories */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Buscar addons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500/30 transition-colors"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
              category === cat.key
                ? 'bg-pink-500/15 text-pink-400 border-pink-500/30'
                : 'bg-white/[0.03] text-white/40 border-white/[0.08] hover:text-white/60 hover:border-white/[0.15]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <AddonCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-white/30">No se encontraron addons</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((addon) => (
            <AddonCard
              key={addon.key}
              addon={addon}
              installed={installed.has(addon.key)}
              onStatusChange={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
