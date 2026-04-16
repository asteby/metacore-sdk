// Marketplace client — browser-side helpers to interact with the marketplace
// API routes. All state lives server-side; these are thin fetch wrappers.

export interface CatalogAddon {
  key: string;
  name: string;
  category: string;
  description: string;
  icon_type: 'lucide' | 'brand';
  icon_slug: string;
  icon_color: string;
  version?: string;
  author?: string;
  features?: string[];
  tools?: { id: string; name: string; description: string; params: string[] }[];
  settings?: { key: string; label: string; type: string; secret: boolean }[];
}

export interface CatalogResponse {
  addons: CatalogAddon[];
  installed: string[];
}

// ---------------------------------------------------------------------------
// Fetch catalog (proxied through our API route)
// ---------------------------------------------------------------------------

export async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch('/api/marketplace/catalog', { next: { revalidate: 0 } });
  if (!res.ok) throw new Error('Error al cargar el catálogo');
  return res.json();
}

// ---------------------------------------------------------------------------
// Install / Uninstall
// ---------------------------------------------------------------------------

export async function installAddon(
  addonKey: string,
  version = 'latest',
): Promise<void> {
  const res = await fetch('/api/marketplace/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addonKey, version }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Error al instalar addon');
  }
}

export async function uninstallAddon(addonKey: string): Promise<void> {
  const res = await fetch('/api/marketplace/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addonKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Error al desinstalar addon');
  }
}
