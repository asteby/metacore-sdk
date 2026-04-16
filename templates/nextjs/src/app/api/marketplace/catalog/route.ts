import { NextResponse } from 'next/server';
import type { CatalogAddon } from '@/lib/marketplace-client';

// ---------------------------------------------------------------------------
// Hub URL — read from env or metacore.config.ts
// ---------------------------------------------------------------------------

const HUB_URL = process.env.HUB_URL ?? 'https://hub.metacore.dev';

// ---------------------------------------------------------------------------
// In-memory installed addons store (shared across routes via module scope)
// In production the kernel would own this state.
// ---------------------------------------------------------------------------

export const installedAddons = new Set<string>(['tickets', 'orders']);

// ---------------------------------------------------------------------------
// Mock catalog — used when hub is unreachable
// ---------------------------------------------------------------------------

const MOCK_CATALOG: CatalogAddon[] = [
  {
    key: 'tickets',
    name: 'Tickets',
    category: 'productivity',
    description: 'Gestiona tickets de soporte con tablero Kanban, asignación y SLA.',
    icon_type: 'lucide',
    icon_slug: 'Ticket',
    icon_color: 'F59E0B',
    version: '1.2.0',
    author: 'Metacore',
    features: ['Tablero Kanban', 'Asignación automática', 'SLA tracking', 'Etiquetas'],
    tools: [
      { id: 'create_ticket', name: 'Crear ticket', description: 'Crea un nuevo ticket de soporte', params: ['title', 'priority', 'assignee'] },
      { id: 'list_tickets', name: 'Listar tickets', description: 'Lista tickets con filtros', params: ['status', 'assignee'] },
    ],
    settings: [
      { key: 'default_priority', label: 'Prioridad por defecto', type: 'select', secret: false },
      { key: 'webhook_url', label: 'Webhook URL', type: 'url', secret: false },
    ],
  },
  {
    key: 'fiscal_mexico',
    name: 'Facturación México',
    category: 'integration',
    description: 'CFDI 4.0 vía factura.com con timbrado automático y catálogo SAT.',
    icon_type: 'lucide',
    icon_slug: 'FileText',
    icon_color: 'F59E0B',
    version: '2.0.1',
    author: 'Metacore',
    features: ['CFDI 4.0', 'Timbrado automático', 'Catálogo SAT', 'Complementos de pago'],
    tools: [
      { id: 'create_invoice', name: 'Crear factura', description: 'Genera un CFDI 4.0', params: ['rfc', 'items', 'payment_method'] },
      { id: 'cancel_invoice', name: 'Cancelar factura', description: 'Cancela un CFDI existente', params: ['uuid', 'reason'] },
    ],
    settings: [
      { key: 'api_key', label: 'API Key factura.com', type: 'text', secret: true },
      { key: 'sandbox', label: 'Modo sandbox', type: 'boolean', secret: false },
    ],
  },
  {
    key: 'stripe',
    name: 'Stripe',
    category: 'payments',
    description: 'Pagos con Stripe: checkout, suscripciones y facturación.',
    icon_type: 'brand',
    icon_slug: 'stripe',
    icon_color: '635BFF',
    version: '3.1.0',
    author: 'Metacore',
    features: ['Checkout Sessions', 'Suscripciones', 'Webhooks', 'Portal de cliente'],
    tools: [
      { id: 'create_checkout', name: 'Crear checkout', description: 'Crea sesión de checkout', params: ['amount', 'currency', 'customer'] },
    ],
    settings: [
      { key: 'secret_key', label: 'Secret Key', type: 'text', secret: true },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'text', secret: true },
    ],
  },
  {
    key: 'whatsapp_outbound',
    name: 'WhatsApp',
    category: 'communication',
    description: 'Mensajería WhatsApp Business con plantillas y envíos masivos.',
    icon_type: 'brand',
    icon_slug: 'whatsapp',
    icon_color: '25D366',
    version: '1.0.0',
    author: 'Metacore',
    features: ['Plantillas HSM', 'Envíos masivos', 'Webhooks entrantes', 'Media'],
    tools: [
      { id: 'send_message', name: 'Enviar mensaje', description: 'Envía un mensaje de WhatsApp', params: ['phone', 'template', 'params'] },
    ],
    settings: [
      { key: 'access_token', label: 'Access Token', type: 'text', secret: true },
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', secret: false },
    ],
  },
  {
    key: 'notion',
    name: 'Notion',
    category: 'productivity',
    description: 'Integra con Notion: sincroniza bases de datos y páginas.',
    icon_type: 'brand',
    icon_slug: 'notion',
    icon_color: '000000',
    version: '0.9.0',
    author: 'Community',
    features: ['Sync de databases', 'Creación de páginas', 'Búsqueda'],
    tools: [
      { id: 'query_database', name: 'Consultar base', description: 'Consulta una Notion database', params: ['database_id', 'filter'] },
    ],
    settings: [
      { key: 'integration_token', label: 'Integration Token', type: 'text', secret: true },
    ],
  },
  {
    key: 'orders',
    name: 'Pedidos',
    category: 'productivity',
    description: 'Gestión de pedidos con seguimiento, inventario y notificaciones.',
    icon_type: 'lucide',
    icon_slug: 'ShoppingCart',
    icon_color: '10B981',
    version: '1.5.0',
    author: 'Metacore',
    features: ['Tracking de pedidos', 'Inventario', 'Notificaciones', 'Reportes'],
    tools: [
      { id: 'create_order', name: 'Crear pedido', description: 'Crea un nuevo pedido', params: ['items', 'customer', 'shipping'] },
      { id: 'update_status', name: 'Actualizar estado', description: 'Cambia el estado del pedido', params: ['order_id', 'status'] },
    ],
    settings: [
      { key: 'notify_email', label: 'Email de notificaciones', type: 'email', secret: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedCatalog: CatalogAddon[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getCatalog(): Promise<CatalogAddon[]> {
  const now = Date.now();
  if (cachedCatalog && now - cacheTimestamp < CACHE_TTL) {
    return cachedCatalog;
  }

  try {
    const res = await fetch(`${HUB_URL}/v1/catalog`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Hub responded ${res.status}`);

    const data = await res.json();
    cachedCatalog = data.addons ?? data;
    cacheTimestamp = now;
    return cachedCatalog!;
  } catch {
    // Hub unreachable — fall back to mock data
    cachedCatalog = MOCK_CATALOG;
    cacheTimestamp = now;
    return MOCK_CATALOG;
  }
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/catalog
// ---------------------------------------------------------------------------

export async function GET() {
  const addons = await getCatalog();
  return NextResponse.json({
    addons,
    installed: Array.from(installedAddons),
  });
}
