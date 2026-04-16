// Mock addon manifests for the starter template.
// These let the panel render a full UI without a live backend.

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'email' | 'textarea';
  required?: boolean;
  options?: string[];
}

export interface ModelDefinition {
  model_key: string;
  label: string;
  label_plural: string;
  icon: string;
  fields: FieldDefinition[];
}

export interface NavigationItem {
  label: string;
  href: string;
  icon: string;
}

export interface AddonManifest {
  key: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  navigation: NavigationItem[];
  model_definitions: ModelDefinition[];
  slots?: Record<string, { component: string }[]>;
}

// ---------------------------------------------------------------------------
// Mock manifests
// ---------------------------------------------------------------------------

export const MOCK_ADDONS: AddonManifest[] = [
  {
    key: 'tickets',
    name: 'Support Tickets',
    version: '1.2.0',
    description: 'Customer support ticket management',
    icon: 'TicketCheck',
    navigation: [
      { label: 'Tickets', href: '/m/tickets', icon: 'TicketCheck' },
      { label: 'Agents', href: '/m/agents', icon: 'Users' },
    ],
    model_definitions: [
      {
        model_key: 'tickets',
        label: 'Ticket',
        label_plural: 'Tickets',
        icon: 'TicketCheck',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: ['open', 'in_progress', 'resolved', 'closed'],
          },
          {
            key: 'priority',
            label: 'Priority',
            type: 'select',
            options: ['low', 'medium', 'high', 'urgent'],
          },
          { key: 'customer_email', label: 'Customer Email', type: 'email' },
          { key: 'created_at', label: 'Created', type: 'date' },
        ],
      },
      {
        model_key: 'agents',
        label: 'Agent',
        label_plural: 'Agents',
        icon: 'Users',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'email', label: 'Email', type: 'email', required: true },
          {
            key: 'department',
            label: 'Department',
            type: 'select',
            options: ['support', 'billing', 'technical'],
          },
        ],
      },
    ],
  },
  {
    key: 'orders',
    name: 'Order Management',
    version: '0.9.1',
    description: 'E-commerce order tracking and fulfillment',
    icon: 'ShoppingCart',
    navigation: [
      { label: 'Orders', href: '/m/orders', icon: 'ShoppingCart' },
      { label: 'Products', href: '/m/products', icon: 'Package' },
    ],
    model_definitions: [
      {
        model_key: 'orders',
        label: 'Order',
        label_plural: 'Orders',
        icon: 'ShoppingCart',
        fields: [
          { key: 'order_number', label: 'Order #', type: 'text', required: true },
          { key: 'customer_name', label: 'Customer', type: 'text', required: true },
          { key: 'customer_email', label: 'Email', type: 'email' },
          { key: 'total', label: 'Total', type: 'number' },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
          },
          { key: 'created_at', label: 'Date', type: 'date' },
        ],
      },
      {
        model_key: 'products',
        label: 'Product',
        label_plural: 'Products',
        icon: 'Package',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'sku', label: 'SKU', type: 'text', required: true },
          { key: 'price', label: 'Price', type: 'number', required: true },
          { key: 'stock', label: 'Stock', type: 'number' },
          { key: 'description', label: 'Description', type: 'textarea' },
        ],
      },
    ],
    slots: {
      'dashboard.widgets': [
        { component: 'orders:RevenueWidget' },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Mock records (sample data for DynamicTable)
// ---------------------------------------------------------------------------

const MOCK_RECORDS: Record<string, Record<string, unknown>[]> = {
  tickets: [
    { id: '1', title: 'Login not working', status: 'open', priority: 'high', customer_email: 'user@test.com', created_at: '2026-04-10' },
    { id: '2', title: 'Payment failed', status: 'in_progress', priority: 'urgent', customer_email: 'buyer@shop.com', created_at: '2026-04-12' },
    { id: '3', title: 'Feature request: dark mode', status: 'resolved', priority: 'low', customer_email: 'fan@app.com', created_at: '2026-04-08' },
  ],
  agents: [
    { id: '1', name: 'Ana Torres', email: 'ana@company.com', department: 'support' },
    { id: '2', name: 'Carlos Ruiz', email: 'carlos@company.com', department: 'technical' },
  ],
  orders: [
    { id: '1', order_number: 'ORD-001', customer_name: 'Maria Lopez', customer_email: 'maria@mail.com', total: 259.99, status: 'shipped', created_at: '2026-04-11' },
    { id: '2', order_number: 'ORD-002', customer_name: 'Juan Perez', customer_email: 'juan@mail.com', total: 49.00, status: 'pending', created_at: '2026-04-14' },
    { id: '3', order_number: 'ORD-003', customer_name: 'Sofia Chen', customer_email: 'sofia@mail.com', total: 899.50, status: 'delivered', created_at: '2026-04-09' },
  ],
  products: [
    { id: '1', name: 'Widget Pro', sku: 'WGT-PRO', price: 29.99, stock: 142, description: 'Professional-grade widget' },
    { id: '2', name: 'Gadget Mini', sku: 'GDG-MINI', price: 9.99, stock: 500, description: 'Compact gadget' },
  ],
};

export function getMockRecords(modelKey: string): Record<string, unknown>[] {
  return MOCK_RECORDS[modelKey] ?? [];
}

export function getMockRecord(modelKey: string, id: string): Record<string, unknown> | null {
  const records = MOCK_RECORDS[modelKey] ?? [];
  return records.find((r) => r.id === id) ?? null;
}
