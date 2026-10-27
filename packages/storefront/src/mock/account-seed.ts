/**
 * Orders of the demo buyer (`cus_1`) that rehearse every state of the account screen (contract 1.8): shipped with
 * events, an issued invoice with its credit note and a refund, a sandbox shipment (never shown as real), a pickup that
 * is ready with a section the server could not read, and a cash voucher waiting for payment. Numbers are below 1000 and
 * dates older than the original seed order, so the order list still starts at `1000` and the first checkout is `1001`.
 */
import type { InvoiceDoc, Money, Order, PendingPayment, Shipment } from '../types.js'

type Seeded = Order & { customer_id: string | null }

const money = (cents: number, currency: string): Money => ({ amount: (cents / 100).toFixed(2), currency_code: currency })

const line = (title: string, variant: string | null, quantity: number, unitCents: number, currency: string) => ({
  title,
  variant_title: variant,
  sku: null,
  quantity,
  unit: money(unitCents, currency),
  total: money(unitCents * quantity, currency),
  image: null,
})

const address = { first_name: 'Ana', last_name: 'Prueba', city: 'Querétaro', province: 'Qro.', zip: '76000', country_code: 'MX' }

export function buildAccountOrders(currency: string): Seeded[] {
  const inTransit: Shipment = {
    id: 'shp_seed_1',
    number: 'ENV-00001',
    kind: 'outbound',
    status: 'in_transit',
    environment: 'production',
    test_mode: false,
    carrier: 'Estafeta',
    carrier_logo_key: 'estafeta',
    service: 'Terrestre',
    tracking_number: '8012345678',
    tracking_url: 'https://rastreo.example.com/estafeta/8012345678',
    shipped_at: '2026-08-12T15:00:00.000Z',
    delivered_at: null,
    promised_by: '2026-08-16',
    label_url: null,
    events: [
      { id: 'evt_3', status: 'in_transit', description: 'En tránsito hacia tu ciudad', location: 'Querétaro, Qro.', occurred_at: '2026-08-14T09:30:00.000Z', source: 'carrier' },
      { id: 'evt_2', status: 'in_transit', description: 'Salió del centro de distribución', location: 'Ciudad de México, CDMX', occurred_at: '2026-08-13T07:10:00.000Z', source: 'carrier' },
      { id: 'evt_1', status: 'label_created', description: 'Guía generada', location: null, occurred_at: '2026-08-12T15:00:00.000Z', source: 'store' },
    ],
    map: {
      origin: { label: 'Ciudad de México, CDMX', lat: 19.43, lng: -99.13, precision: 'city' },
      destination: { label: 'Querétaro, Qro.', lat: 20.6, lng: -100.4, precision: 'city' },
      path: [{ label: 'Querétaro, Qro.', lat: 20.59, lng: -100.39, precision: 'city' }],
    },
  }
  const invoice: InvoiceDoc = {
    id: 'inv_seed_1',
    status: 'issued',
    kind: 'invoice',
    stage: 'issued',
    action: 'download',
    can_request: false,
    folio: '8F3C1A52-6E0B-4B58-9C0D-2B7D6B4D7A11',
    series: 'A',
    folio_number: '1042',
    total: money(129900, currency),
    issued_at: '2026-08-13T10:00:00.000Z',
    payment_method: 'PUE',
    payment_form: '04',
    receiver: { rfc: 'XAXX010101000', name: 'Público en general', tax_regime: '616', cfdi_use: 'S01', postal_code: '76000' },
    test_mode: false,
    environment: 'production',
  }
  const creditNote: InvoiceDoc = {
    id: 'inv_seed_1_nc',
    status: 'issued',
    kind: 'credit_note',
    stage: 'issued',
    action: 'download',
    can_request: false,
    folio: '1D9B7E20-4A5C-4C4B-8F11-6A0E3C9D5B02',
    series: 'NC',
    folio_number: '7',
    total: money(20000, currency),
    issued_at: '2026-08-15T10:00:00.000Z',
    related_to: 'inv_seed_1',
    test_mode: false,
    environment: 'production',
  }
  return [
    {
      id: 'ord_seed_shipped',
      number: '0999',
      status: 'shipped',
      created_at: '2026-08-12T12:00:00.000Z',
      total: money(129900, currency),
      customer_id: 'cus_1',
      lines: [line('Kit de frenos', 'Delantero', 1, 109900, currency), line('Líquido de frenos', '500 ml', 1, 20000, currency)],
      delivery_method: 'shipping',
      payment_status: 'paid',
      subtotal: money(111983, currency),
      tax: money(17917, currency),
      shipping: money(0, currency),
      discount: money(0, currency),
      tax_included: true,
      shipping_method: 'Estándar',
      shipping_address: address,
      returns: [],
      shipments: [inTransit],
      invoices: [invoice, creditNote],
      payments: [{ method_label: 'Tarjeta Visa terminada en 4242', family: 'card', status: 'partially_refunded', amount: money(129900, currency), paid_at: '2026-08-12T12:01:00.000Z' }],
      refunds: [{ id: 'rfd_seed_1', amount: money(20000, currency), status: 'completed', method_label: 'Tarjeta Visa terminada en 4242', created_at: '2026-08-15T09:00:00.000Z', completed_at: '2026-08-15T10:00:00.000Z', return_id: null }],
    },
    {
      id: 'ord_seed_preparing',
      number: '0998',
      status: 'fulfilling',
      created_at: '2026-08-11T12:00:00.000Z',
      total: money(54900, currency),
      customer_id: 'cus_1',
      lines: [line('Filtro de aceite', null, 3, 18300, currency)],
      delivery_method: 'shipping',
      payment_status: 'paid',
      shipping_method: 'shipping:Envío Estafeta',
      shipping_service: { title: 'Envío Estafeta', carrier: 'estafeta', carrier_logo_key: 'estafeta', eta_days_min: 1, eta_days_max: 3 },
      shipping_address: address,
      shipments: [],
      invoices: [],
      payments: [{ method_label: 'OXXO', family: 'cash_voucher', status: 'paid', amount: money(54900, currency), paid_at: '2026-08-11T18:00:00.000Z' }],
      refunds: [],
    },
    {
      id: 'ord_seed_sandbox',
      number: '0997',
      status: 'shipped',
      created_at: '2026-08-10T12:00:00.000Z',
      total: money(31000, currency),
      customer_id: 'cus_1',
      lines: [line('Bujía iridio', null, 4, 7750, currency)],
      delivery_method: 'shipping',
      payment_status: 'paid',
      shipments: [
        {
          id: 'shp_seed_test',
          kind: 'outbound',
          status: 'label_created',
          environment: 'sandbox',
          test_mode: true,
          carrier: 'Estafeta',
          carrier_logo_key: 'estafeta',
          tracking_number: null,
          tracking_url: null,
          events: [],
          map: null,
        },
      ],
      invoices: [
        { id: 'inv_seed_test', status: 'issued', kind: 'invoice', stage: 'issued', action: 'download', can_request: false, folio: '00000000-0000-4000-8000-000000000000', test_mode: true, environment: 'sandbox' },
      ],
      payments: [],
      refunds: [],
    },
    {
      id: 'ord_seed_pickup',
      number: '0996',
      status: 'ready_for_pickup',
      created_at: '2026-08-09T12:00:00.000Z',
      total: money(88000, currency),
      customer_id: 'cus_1',
      lines: [line('Batería 12V', null, 1, 88000, currency)],
      delivery_method: 'pickup',
      pickup: { location_id: null, name: 'Sucursal Centro', address: 'Av. Reforma 100', city: 'Ciudad de México', phone: null, ready_at: '2026-08-10T10:00:00.000Z', delivered_at: null },
      payment_status: 'paid',
      shipments: [],
      invoices: [],
      payments: [],
      refunds: [],
      degraded: ['invoices'],
    },
  ]
}

