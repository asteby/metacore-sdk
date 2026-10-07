// Reglas puras del DocumentEditor (sin React ni host): qué se ve a primera
// vista y qué va en «Opciones fiscales», qué copiar de la contraparte, cómo
// traer renglones de un documento origen, cómo repartir un cobro entre los
// documentos abiertos y qué revisar antes de guardar. Genérico: factura,
// cotización, pedido, OC, nota de crédito y cobro/REP. El SDK no conoce CFDI.
import { roundMoney, toAmount } from './format'
import { computeTotals, makeLine, type LineItem } from './line-items'
import { optionPassesRule, getOptionFilter } from '../option-filter'
import { applyOptionWhen, getDependsOn } from '../dynamic-form-schema'
import type { ResolvedOption } from '../use-options-resolver'
import type { Allocation, AllocationIssue, OpenDocument } from '../primitives/allocation'
import type {
    ActionFieldDef,
    DocumentFormLines,
    DocumentFormSource,
    DocumentFormOpenDocuments,
    DocumentFormsManifest,
    DocumentFormType,
} from '../types'

export const EXTENSION_PREFIX = 'fiscal_data.'

/** Secciones de campo que el editor pliega en «Opciones fiscales». */
const ADVANCED_SECTIONS = new Set(['fiscal', 'advanced'])

export type EditorLinesConfig = DocumentFormLines & { field: string }

/** true si el tipo se abre en el DocumentEditor (`layout: "editor"`). */
export function isEditorLayout(type: Pick<DocumentFormType, 'layout' | 'sources'> | null | undefined): boolean {
    // «Cargar desde…» vive en el editor: un tipo con `sources` lo usa salvo que
    // pida explícitamente el wizard.
    return type?.layout === 'editor' || (type?.layout !== 'wizard' && (type?.sources?.length ?? 0) > 0)
}

/** Paso de renglones efectivo del tipo (o undefined si no tiene). */
export function editorLinesConfig(type: DocumentFormType, forms: Pick<DocumentFormsManifest, 'lines_field'>): EditorLinesConfig | undefined {
    if (!type.lines) return undefined
    const cfg: DocumentFormLines = type.lines === true ? {} : type.lines
    const fallback = cfg.kind === 'allocation' ? 'allocations' : 'lines'
    return { ...cfg, field: cfg.field ?? forms.lines_field ?? fallback }
}

/** Lee `a.b.c` de un registro (incluye `fiscal_data.x` dentro del jsonb). */
function readPath(rec: Record<string, any> | null | undefined, path: string): unknown {
    if (!rec) return undefined
    if (path in rec) return rec[path]
    return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), rec)
}

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== ''

function declaredDefault(f: ActionFieldDef): unknown {
    return (f as { defaultValue?: unknown; default?: unknown }).defaultValue ?? (f as { default?: unknown }).default
}

/**
 * Divulgación progresiva: ¿el campo va plegado en «Opciones fiscales»?
 *  - campos de extensión (`fiscal_data.*`) que aportan otros addons (los que
 *    el propio tipo declara obligatorios, p. ej. método y forma de pago de la
 *    factura, se marcan esenciales en splitEditorFields);
 *  - `section: "fiscal" | "advanced"`;
 *  - catálogos opcionales que ya traen un default (método, serie, relación…):
 *    el usuario no necesita tocarlos para guardar.
 * Lo obligatorio sin default, la contraparte y el monto siempre están a la vista.
 */
export function isAdvancedField(f: ActionFieldDef, essentialKeys: ReadonlySet<string> = new Set()): boolean {
    if (essentialKeys.has(f.key)) return false
    if (f.key.startsWith(EXTENSION_PREFIX)) return true
    if (f.section && ADVANCED_SECTIONS.has(f.section)) return true
    const hasOptions = Array.isArray(f.options) && f.options.length > 0
    return !f.required && hasOptions && hasValue(declaredDefault(f))
}

export interface EditorFieldGroups {
    /** Campo que elige la contraparte (cliente/proveedor), si el tipo la declara. */
    party?: ActionFieldDef
    /** A la vista: lo esencial del encabezado. */
    essential: ActionFieldDef[]
    /** Plegados en «Opciones fiscales». */
    advanced: ActionFieldDef[]
    /** Notas largas (textarea): al final. */
    notes: ActionFieldDef[]
}

