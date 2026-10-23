/**
 * Region fixture of the mock. It mirrors the shape `GET /storefront/region` has for Mexico (the `MX:csf` identity
 * document included) so a storefront can be built and tested without a server. It lives here, and only here:
 * the real data belongs to the region package of the store, and the engine in `fiscal-document` knows no country.
 */
import type { IdentityDocumentSpec, IdentityRulesV1, InvoiceRequest, Region, RegionFiscalEntry, RegionFiscalId } from '../types.js'

const PN = ['individual']
const PM = ['company']

const REGIMES: RegionFiscalEntry[] = [
  { code: '601', label: 'General de Ley Personas Morales', person_types: PM, match_phrases: ['general de ley personas morales'] },
  { code: '603', label: 'Personas Morales con Fines no Lucrativos', person_types: PM, match_phrases: ['fines no lucrativos'] },
  { code: '605', label: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', person_types: PN, match_phrases: ['sueldos y salarios'] },
  { code: '606', label: 'Arrendamiento', person_types: PN, match_phrases: ['arrendamiento'] },
  { code: '608', label: 'Demás ingresos', person_types: PN, match_phrases: ['demas ingresos'] },
  { code: '612', label: 'Personas Físicas con Actividades Empresariales y Profesionales', person_types: PN, match_phrases: ['actividades empresariales y profesionales'] },
  { code: '616', label: 'Sin obligaciones fiscales', person_types: PN, match_phrases: ['sin obligaciones fiscales'] },
  { code: '621', label: 'Incorporación Fiscal', person_types: PN, match_phrases: ['incorporacion fiscal'] },
  { code: '625', label: 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', person_types: PN, match_phrases: ['plataformas tecnologicas'] },
  { code: '626', label: 'Régimen Simplificado de Confianza', person_types: [...PN, ...PM], match_phrases: ['simplificado de confianza'] },
]

const BUSINESS = ['601', '603', '606', '612', '621', '625', '626']

const USES: RegionFiscalEntry[] = [
  { code: 'G01', label: 'Adquisición de mercancías', person_types: [...PN, ...PM], allowed_regimes: BUSINESS },
  { code: 'G03', label: 'Gastos en general', person_types: [...PN, ...PM], allowed_regimes: BUSINESS },
  { code: 'D10', label: 'Pagos por servicios educativos', person_types: PN, allowed_regimes: ['605', '606', '608', '612', '621', '625', '626'] },
  { code: 'S01', label: 'Sin efectos fiscales', person_types: [...PN, ...PM], allowed_regimes: ['601', '603', '605', '606', '608', '612', '616', '621', '625', '626'] },
]

/** Labels of the constancia, accent-less (the engine matches on accent-less text). */
const CSF_LABELS = [
  'rfc',
  'curp',
  'nombre \\(s\\)',
  'nombre',
  'primer apellido',
  'segundo apellido',
  'denominacion\\s*/\\s*razon social',
  'regimen de capital',
  'nombre comercial',
  'fecha (?:de )?inicio de operaciones',
  'fecha de constitucion',
  'estatus en el padron',
  'fecha de ultimo cambio de estado',
  'datos del domicilio registrado',
  'codigo postal',
  'tipo de vialidad',
  'nombre de vialidad',
  'numero exterior',
  'numero interior',
  'nombre de la colonia',
  'nombre de la localidad',
  'nombre del municipio o demarcacion territorial',
  'nombre de la entidad federativa',
  'entre calle',
  'y calle',
  'actividades economicas',
  'regimenes',
  'obligaciones',
  'correo electronico',
]

const TAX_ID = '^[A-ZN&]{3,4}\\d{6}[A-Z0-9]{3}$'

export const MOCK_CSF_RULES: IdentityRulesV1 = {
  fold: true,
  labels: CSF_LABELS,
  fields: {
    tax_id: {
      first_of: [
        { strategy: 'labeled_lines', label: 'rfc', transform: ['upper', 'alnum'], accept: TAX_ID },
        { strategy: 'regex', pattern: '\\b([A-ZN&]{3,4}\\d{6}[A-Z0-9]{3})\\b', transform: ['upper'] },
      ],
    },
    curp: { strategy: 'labeled_lines', label: 'curp', transform: ['upper', 'alnum'], accept: '^[A-Z0-9]{18}$' },
    legal_name: {
      first_of: [
        { strategy: 'labeled_lines', label: 'denominacion\\s*/\\s*razon social' },
        { strategy: 'concat_labeled', labels: ['nombre \\(s\\)', 'primer apellido', 'segundo apellido'] },
      ],
    },
    postal_code: { strategy: 'labeled_lines', label: 'codigo postal', transform: ['digits'], accept: '^\\d{5}$' },
    regimes: { strategy: 'catalog_phrases', catalog: 'regimes', scope: { start: 'regimenes\\s*:', end: 'obligaciones\\s*:' } },
    document_id: { strategy: 'regex', pattern: 'id\\s*cif\\s*:?\\s*(\\d{6,})' },
    issued_on: { strategy: 'date', scope: { start: 'lugar y fecha de emision' } },
  },
  qr: {
    fields: {
      tax_id: { strategy: 'qr_param', param: 'D3', separator: '_', accept: TAX_ID },
      document_id: { strategy: 'qr_param', param: 'D3', separator: '_', accept: '^\\d{6,}$' },
    },
    compare: ['tax_id', 'document_id'],
  },
}

export const MOCK_IDENTITY_DOCUMENT_MX_CSF: IdentityDocumentSpec = {
  kind: 'MX:csf',
  label: 'Constancia de situación fiscal',
  label_en: 'Tax status certificate',
  help: 'PDF que descargas del SAT con tu e.firma o contraseña.',
  obtain_url: 'https://www.sat.gob.mx/aplicacion/53027/genera-tu-constancia-de-situacion-fiscal',
  accept: ['application/pdf'],
  max_bytes: 5 * 1024 * 1024,
  max_pages: 6,
  engine: 'rules@1',
  rules: MOCK_CSF_RULES,
  verify_kind: 'MX:csf',
  freshness_days: 90,
  discard_fields: ['curp', 'street', 'exterior_number', 'neighborhood', 'activities'],
}

export const MOCK_FISCAL_ID_MX: RegionFiscalId = {
  kind: 'RFC',
  label: 'RFC',
  pattern: '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$',
  generic_ids: ['XAXX010101000', 'XEXX010101000'],
  regimes: REGIMES,
  invoice_uses: USES,
  documents: [MOCK_IDENTITY_DOCUMENT_MX_CSF],
}

export const MOCK_REGION_MX: Region = {
  country_code: 'MX',
  name: 'México',
  locale: { default: 'es-MX', available: ['es-MX', 'en-US'], current: 'es-MX' },
  timezone: 'America/Mexico_City',
  currency: { code: 'MXN', symbol: '$', symbol_position: 'before', minor_units: 2 },
  formats: { date: 'DD/MM/YYYY', measurement: 'metric' },
  tax: { prices_include_tax: true, label: 'IVA', price_label: 'IVA incluido', show_breakdown: false, default_category: 'standard', categories: ['standard'] },
  address: { postal_code: { pattern: '^[0-9]{5}$', example: '06600' } },
  fiscal_id: MOCK_FISCAL_ID_MX,
  payment_methods: [
    { code: 'card', label: 'Tarjeta', kind: 'card', flow: 'inline', providers: ['mock'], installments: null, min_amount: null, max_amount: null, fiscal_payment_form: '04' },
    { code: 'oxxo', label: 'OXXO', kind: 'cash_voucher', flow: 'voucher', providers: ['mock'], installments: null, min_amount: null, max_amount: null, expires_hours: 72, fiscal_payment_form: '01' },
    { code: 'spei', label: 'SPEI', kind: 'bank_transfer', flow: 'instructions', providers: ['mock'], installments: null, min_amount: null, max_amount: null, fiscal_payment_form: '03' },
  ],
}

export type InvoiceFieldError = { field: string; message: string }

/** `individual` for a 13-character tax id, `company` for 12 (the mock's rule; a real region decides this server-side). */
export function mockPersonType(taxId: string): string | null {
  if (taxId.length === 13) return 'individual'
  if (taxId.length === 12) return 'company'
  return null
}

/** The first thing wrong with an invoice request against a region, as the API reports it (`field: invoice.<field>`), or `null`. */
export function validateInvoiceRequest(region: Region | null, input: InvoiceRequest, prefix = 'invoice'): InvoiceFieldError | null {
  const text = (...v: unknown[]) => v.map((x) => (typeof x === 'string' ? x.trim() : '')).find(Boolean) ?? ''
  const fid = region?.fiscal_id
  const taxId = text(input.tax_id, input.rfc).toUpperCase()
  const name = text(input.legal_name, input.razon_social)
  const regime = text(input.tax_regime, input.regimen)
  const use = text(input.use, input.uso_cfdi)
  const postal = text(input.postal_code, input.cp)
  const bad = (field: string, message: string): InvoiceFieldError => ({ field: `${prefix}.${field}`, message })

  if (!taxId) return bad('tax_id', 'The tax id is required')
  if (fid?.pattern && !fid.generic_ids.includes(taxId) && !new RegExp(fid.pattern).test(taxId)) return bad('tax_id', `Not a valid ${fid.kind}`)
  if (!name) return bad('legal_name', 'The legal name is required')
  if (!regime) return bad('tax_regime', 'The tax regime is required')
  const entry = fid?.regimes.find((r) => r.code === regime)
  if (fid && !entry) return bad('tax_regime', `Unknown tax regime ${regime}`)
  const person = fid?.generic_ids.includes(taxId) ? null : mockPersonType(taxId)
  if (entry && person && entry.person_types.length > 0 && !entry.person_types.includes(person)) {
    return bad('tax_regime', `The regime ${regime} does not apply to this ${fid!.kind}`)
  }
  const postalPattern = region?.address?.postal_code?.pattern
  if (!postal || (postalPattern && !new RegExp(postalPattern).test(postal))) return bad('postal_code', 'Not a valid postal code')
  if (!use) return bad('use', 'The invoice use is required')
  const useEntry = fid?.invoice_uses.find((u) => u.code === use)
  if (fid && !useEntry) return bad('use', `Unknown invoice use ${use}`)
  if (useEntry?.allowed_regimes && useEntry.allowed_regimes.length > 0 && !useEntry.allowed_regimes.includes(regime)) {
    return bad('use', `The regime ${regime} does not admit the use ${use}`)
  }
  return null
}

export function maskTaxId(taxId: string): string {
  const v = taxId.trim()
  return v.length <= 4 ? '*'.repeat(v.length) : `${v.slice(0, 2)}${'*'.repeat(v.length - 5)}${v.slice(-3)}`
}