/** A voucher still valid (OXXO, with barcode) and one that already expired (SPEI). */
export function buildPendingPayments(currency: string, nowMs: number): PendingPayment[] {
  return [
    {
      id: 'chk_seed_oxxo',
      number: null,
      status: 'pending_payment',
      created_at: new Date(nowMs - 3_600_000).toISOString(),
      total: money(45000, currency),
      expires_at: new Date(nowMs + 47 * 3_600_000).toISOString(),
      payment: {
        provider: 'mercadopago',
        method: 'oxxo',
        reference: '12345678901234',
        barcode: '12345678901234',
        clabe: null,
        voucher_url: 'https://pagos.example.com/ficha/abc',
        instructions: 'Paga en cualquier OXXO antes de la fecha de vencimiento.',
        expires_at: new Date(nowMs + 47 * 3_600_000).toISOString(),
        amount: money(45000, currency),
      },
    },
    {
      id: 'chk_seed_spei',
      number: null,
      status: 'expired',
      created_at: new Date(nowMs - 9 * 86_400_000).toISOString(),
      total: money(120000, currency),
      expires_at: new Date(nowMs - 2 * 86_400_000).toISOString(),
      payment: {
        provider: 'mercadopago',
        method: 'spei',
        reference: null,
        barcode: null,
        clabe: '646180000000000001',
        voucher_url: null,
        instructions: null,
        expires_at: new Date(nowMs - 2 * 86_400_000).toISOString(),
        amount: money(120000, currency),
      },
    },
  ]
}