/** Reparte los campos del tipo (más los de extensión) en grupos de pantalla. */
export function splitEditorFields(
    fields: readonly ActionFieldDef[],
    opts: { partyField?: string; essentialKeys?: readonly string[]; extensionFields?: readonly ActionFieldDef[] } = {},
): EditorFieldGroups {
    // Lo obligatorio que el tipo declara siempre está a la vista, aunque sea de
    // extensión (`fiscal_data.metodo_pago`): es lo que el usuario debe decidir.
    // Las extensiones que llegan del metadata (no declaradas) siguen plegadas.
    const essentialKeys = new Set([...(opts.essentialKeys ?? []), ...fields.filter((f) => f.required).map((f) => f.key)])
    const out: EditorFieldGroups = { essential: [], advanced: [], notes: [] }
    const seen = new Set<string>()
    for (const f of [...fields, ...(opts.extensionFields ?? [])]) {
        if (seen.has(f.key)) continue
        seen.add(f.key)
        if (opts.partyField && f.key === opts.partyField) out.party = f
        else if (f.type === 'textarea' || f.widget === 'textarea') out.notes.push(f)
        else if (isAdvancedField(f, essentialKeys)) out.advanced.push(f)
        else out.essential.push(f)
    }
    return out
}

/**
 * Etiqueta clara con el código como dato secundario:
 * `03 · Transferencia electrónica` → `Transferencia electrónica · 03`.
 * Solo reordena el patrón «CÓDIGO · texto»; cualquier otra etiqueta pasa igual.
 */
export function friendlyOptionLabel(label: string): string {
    const m = /^\s*([A-Z0-9]{1,5})\s*[·\-–]\s*(.+)$/.exec(label)
    return m && /\d/.test(m[1]) ? `${m[2].trim()} · ${m[1]}` : label
}

/** El mismo campo con sus opciones en formato «texto · código». */
export function withFriendlyOptions(f: ActionFieldDef): ActionFieldDef {
    if (!Array.isArray(f.options) || f.options.length === 0) return f
    return { ...f, options: f.options.map((o) => ({ ...o, label: friendlyOptionLabel(String(o.label ?? o.value)) })) }
}

/** Select estático con alguna opción condicionada por otro campo (`options[].when`). */
function isGatedSelect(f: ActionFieldDef): boolean {
    return Array.isArray(f.options) && f.options.some((o) => !!o?.when)
}

/** Opciones del select que aplican con los valores actuales (`options[].when`). */
export function gatedOptions(f: ActionFieldDef, values: Record<string, unknown>): ActionFieldDef {
    if (!isGatedSelect(f)) return f
    return { ...f, options: applyOptionWhen(f.options, values, getDependsOn(f)) }
}

/**
 * Selects con opciones condicionadas (`options[].when`, p. ej. forma de pago
 * «99» solo con método PPD): cuando el valor actual deja de aplicar —o está
 * vacío y solo queda una opción— devuelve el que toca. Una sola opción
 * permitida se elige sola; si hay varias, el default del campo si aplica; si
 * no, vacío. Sin cambios devuelve `{}`, así que aplicarlo converge.
 */
export function gatedOptionFixes(fields: readonly ActionFieldDef[], values: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const f of fields) {
        if (!isGatedSelect(f)) continue
        const allowed = applyOptionWhen(f.options, values, getDependsOn(f))
        const cur = values[f.key]
        const ok = (v: unknown) => hasValue(v) && allowed.some((o) => String(o.value) === String(v))
        if (ok(cur)) continue
        if (!hasValue(cur) && allowed.length !== 1) continue
        const def = declaredDefault(f)
        const next = allowed.length === 1 ? allowed[0].value : ok(def) ? def : ''
        if (String(next ?? '') !== String(cur ?? '')) out[f.key] = next
    }
    return out
}

