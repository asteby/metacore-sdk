/**
 * Fallback product mockups: the pure, framework-agnostic half.
 *
 * When a product from OPS has no image, a store can draw an illustration
 * (tire, part, supplement or a generic box) from the product's own data. This
 * module decides WHICH illustration (`resolveMockupKind`) and WHAT it may show
 * (`mockupDataFromProduct`). Rendering lives in `@asteby/storefront-react/mockups`.
 *
 * Rules every extractor follows:
 * - Only data that is in the product (attributes, vendor, title, options, the
 *   selected variant). Nothing is guessed: a missing size stays missing.
 * - Never prices.
 * - Every string is cleaned (control characters removed, whitespace collapsed)
 *   and capped by `MOCKUP_TEXT_LIMITS`. Escaping is the renderer's job (React
 *   escapes text and attributes); these values are plain text, never markup.
 */
import type { Product, ProductAttributeValue, ProductVariant } from './types.js'

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** Built-in kinds. Stores can register more (any string). */
export type BuiltinMockupKind = 'tire' | 'part' | 'supplement' | 'generic'

/** A mockup kind: a built-in one or any kind a store registers. */
export type MockupKind = BuiltinMockupKind | (string & {})

export const BUILTIN_MOCKUP_KINDS: readonly BuiltinMockupKind[] = ['tire', 'part', 'supplement', 'generic']

/** The product fields mockups read. A full `Product` satisfies it. */
export type MockupProduct = Pick<Product, 'title'> &
  Partial<Pick<Product, 'handle' | 'vendor' | 'product_type' | 'category' | 'tags' | 'attributes' | 'options'>>

/** The variant fields mockups read (selected flavor, presentation...). */
export type MockupVariant = Partial<Pick<ProductVariant, 'selected_options' | 'title'>>

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Maximum characters per field (counted in code points, ellipsis included). */
export const MOCKUP_TEXT_LIMITS = {
  title: 80,
  brand: 32,
  model: 40,
  size: 24,
  service: 12,
  partNumber: 32,
  fitment: 90,
  position: 24,
  category: 40,
  flavor: 32,
  presentation: 32,
  monogram: 2,
} as const

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g

/**
 * Plain, single-line text capped at `max` code points (with `…` when cut).
 * Returns `null` for empty values, so callers can skip the line entirely.
 */
export function cleanMockupText(value: unknown, max: number = MOCKUP_TEXT_LIMITS.title): string | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const text = String(value).replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const chars = Array.from(text)
  if (chars.length <= max) return text
  if (max <= 1) return '…'
  return chars.slice(0, max - 1).join('').trimEnd() + '…'
}

/** Up to two letters taken from the words of `text` (e.g. "Casa Textil" → "CT"). */
export function mockupMonogram(text: string | null | undefined): string | null {
  const words = (cleanMockupText(text, 200) ?? '').split(' ').map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
  if (!words.length) return null
  const letters = words.length === 1 ? Array.from(words[0]!).slice(0, 2) : [Array.from(words[0]!)[0]!, Array.from(words[1]!)[0]!]
  return letters.join('').toLocaleUpperCase('es')
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

type Attrs = Record<string, ProductAttributeValue>

/** First attribute (by key, case-insensitive) that has a usable value. */
function attr(attrs: Attrs | undefined, keys: readonly string[]): ProductAttributeValue | undefined {
  if (!attrs) return undefined
  const lower = new Map(Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), v]))
  for (const key of keys) {
    const v = lower.get(key)
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && !v.trim()) continue
    return v
  }
  return undefined
}

function attrText(attrs: Attrs | undefined, keys: readonly string[], max: number): string | null {
  const v = attr(attrs, keys)
  return typeof v === 'boolean' ? null : cleanMockupText(v, max)
}

function attrNumber(attrs: Attrs | undefined, keys: readonly string[]): number | null {
  const v = attr(attrs, keys)
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null
  if (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number.parseFloat(v)
  return null
}

function attrFlag(attrs: Attrs | undefined, keys: readonly string[]): boolean {
  const v = attr(attrs, keys)
  return v === true || (typeof v === 'string' && /^(true|s[ií]|yes|1)$/i.test(v.trim()))
}

/** Value of an option: from the selected variant, or the product's only value. */
function optionValue(product: MockupProduct, variant: MockupVariant | null | undefined, names: RegExp, max: number): string | null {
  const selected = variant?.selected_options?.find((o) => names.test(o.name.trim()))
  if (selected) return cleanMockupText(selected.value, max)
  const option = product.options?.find((o) => names.test(o.name.trim()))
  return option && option.values.length === 1 ? cleanMockupText(option.values[0], max) : null
}

const fmtNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))))