/**
 * `count` more orders of the demo buyer, to rehearse a long history (paging, filters, a B2B buyer with hundreds of
 * orders): numbers `S0001`…, one an hour back from 2026-08-01, with a mix of states, delivery methods, parcels and invoices.
 * Deterministic: the same count always gives the same orders.
 */
export function buildSyntheticOrders(count: number, currency: string): Seeded[] {
  const out: Seeded[] = []
  const base = Date.parse('2026-08-01T12:00:00.000Z')
  for (let i = 1; i <= count; i++) {
    const kind = i % 6
    const status = kind === 0 ? 'cancelled' : kind === 1 ? 'pending_payment' : kind === 2 ? 'fulfilling' : kind === 3 ? 'shipped' : 'delivered'
    const pickup = i % 5 === 0
    const number = `S${String(i).padStart(4, '0')}`
    const total = 10000 + ((i * 7919) % 90000)
    const o: Seeded = {
      id: `ord_syn_${i}`,
      number,
      status,
      created_at: new Date(base - i * 3600_000).toISOString(),
      total: money(total, currency),
      customer_id: 'cus_1',
      lines: [line(`Producto ${i}`, null, 1 + (i % 3), Math.round(total / (1 + (i % 3))), currency)],
      delivery_method: pickup ? 'pickup' : 'shipping',
      payment_status: status === 'pending_payment' ? 'pending' : status === 'cancelled' ? 'cancelled' : 'paid',
      shipping_address: address,
    }
    if (!pickup && (status === 'shipped' || status === 'delivered')) {
      o.shipments = [
        {
          id: `shp_syn_${i}`,
          number: `ENV-S${i}`,
          kind: 'outbound',
          status: status === 'delivered' ? 'delivered' : 'in_transit',
          environment: 'production',
          test_mode: false,
          carrier: i % 2 ? 'Estafeta' : 'DHL',
          carrier_logo_key: i % 2 ? 'estafeta' : 'dhl',
          service: 'Terrestre',
          tracking_number: `SYN${String(i).padStart(8, '0')}`,
          tracking_url: `https://rastreo.example.com/syn/${i}`,
          shipped_at: new Date(base - i * 3600_000 + 7200_000).toISOString(),
          delivered_at: status === 'delivered' ? new Date(base - i * 3600_000 + 86400_000).toISOString() : null,
          promised_by: null,
          label_url: null,
          events: [],
          map: null,
        },
      ]
    } else if (!pickup && status === 'fulfilling') {
      o.shipping_service = { title: 'Envío Estafeta', carrier: 'estafeta', carrier_logo_key: 'estafeta', eta_days_min: 1, eta_days_max: 3 }
      o.shipments = []
    }
    if (status === 'delivered' && i % 3 === 1) {
      o.invoices = [
        {
          id: `inv_syn_${i}`,
          status: 'issued',
          kind: 'invoice',
          stage: 'issued',
          action: 'download',
          can_request: false,
          folio: `SYN-${String(i).padStart(8, '0')}`,
          series: 'A',
          folio_number: String(2000 + i),
          total: money(total, currency),
          issued_at: new Date(base - i * 3600_000 + 3600_000).toISOString(),
          test_mode: false,
          environment: 'production',
        },
      ]
    }
    out.push(o)
  }
  return out
}