/**
 * Defaults del encabezado que salen de la contraparte: los campos de extensión
 * con la MISMA clave en ambos modelos (p. ej. `fiscal_data.uso_cfdi` de Customer
 * → `fiscal_data.uso_cfdi` del documento) y la moneda.
 * Solo llena lo que está vacío: nunca pisa lo que el usuario ya capturó.
 */
export function partyDefaults(
    party: Record<string, any> | null,
    documentFieldKeys: readonly string[],
    current: Record<string, unknown>,
): Record<string, unknown> {
    if (!party) return {}
    const out: Record<string, unknown> = {}
    for (const key of documentFieldKeys) {
        if (!key.startsWith(EXTENSION_PREFIX) || hasValue(current[key])) continue
        const v = readPath(party, key)
        if (hasValue(v)) out[key] = v
    }
    if (!hasValue(current.currency_code) && typeof party.currency_code === 'string' && party.currency_code) {
        out.currency_code = party.currency_code
    }
    return out
}

/** Etiqueta y opciones de catálogo de un campo (de la metadata del modelo o del propio tipo). */
export interface FieldDisplayMeta {
    label?: string
    options?: ReadonlyArray<{ value: unknown; label?: unknown }>
}

/**
 * Metadata de pantalla por clave a partir de listas de campos/columnas
 * (`/metadata/modal` → fields, `/metadata/table` → columns, campos del tipo).
 * La primera lista que trae etiqueta u opciones para una clave gana.
 */
export function fieldDisplayMeta(
    lists: ReadonlyArray<ReadonlyArray<unknown> | null | undefined>,
    translate: (s: string) => string = (s) => s,
): Record<string, FieldDisplayMeta> {
    const out: Record<string, FieldDisplayMeta> = {}
    for (const list of lists) {
        for (const raw of list ?? []) {
            const f = raw as { key?: unknown; name?: unknown; label?: unknown; options?: unknown }
            const key = typeof f?.key === 'string' ? f.key : typeof f?.name === 'string' ? f.name : undefined
            if (!key) continue
            const cur = (out[key] ??= {})
            if (!cur.label && typeof f.label === 'string' && f.label) cur.label = translate(f.label)
            if (!cur.options && Array.isArray(f.options) && f.options.length > 0) {
                cur.options = f.options.map((o: any) => ({ value: o?.value, label: typeof o?.label === 'string' ? translate(o.label) : o?.label }))
            }
        }
    }
    return out
}

/** `tax_id` → «Tax id»: último recurso cuando ningún metadata etiqueta la columna. */
export function humanizeKey(key: string): string {
    const base = key.replace(EXTENSION_PREFIX, '').replace(/[_.]+/g, ' ').trim()
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : key
}

/**
 * Valor de catálogo legible: `G03` con la opción «Gastos en general» →
 * «G03 · Gastos en general» (si la etiqueta ya trae el código, tal cual).
 */
export function formatOptionValue(value: unknown, options?: FieldDisplayMeta['options']): string {
    const raw = String(value)
    const opt = options?.find((o) => String(o.value) === raw)
    const label = opt && typeof opt.label === 'string' ? opt.label.trim() : ''
    if (!label || label === raw) return raw
    if (label.includes(raw)) return label
    const codeLike = /^[A-Z0-9]{1,5}$/.test(raw) && /\d/.test(raw)
    return codeLike ? `${raw} · ${label}` : label
}

/**
 * Filas de la tarjeta de contraparte: resumen declarado + extensiones (máximo
 * `limit`). Etiqueta del campo (metadata / labels declarados, ya traducidos),
 * valores de catálogo con su texto y nunca claves crudas ni vacíos.
 */
export function partySummaryRows(
    party: Record<string, any> | null,
    summary: readonly string[] = [],
    labels: Record<string, string> = {},
    limit = 6,
    meta: Record<string, FieldDisplayMeta> = {},
): Array<{ key: string; label: string; value: string }> {
    if (!party) return []
    const keys = new Set<string>(summary)
    const fd = party.fiscal_data
    if (fd && typeof fd === 'object') for (const k of Object.keys(fd)) keys.add(EXTENSION_PREFIX + k)
    const rows: Array<{ key: string; label: string; value: string }> = []
    for (const key of keys) {
        const v = readPath(party, key)
        if (!hasValue(v) || typeof v === 'object') continue
        if (typeof v === 'string' && !v.trim()) continue
        const m = meta[key]
        rows.push({ key, label: labels[key] ?? m?.label ?? humanizeKey(key), value: formatOptionValue(v, m?.options) })
    }
    return rows.slice(0, limit)
}