// ---------------------------------------------------------------------------
// Data per kind
// ---------------------------------------------------------------------------

type MockupCommon = {
  /** Product title, always present (the accessible name is built from it). */
  title: string
  /** Brand (`vendor`). */
  brand: string | null
}

export type TireMockupData = MockupCommon & {
  kind: 'tire'
  /** Size as written in OPS (`size_key`/`size`) or built from width/aspect/rim when all three exist. */
  size: string | null
  /** Split size when width, aspect and rim are all known (for the big digits). */
  width: string | null
  aspect: string | null
  rim: string | null
  /** Tread line / model (`model`, `line`, `tread`...). */
  model: string | null
  /** Service description, e.g. `91V` or `121/118S` (load index + speed rating). */
  service: string | null
  lightTruck: boolean
  runFlat: boolean
}

export type PartMockupData = MockupCommon & {
  kind: 'part'
  partNumber: string | null
  oemNumber: string | null
  /** Compatibility as sent by OPS (`fitment`, `compatibility`...). */
  fitment: string | null
  position: string | null
  category: string | null
}

export type SupplementShape = 'tub' | 'bottle' | 'bag'

export type SupplementMockupData = MockupCommon & {
  kind: 'supplement'
  flavor: string | null
  /** Net content / presentation, e.g. `5 lb`, `120 cápsulas`, or `servings` (number). */
  presentation: string | null
  /** Number of servings when OPS sends it as a number (the label adds the unit). */
  servings: number | null
  shape: SupplementShape
}

export type GenericMockupData = MockupCommon & {
  kind: 'generic'
  monogram: string | null
  category: string | null
}

export type MockupDataMap = {
  tire: TireMockupData
  part: PartMockupData
  supplement: SupplementMockupData
  generic: GenericMockupData
}

/** Data of any built-in kind. */
export type BuiltinMockupData = MockupDataMap[BuiltinMockupKind]

function common(product: MockupProduct): MockupCommon {
  return {
    title: cleanMockupText(product.title, MOCKUP_TEXT_LIMITS.title) ?? '',
    brand: cleanMockupText(product.vendor, MOCKUP_TEXT_LIMITS.brand),
  }
}

const TIRE_KEYS = {
  size: ['size_key', 'size', 'tire_size', 'medida'],
  width: ['section_width_mm', 'section_width', 'width', 'ancho'],
  aspect: ['aspect_ratio', 'aspect', 'profile', 'perfil'],
  rim: ['rim_diameter_in', 'rim_diameter', 'rim', 'rin'],
  model: ['model', 'modelo', 'tread', 'pattern', 'line', 'linea', 'línea'],
  loadService: ['load_service', 'service_description'],
  load: ['load_index', 'indice_carga', 'índice_de_carga'],
  speed: ['speed_rating', 'speed_index', 'indice_velocidad', 'índice_de_velocidad'],
  lightTruck: ['light_truck', 'lt'],
  runFlat: ['runflat', 'run_flat'],
} as const

/** Tire data from the product attributes (`size_key`, `section_width_mm`, `load_index`, `speed_rating`...). */
export function tireMockupData(product: MockupProduct): TireMockupData {
  const a = product.attributes
  const w = attrNumber(a, TIRE_KEYS.width)
  const ar = attrNumber(a, TIRE_KEYS.aspect)
  const r = attrNumber(a, TIRE_KEYS.rim)
  const split = w !== null && ar !== null && r !== null
  const written = attrText(a, TIRE_KEYS.size, MOCKUP_TEXT_LIMITS.size)
  const size = written ?? (split ? `${fmtNumber(w)}/${fmtNumber(ar)}R${fmtNumber(r)}` : null)
  const loadService = attrText(a, TIRE_KEYS.loadService, MOCKUP_TEXT_LIMITS.service)
  const load = attrText(a, TIRE_KEYS.load, 7)
  const speed = attrText(a, TIRE_KEYS.speed, 3)
  const service = cleanMockupText(loadService ? loadService + (speed && !loadService.endsWith(speed) ? speed : '') : (load ?? '') + (speed ?? ''), MOCKUP_TEXT_LIMITS.service)
  return {
    kind: 'tire',
    ...common(product),
    size,
    width: split ? fmtNumber(w) : null,
    aspect: split ? fmtNumber(ar) : null,
    rim: split ? fmtNumber(r) : null,
    model: attrText(a, TIRE_KEYS.model, MOCKUP_TEXT_LIMITS.model),
    service,
    lightTruck: attrFlag(a, TIRE_KEYS.lightTruck),
    runFlat: attrFlag(a, TIRE_KEYS.runFlat),
  }
}

