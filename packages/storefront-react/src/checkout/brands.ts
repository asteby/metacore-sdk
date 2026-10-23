/**
 * Shared catalog of the brands a checkout names: parcel carriers, card networks, wallets and cash payment points.
 *
 * Keys are the stable identifiers the providers already send (`ShippingRate.carrier` of Skydropx / Envía, the
 * `PaymentPoint.payment_point` or `id` of the payment addon, a `PaymentMethod.key`). Nothing here decides what a shop
 * offers: the server lists the rates and methods; this only gives each one its commercial name and a mark.
 *
 * Marks are typographic badges drawn by `<BrandMark>` (brand color + short wordmark): no third-party logo files are
 * bundled, so there is no licensing question and no extra request. A provider that holds a licensed logo sends it as
 * `logo_url` and it wins over the badge. Colors are close approximations of each brand's public color.
 */

export type BrandKind = 'carrier' | 'card' | 'wallet' | 'cash' | 'bank'

export type Brand = {
  key: string
  /** Commercial name, as the brand writes it. */
  name: string
  kind: BrandKind
  /** Badge background. */
  bg: string
  /** Badge text color (AA on `bg`). */
  fg: string
  /** Short wordmark drawn in the badge. Default: `name`. */
  mark?: string
  /** Special drawings instead of a wordmark. */
  shape?: 'mastercard'
}

const B = (key: string, name: string, kind: BrandKind, bg: string, fg: string, mark?: string, shape?: Brand['shape']): Brand => ({
  key,
  name,
  kind,
  bg,
  fg,
  ...(mark ? { mark } : {}),
  ...(shape ? { shape } : {}),
})

const LIST: Brand[] = [
  // Parcel carriers (Mexico and global).
  B('fedex', 'FedEx', 'carrier', '#4D148C', '#FFFFFF'),
  B('dhl', 'DHL', 'carrier', '#FFCC00', '#B00410'),
  B('estafeta', 'Estafeta', 'carrier', '#C8102E', '#FFFFFF'),
  B('paquetexpress', 'Paquetexpress', 'carrier', '#0B4EA2', '#FFFFFF', 'PAQX'),
  B('ups', 'UPS', 'carrier', '#351C15', '#FFB500'),
  B('redpack', 'Redpack', 'carrier', '#C8102E', '#FFFFFF'),
  B('99minutos', '99 Minutos', 'carrier', '#00704A', '#FFFFFF', '99'),
  B('jtexpress', 'J&T Express', 'carrier', '#C8102E', '#FFFFFF', 'J&T'),
  B('sendex', 'Sendex', 'carrier', '#003A70', '#FFFFFF'),
  B('ampm', 'AMPM', 'carrier', '#1D1D1B', '#FFFFFF'),
  B('tresguerras', 'Tresguerras', 'carrier', '#005BAC', '#FFFFFF', '3G'),
  B('quiken', 'Quiken', 'carrier', '#1D1D1B', '#FFFFFF'),
  B('imile', 'iMile', 'carrier', '#0057B8', '#FFFFFF'),
  B('carssa', 'Carssa', 'carrier', '#00529B', '#FFFFFF'),
  B('correosdemexico', 'Correos de México', 'carrier', '#7A1E3A', '#FFFFFF', 'Correos'),
  B('usps', 'USPS', 'carrier', '#333366', '#FFFFFF'),
  B('canadapost', 'Canada Post', 'carrier', '#DA291C', '#FFFFFF', 'CPC'),
  // Card networks.
  B('visa', 'Visa', 'card', '#1A1F71', '#FFFFFF', 'VISA'),
  B('mastercard', 'Mastercard', 'card', '#FFFFFF', '#1D1D1B', 'MC', 'mastercard'),
  B('amex', 'American Express', 'card', '#1F72CD', '#FFFFFF', 'AMEX'),
  B('carnet', 'Carnet', 'card', '#003B71', '#FFFFFF'),
  // Wallets and payment providers.
  B('mercadopago', 'Mercado Pago', 'wallet', '#00B1EA', '#0B1F4E', 'MP'),
  B('paypal', 'PayPal', 'wallet', '#003087', '#FFFFFF'),
  B('clip', 'Clip', 'wallet', '#FC4C02', '#1D1D1B'),
  B('applepay', 'Apple Pay', 'wallet', '#000000', '#FFFFFF', 'Pay'),
  B('googlepay', 'Google Pay', 'wallet', '#FFFFFF', '#3C4043', 'G Pay'),
  // Cash points and transfers (Mexico).
  B('oxxo', 'OXXO', 'cash', '#E21E26', '#FFE600'),
  B('spei', 'SPEI', 'bank', '#14365F', '#FFFFFF'),
  B('stp', 'STP', 'bank', '#14365F', '#FFFFFF', 'SPEI'),
  B('7eleven', '7-Eleven', 'cash', '#00704A', '#FFFFFF', '7-11'),
  B('circlek', 'Circle K', 'cash', '#DA291C', '#FFFFFF', 'K'),
  B('soriana', 'Soriana', 'cash', '#C8102E', '#FFFFFF'),
  B('extra', 'Extra', 'cash', '#E35205', '#FFFFFF'),
  B('kiosko', 'Kiosko', 'cash', '#C8102E', '#FFFFFF'),
  B('calimax', 'Calimax', 'cash', '#D52B1E', '#FFFFFF'),
  B('farmaciasyza', 'Farmacias Yza', 'cash', '#0A5A9C', '#FFFFFF', 'Yza'),
  B('chedraui', 'Chedraui', 'cash', '#0047BB', '#FFFFFF'),
  B('casaley', 'Casa Ley', 'cash', '#C8102E', '#FFFFFF', 'Ley'),
  B('telecomm', 'Telecomm', 'cash', '#6F1D46', '#FFFFFF'),
  B('walmart', 'Walmart', 'cash', '#0071CE', '#FFFFFF'),
  B('santander', 'Santander', 'bank', '#C00000', '#FFFFFF'),
  B('bbva', 'BBVA', 'bank', '#004481', '#FFFFFF'),
  B('citibanamex', 'Citibanamex', 'bank', '#004B8D', '#FFFFFF', 'Citi'),
  B('banorte', 'Banorte', 'bank', '#C8102E', '#FFFFFF'),
]