export interface CreditStatus {
    limit?: number
    balance?: number
    overdue?: number
    available?: number
    holdReason?: string
    /** `ok` | `warn` (supera 80 % o hay vencido) | `block` (retenido o sin crédito disponible). */
    level: 'ok' | 'warn' | 'block'
}

export function creditStatus(
    party: Record<string, any> | null,
    cols: { limit?: string; balance?: string; overdue?: string; hold_reason?: string } | undefined,
    documentTotal: number,
): CreditStatus | null {
    if (!party || !cols) return null
    const n = (k?: string) => (k && hasValue(party[k]) ? toAmount(party[k]) : undefined)
    const limit = n(cols.limit)
    const balance = n(cols.balance)
    const overdue = n(cols.overdue)
    const holdReason = cols.hold_reason ? (party[cols.hold_reason] as string | undefined) || undefined : undefined
    if (limit == null && balance == null && overdue == null && !holdReason) return null
    const available = limit != null ? roundMoney(limit - (balance ?? 0)) : undefined
    let level: CreditStatus['level'] = 'ok'
    if (holdReason || (available != null && limit! > 0 && available < documentTotal)) level = 'block'
    else if ((overdue ?? 0) > 0 || (limit != null && limit > 0 && (balance ?? 0) + documentTotal > 0.8 * limit)) level = 'warn'
    return { limit, balance, overdue, available, holdReason, level }
}

/**
 * Renglones de un documento origen → LineItem. `map` traduce nombres
 * (`description: product_name`, `discount: discount_pct`). Si el origen trae
 * `tax_amount` y `subtotal` pero no la tasa, la deriva. `credit` (NC) topa la
 * cantidad en lo facturado (o en `max_quantity` si el origen la trae).
 *
 * Con `remaining_quantity` (lo sirve el host: cantidad − lo ya facturado o
 * devuelto) la cantidad sugerida y el tope son lo pendiente y los renglones ya
 * cubiertos se omiten; un descuento en importe se prorratea a lo pendiente (un
 * porcentaje no cambia). Cada línea guarda `source_line_id` para el vínculo.
 */
export function linesFromSource(
    rows: unknown,
    map: Record<string, string> = {},
    opts: { kind?: DocumentFormLines['kind']; discountMode?: DocumentFormLines['discount_mode']; defaultTaxRate?: number } = {},
): LineItem[] {
    if (!Array.isArray(rows)) return []
    return rows.filter((raw) => !isFullyConsumed(raw)).map((raw) => {
        const r = (raw ?? {}) as Record<string, any>
        const get = (k: string) => r[map[k] ?? k]
        const pending = hasValue(r.remaining_quantity) ? toAmount(r.remaining_quantity) : undefined
        const qty = pending ?? toAmount(get('quantity') ?? 1)
        let rate = get('tax_rate')
        if (!hasValue(rate)) {
            const sub = toAmount(get('subtotal'))
            const tax = toAmount(get('tax_amount'))
            // Un origen sin dato de impuesto (p. ej. una OT de taller: solo
            // cantidad y precio) toma la tasa de la org, como un renglón nuevo.
            rate = hasValue(get('tax_amount'))
                ? sub > 0 ? Math.round((tax / sub) * 10000) / 10000 : 0
                : opts.defaultTaxRate ?? 0
        }
        const r2 = toAmount(rate)
        const product = get('product_id')
        const line = makeLine({
            product_id: refValue(product),
            sku: get('sku') ?? undefined,
            description: String(get('description') ?? get('product_name') ?? refLabel(product) ?? refLabel(r.product) ?? ''),
            quantity: qty,
            unit_price: toAmount(get('unit_price')),
            discount: toAmount(get('discount') ?? 0),
            tax_rate: r2 > 1 ? r2 / 100 : r2,
            unit: get('unit') ?? undefined,
        })
        // El descuento del origen se lee en la unidad del documento (importe en
        // modelos cuyo subtotal resta un monto).
        if (opts.discountMode === 'amount') {
            line.discount_kind = 'amount'
            // Un importe es de TODO el renglón de origen: al cargar solo lo
            // pendiente se prorratea a esa cantidad (4 llantas con $400 de
            // descuento, 1 pendiente → $100), si no superaría el importe.
            const sourceQty = toAmount(r.source_quantity ?? get('quantity'))
            if (pending != null && sourceQty > 0 && pending < sourceQty) {
                line.discount = roundMoney((toAmount(line.discount) * pending) / sourceQty)
            }
        }
        if (pending != null) line.max_quantity = pending
        else if (opts.kind === 'credit') line.max_quantity = hasValue(get('max_quantity')) ? toAmount(get('max_quantity')) : qty
        const sourceLine = r.source_line_id ?? r.id
        if (hasValue(sourceLine)) line.source_line_id = String(sourceLine)
        return line
    })
}