const PART_KEYS = {
  partNumber: ['part_number', 'mpn', 'numero_de_parte', 'número_de_parte', 'no_parte'],
  oem: ['oem_number', 'oem', 'oem_part_number'],
  fitment: ['fitment', 'fitment_summary', 'compatibility', 'compatible_with', 'compatibilidad', 'aplicaciones', 'vehicle'],
  position: ['position', 'posicion', 'posición'],
} as const

/** Part data: part number, OEM number, compatibility and position (attributes), category title. */
export function partMockupData(product: MockupProduct): PartMockupData {
  const a = product.attributes
  return {
    kind: 'part',
    ...common(product),
    partNumber: attrText(a, PART_KEYS.partNumber, MOCKUP_TEXT_LIMITS.partNumber),
    oemNumber: attrText(a, PART_KEYS.oem, MOCKUP_TEXT_LIMITS.partNumber),
    fitment: attrText(a, PART_KEYS.fitment, MOCKUP_TEXT_LIMITS.fitment),
    position: attrText(a, PART_KEYS.position, MOCKUP_TEXT_LIMITS.position),
    category: cleanMockupText(product.category?.title, MOCKUP_TEXT_LIMITS.category),
  }
}

const SUPPLEMENT_KEYS = {
  flavor: ['flavor', 'flavour', 'sabor'],
  presentation: ['presentation', 'presentacion', 'presentación', 'net_content', 'contenido_neto', 'net_weight', 'peso_neto'],
  servings: ['servings', 'porciones', 'servicios'],
  form: ['container', 'envase', 'form', 'forma', 'presentation_form'],
} as const

function supplementShape(product: MockupProduct): SupplementShape {
  const form = String(attr(product.attributes, SUPPLEMENT_KEYS.form) ?? '').toLowerCase()
  if (/bottle|frasco|c[aá]psula|capsule|tableta|tablet|softgel|gomita|gummy|l[ií]quido|liquid/.test(form)) return 'bottle'
  if (/bag|bolsa|doypack|pouch|sobre/.test(form)) return 'bag'
  return 'tub'
}

/** Supplement data: flavor and presentation (selected variant, single-valued option or attribute). */
export function supplementMockupData(product: MockupProduct, variant?: MockupVariant | null): SupplementMockupData {
  const a = product.attributes
  const servings = attrNumber(a, SUPPLEMENT_KEYS.servings)
  return {
    kind: 'supplement',
    ...common(product),
    flavor: optionValue(product, variant, /^(sabor|flavou?r)$/i, MOCKUP_TEXT_LIMITS.flavor) ?? attrText(a, SUPPLEMENT_KEYS.flavor, MOCKUP_TEXT_LIMITS.flavor),
    presentation:
      optionValue(product, variant, /^(presentaci[oó]n|tama[nñ]o|size|contenido|peso)$/i, MOCKUP_TEXT_LIMITS.presentation) ??
      attrText(a, SUPPLEMENT_KEYS.presentation, MOCKUP_TEXT_LIMITS.presentation),
    servings: servings !== null && Number.isInteger(servings) ? servings : null,
    shape: supplementShape(product),
  }
}

/** Generic data: title, brand, a monogram of the title and the category. */
export function genericMockupData(product: MockupProduct): GenericMockupData {
  return {
    kind: 'generic',
    ...common(product),
    monogram: mockupMonogram(product.title),
    category: cleanMockupText(product.category?.title ?? product.product_type, MOCKUP_TEXT_LIMITS.category),
  }
}