/** Alternative spellings that providers send for the same brand (already normalized by `brandKey`). */
const ALIASES: Record<string, string> = {
  fedexmx: 'fedex',
  fedexexpress: 'fedex',
  dhlexpress: 'dhl',
  dhlmx: 'dhl',
  paquetexpres: 'paquetexpress',
  paqueteexpress: 'paquetexpress',
  jt: 'jtexpress',
  jandtexpress: 'jtexpress',
  noventaynueveminutos: '99minutos',
  correos: 'correosdemexico',
  sepomex: 'correosdemexico',
  master: 'mastercard',
  americanexpress: 'amex',
  mercadopagomx: 'mercadopago',
  mp: 'mercadopago',
  clabe: 'spei',
  banktransfer: 'spei',
  seveneleven: '7eleven',
  '711': '7eleven',
  circulok: 'circlek',
  yza: 'farmaciasyza',
  bancomer: 'bbva',
  banamex: 'citibanamex',
  ley: 'casaley',
}

const BY_KEY = new Map(LIST.map((b) => [b.key, b]))

/** `"FedEx México"`, `"fedex_mx"` and `"FEDEX"` all become `fedex`. Lowercase ASCII letters and digits only. */
export function brandKey(raw: string | null | undefined): string {
  const flat = (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
  const noCountry = flat.endsWith('mexico') && flat !== 'correosdemexico' ? flat.slice(0, -6) : flat
  return ALIASES[noCountry] ?? (BY_KEY.has(noCountry) ? noCountry : ALIASES[flat] ?? flat)
}

/** Catalog entry for a provider identifier, or `null` when the brand is not in the catalog. */
export function findBrand(raw: string | null | undefined): Brand | null {
  return BY_KEY.get(brandKey(raw)) ?? null
}

/**
 * Commercial name for a provider identifier: the catalog's (`fedex` → "FedEx") or, for an unknown one, the identifier
 * in title case (`"envios_rapidos"` → "Envios Rapidos"). `null` for an empty input.
 */
export function brandName(raw: string | null | undefined): string | null {
  const brand = findBrand(raw)
  if (brand) return brand.name
  const text = (raw ?? '').trim()
  if (!text) return null
  // Already cased by the provider ("Envía Plus"): keep it.
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return text
  return text
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Every brand of the catalog (for docs, previews and tests). */
export function listBrands(kind?: BrandKind): Brand[] {
  return kind ? LIST.filter((b) => b.kind === kind) : [...LIST]
}