/** Id de una celda de relación (`{value,label}`, `{id,name}` o el id plano). */
function refValue(v: unknown): string | undefined {
    if (v == null || v === '') return undefined
    if (typeof v === 'object') {
        const o = v as Record<string, unknown>
        const id = o.value ?? o.id
        return id == null || id === '' ? undefined : String(id)
    }
    return String(v)
}

/**
 * Nombre de una celda de relación ya resuelta por el host (`{label}`/`{name}`).
 * Un renglón de origen sin descripción propia (InvoiceItem solo lleva el
 * producto) se nombra con su producto en vez de entrar en blanco.
 */
function refLabel(v: unknown): string | undefined {
    if (!v || typeof v !== 'object') return undefined
    const o = v as Record<string, unknown>
    const l = o.label ?? o.name
    return typeof l === 'string' && l.trim() ? l : undefined
}

function isFullyConsumed(raw: unknown): boolean {
    const r = (raw ?? {}) as Record<string, any>
    return hasValue(r.remaining_quantity) && toAmount(r.remaining_quantity) <= 0
}

/** El editor ocupa toda la pantalla: documentos comerciales con renglones (factura, cotización, pedido, OC). */
export function isFullscreenEditor(type: DocumentFormType, forms: Pick<DocumentFormsManifest, 'lines_field'>): boolean {
    const kind = editorLinesConfig(type, forms)?.kind ?? 'sale'
    return !!type.lines && (kind === 'sale' || kind === 'purchase')
}

/** Cuántos renglones del origen se cargaron y cuántos se omitieron por estar ya cubiertos. */
export function sourceLoadSummary(rows: unknown): { loaded: number; covered: number } {
    if (!Array.isArray(rows)) return { loaded: 0, covered: 0 }
    const covered = rows.filter(isFullyConsumed).length
    return { loaded: rows.length - covered, covered }
}

/** Fuente que precarga desde lo pendiente servido por el host (no desde la relación cruda). */
export function sourceTracksRemaining(src: Pick<DocumentFormSource, 'line_link_field' | 'remaining_qty_field' | 'remaining_endpoint'>): boolean {
    return !!(src.line_link_field || src.remaining_qty_field || src.remaining_endpoint)
}

/** Opción ya resuelta de un selector de la cabecera que el editor llenó por código. */
export interface SeedLabel {
    value: string
    label: string
}

/** Columnas con las que se nombra un documento (folio antes que nombre). */
const DOCUMENT_LABEL_COLUMNS = ['number', 'folio', 'order_number', 'name', 'title', 'code']

function declaredOptionLabel(f: ActionFieldDef | undefined): string | undefined {
    const opts = (f as { options?: unknown } | undefined)?.options
    const l = opts && !Array.isArray(opts) && typeof opts === 'object' ? (opts as { label?: unknown }).label : undefined
    return typeof l === 'string' && l ? l : undefined
}