/** Data for a built-in kind; unknown kinds get the generic data. */
export function mockupDataFromProduct<K extends BuiltinMockupKind>(kind: K, product: MockupProduct, variant?: MockupVariant | null): MockupDataMap[K]
export function mockupDataFromProduct(kind: MockupKind, product: MockupProduct, variant?: MockupVariant | null): BuiltinMockupData
export function mockupDataFromProduct(kind: MockupKind, product: MockupProduct, variant?: MockupVariant | null): BuiltinMockupData {
  switch (kind) {
    case 'tire':
      return tireMockupData(product)
    case 'part':
      return partMockupData(product)
    case 'supplement':
      return supplementMockupData(product, variant)
    default:
      return genericMockupData(product)
  }
}

// ---------------------------------------------------------------------------
// Kind resolution
// ---------------------------------------------------------------------------

/** Attribute a merchant can set in OPS to pick the mockup explicitly (`mockup`, `mockup_kind`). */
export const MOCKUP_KIND_ATTRIBUTES = ['mockup_kind', 'mockup'] as const

export type MockupKindRule = {
  kind: MockupKind
  /** Matched against `product_type`, `category.title/handle` and `tags`. */
  text?: RegExp
  /** Any of these attribute keys present (with a value) selects the kind. */
  attributes?: readonly string[]
}

/** Default rules, checked in order: attributes first (precise), then words. */
export const DEFAULT_MOCKUP_KIND_RULES: readonly MockupKindRule[] = [
  { kind: 'tire', attributes: ['size_key', 'section_width_mm', 'rim_diameter_in', 'aspect_ratio', 'speed_rating', 'load_index'] },
  { kind: 'part', attributes: ['part_number', 'oem_number', 'mpn'] },
  { kind: 'tire', text: /\b(llantas?|neum[aá]ticos?|tires?|tyres?)\b/i },
  { kind: 'part', text: /\b(refacci[oó]n(es)?|autopartes?|repuestos?|spare[ -]?parts?|auto[ -]?parts?)\b/i },
  {
    kind: 'supplement',
    text: /\b(suplementos?|supplements?|prote[ií]nas?|whey|creatina|creatine|amino[aá]cidos?|bcaa|pre-?entrenos?|pre-?workout|col[aá]geno|vitaminas?|multivitam[ií]nicos?|omega[ -]?3|electrolitos?|termog[eé]nicos?|ganadores? de masa)\b/i,
  },
]

export type ResolveMockupKindOptions = {
  /** Rules to use instead of `DEFAULT_MOCKUP_KIND_RULES`. */
  rules?: readonly MockupKindRule[]
  /** When set, an explicit `mockup_kind` attribute is only honored if it is in this list. */
  kinds?: readonly MockupKind[]
  /** Kind when nothing matches (default `generic`). */
  fallback?: MockupKind
}

function hasAttr(attrs: Attrs | undefined, keys: readonly string[]): boolean {
  if (!attrs) return false
  return keys.some((k) => {
    const v = attrs[k]
    return v !== undefined && v !== null && v !== false && !(typeof v === 'string' && !v.trim())
  })
}

/**
 * Picks a mockup kind from the product: the explicit `mockup_kind` attribute,
 * then attribute rules (tire specs, part numbers), then words in the product
 * type, category and tags. Falls back to `generic`.
 */
export function resolveMockupKind(product: MockupProduct, options: ResolveMockupKindOptions = {}): MockupKind {
  const explicit = attr(product.attributes, MOCKUP_KIND_ATTRIBUTES)
  if (typeof explicit === 'string') {
    const k = explicit.trim().toLowerCase()
    if (/^[a-z][a-z0-9_-]{0,31}$/.test(k) && (!options.kinds || options.kinds.includes(k))) return k
  }
  const haystack = [product.product_type, product.category?.title, product.category?.handle?.replace(/-/g, ' '), ...(product.tags ?? [])]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' · ')
  for (const rule of options.rules ?? DEFAULT_MOCKUP_KIND_RULES) {
    if (rule.attributes && hasAttr(product.attributes, rule.attributes)) return rule.kind
    if (rule.text && haystack && rule.text.test(haystack)) return rule.kind
  }
  return options.fallback ?? 'generic'
}