/** Nombre visible de un registro: la columna declarada por el campo, luego folio/nombre. */
export function recordLabel(rec: Record<string, any> | null | undefined, preferred?: string): string | undefined {
    if (!rec) return undefined
    for (const c of preferred ? [preferred, ...DOCUMENT_LABEL_COLUMNS] : DOCUMENT_LABEL_COLUMNS) {
        const v = rec[c]
        if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v)
    }
    return undefined
}

/**
 * Etiquetas de lo que «Cargar desde…» escribe en la cabecera, para que el
 * selector muestre el nombre y no el UUID sin abrirse:
 *  - `header` (`customer_id ← customer_id`): el objeto hermano `{value,label}`
 *    que el host sirve junto a la FK (`customer`);
 *  - `link_field`: el propio documento origen, con su folio.
 */
export function sourceHeaderSeeds(
    src: Pick<DocumentFormSource, 'header' | 'link_field'>,
    rec: Record<string, any>,
    id: string,
    fields: readonly ActionFieldDef[] = [],
): Record<string, SeedLabel> {
    const out: Record<string, SeedLabel> = {}
    for (const [to, from] of Object.entries(src.header ?? {})) {
        if (!from.endsWith('_id')) continue
        const v = refValue(rec[from])
        const label = refLabel(rec[from]) ?? refLabel(rec[from.slice(0, -3)])
        if (v && label) out[to] = { value: v, label }
    }
    if (src.link_field) {
        const label = recordLabel(rec, declaredOptionLabel(fields.find((f) => f.key === src.link_field)))
        if (label) out[src.link_field] = { value: id, label }
    }
    return out
}

/**
 * Registro para `renderField` con las etiquetas sembradas como objeto hermano
 * (`customer_id` → `customer: {value,label}`), el mismo contrato que sirve el
 * host en una fila. Conserva el registro desde el que se abrió.
 */
export function seedRecord(
    seeds: Record<string, SeedLabel>,
    record?: Record<string, any>,
): Record<string, any> | undefined {
    const keys = Object.keys(seeds).filter((k) => k.endsWith('_id'))
    if (keys.length === 0) return record
    const out: Record<string, any> = { ...(record ?? {}) }
    for (const k of keys) out[k.slice(0, -3)] = seeds[k]
    return out
}

export interface EditorIssue {
    field?: string
    severity: 'error' | 'warning'
    message: string
}

/** Revisión local (instantánea) de los renglones. Sin ruido: solo lo que hay que mirar. */
export function localIssues(lines: LineItem[], opts: { requireLines?: boolean; requireTax?: boolean } = {}): EditorIssue[] {
    const issues: EditorIssue[] = []
    const items = lines.filter((l) => l.kind === 'item')
    if ((opts.requireLines ?? true) && items.length === 0) {
        issues.push({ field: 'lines', severity: 'error', message: 'Agrega al menos un renglón.' })
    }
    items.forEach((l, i) => {
        // Un renglón con producto se describe con él (el servidor lo nombra
        // desde el catálogo): solo un renglón libre exige texto, como en el
        // editor de renglones (validateLineItems).
        if (!l.description.trim() && !l.product_id)
            issues.push({ field: `lines.${i}`, severity: 'error', message: `Renglón ${i + 1}: elige un producto o escribe la descripción.` })
        if (toAmount(l.unit_price) <= 0) issues.push({ field: `lines.${i}`, severity: 'warning', message: `Renglón ${i + 1}: precio en cero.` })
        if (l.max_quantity != null && toAmount(l.quantity) > toAmount(l.max_quantity)) {
            issues.push({
                field: `lines.${i}`,
                severity: 'error',
                message: `Renglón ${i + 1}: la cantidad excede lo pendiente del documento origen (quedan ${l.max_quantity}).`,
            })
        }
        if (opts.requireTax && toAmount(l.tax_rate) === 0) {
            issues.push({ field: `lines.${i}`, severity: 'warning', message: `Renglón ${i + 1}: sin impuesto.` })
        }
    })
    if (computeTotals(lines).total < 0) issues.push({ severity: 'error', message: 'El total no puede ser negativo.' })
    return issues
}

// ---- Cobro / REP (lines.kind = allocation) ----------------------------------

/** Documento abierto (fila de /data) → OpenDocument para PaymentAllocator. */
export function toOpenDocuments(rows: unknown, cfg: DocumentFormOpenDocuments, currency: string): OpenDocument[] {
    if (!Array.isArray(rows)) return []
    const rules = getOptionFilter(cfg)
    const out: OpenDocument[] = []
    for (const raw of rows) {
        if (!raw || typeof raw !== 'object') continue
        const r = raw as Record<string, any>
        if (rules.length) {
            const opt = { id: r.id, value: r.id, label: String(r[cfg.number_field] ?? ''), name: '', meta: r } as unknown as ResolvedOption
            if (!rules.every((rule) => optionPassesRule(opt, rule))) continue
        }
        const balance = roundMoney(toAmount(readPath(r, cfg.balance_field)))
        if (balance <= 0) continue
        out.push({
            id: String(r.id),
            number: String(readPath(r, cfg.number_field) ?? r.id),
            issued_at: String(readPath(r, cfg.issued_field ?? 'issued_at') ?? r.created_at ?? ''),
            due_at: (cfg.due_field ? (readPath(r, cfg.due_field) as string | null) : null) ?? null,
            total: roundMoney(toAmount(cfg.total_field ? readPath(r, cfg.total_field) : balance)),
            balance,
            currency: String(r.currency_code ?? r.currency ?? currency),
            payment_method: cfg.method_field ? ((readPath(r, cfg.method_field) as string | null) ?? null) : null,
            installments_paid: hasValue(r.installments_paid) ? toAmount(r.installments_paid) : undefined,
        })
    }
    return out
}

/** Monto actual de cada documento, para pasar a modo manual sin perder lo repartido. */
export function manualFromAllocations(allocations: readonly Allocation[]): Record<string, number> {
    return Object.fromEntries(allocations.map((a) => [a.document_id, a.amount]))
}

/** Renglones del payload: solo los dos campos que declara la acción (`invoice_id`, `amount`). */
export function allocationPayload(allocations: readonly Allocation[], cfg: DocumentFormOpenDocuments): Array<Record<string, unknown>> {
    return allocations.filter((a) => a.amount > 0).map((a) => ({ [cfg.line_document_field]: a.document_id, [cfg.line_amount_field]: a.amount }))
}

/**
 * Campo del encabezado con el monto recibido: `amount` si existe; si no, el
 * primer campo numérico/moneda. Convención documentada (el schema no lo nombra).
 */
export function allocationAmountField(fields: readonly ActionFieldDef[]): string | undefined {
    return (
        fields.find((f) => f.key === 'amount')?.key ??
        fields.find((f) => ['number', 'numeric', 'decimal', 'currency', 'money'].includes(f.type) || f.widget === 'currency')?.key
    )
}

const ALLOCATION_MESSAGES: Record<AllocationIssue['code'], string> = {
    non_positive: 'Captura el monto recibido.',
    over_balance: 'Se aplica más que el saldo del documento.',
    over_amount: 'Lo aplicado supera el monto recibido.',
    currency_mismatch: 'El documento está en otra moneda.',
    unapplied: 'Queda monto sin aplicar.',
}

/** AllocationIssue → mensaje en español claro (con el número del documento). */
export function allocationIssueMessages(issues: readonly AllocationIssue[], docs: readonly OpenDocument[]): EditorIssue[] {
    const byId = new Map(docs.map((d) => [d.id, d]))
    return issues.map((i) => {
        const doc = i.document_id ? byId.get(i.document_id) : undefined
        return {
            field: i.code === 'non_positive' ? 'amount' : 'allocations',
            severity: i.severity,
            message: doc ? `${doc.number}: ${ALLOCATION_MESSAGES[i.code]}` : ALLOCATION_MESSAGES[i.code],
        }
    })
}

/** Días de atraso de un documento abierto (0 si no está vencido o no tiene vencimiento). */
export function overdueDays(doc: Pick<OpenDocument, 'due_at'>, today: Date = new Date()): number {
    if (!doc.due_at) return 0
    const due = new Date(doc.due_at)
    if (Number.isNaN(due.getTime())) return 0
    const ms = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
    return Math.max(0, Math.floor(ms / 86_400_000))
}
