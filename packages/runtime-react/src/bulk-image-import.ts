// Carga masiva de imágenes a nivel catálogo — lógica pura (sin React).
//
// Genérica para cualquier modelo con una galería (relación 1:N cuya columna de
// imagen declara `display_config.gallery: true`): el archivo `SKU.ext`,
// `SKU_2.ext`… se asigna al registro padre cuyo campo SKU coincide, y cada
// archivo crea UNA fila hija. Nada aquí conoce productos, Protek ni el kernel:
// la unión con el SKU se resuelve contra la API de datos existente.
import type { ColumnDefinition, RelationMeta, TableMetadata } from './types'
import { relationColumnUi, relationGalleryColumn } from './dynamic-relation-helpers'

export const BULK_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] as const
/** Lado largo por debajo del cual la foto se avisa como «baja resolución». */
export const DEFAULT_MIN_LONG_SIDE = 600
/** Máximo de archivos por lote (la vista previa y la subida viven en memoria). */
export const MAX_BULK_FILES = 500

// ---------------------------------------------------------------------------
// Nombres de archivo
// ---------------------------------------------------------------------------

/** Último segmento de una ruta (acepta `/` y `\`). */
export function baseName(path: string): string {
    const parts = path.split(/[\\/]/)
    return parts[parts.length - 1] ?? ''
}

/** ¿Es una entrada ignorable (carpetas de macOS, archivos ocultos, no-imagen)? */
export function isIgnoredEntry(path: string): boolean {
    if (path.endsWith('/') || path.endsWith('\\')) return true
    if (/(^|[\\/])__MACOSX([\\/]|$)/.test(path)) return true
    const name = baseName(path)
    if (name === '' || name.startsWith('.')) return true
    return !isImageName(name)
}

export function isImageName(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    return (BULK_IMAGE_EXTENSIONS as readonly string[]).includes(ext)
}

export interface ParsedImageName {
    /** Nombre sin extensión, tal cual. */
    stem: string
    /** Candidatos de SKU en orden de preferencia, con el número de orden de cada uno. */
    candidates: Array<{ sku: string; order: number }>
}

/**
 * `SKU.ext` → orden 1; `SKU_2.ext` → orden 2. Como un SKU real puede terminar
 * en `_N`, se ofrecen los dos candidatos y gana el que exista en el catálogo
 * (primero el nombre completo).
 */
export function parseImageName(path: string): ParsedImageName {
    const name = baseName(path)
    const dot = name.lastIndexOf('.')
    const stem = (dot > 0 ? name.slice(0, dot) : name).trim()
    const candidates: ParsedImageName['candidates'] = []
    if (stem) candidates.push({ sku: stem, order: 1 })
    const m = /^(.+?)_(\d{1,3})$/.exec(stem)
    if (m) candidates.push({ sku: m[1].trim(), order: Math.max(1, parseInt(m[2], 10)) })
    return { stem, candidates }
}

export const normalizeSku = (s: string) => s.trim().toLowerCase()

/**
 * SKUs a consultar (todos los candidatos, sin repetir), para pedirlos por
 * lotes. El `IN` del servidor distingue mayúsculas, así que se piden también
 * las variantes en MAYÚSCULAS y minúsculas; el cruce local no distingue.
 */
export function collectCandidateSkus(names: string[]): string[] {
    const seen = new Set<string>()
    for (const n of names) {
        for (const c of parseImageName(n).candidates) {
            for (const v of [c.sku, c.sku.toUpperCase(), c.sku.toLowerCase()]) seen.add(v)
        }
    }
    return [...seen]
}

export function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

// ---------------------------------------------------------------------------
// Configuración (descubierta de la metadata, sin tocar el kernel)
// ---------------------------------------------------------------------------

export interface BulkImageTarget {
    /** Modelo hijo (galería), p. ej. `product_images`. */
    childModel: string
    /** FK del hijo hacia el padre. */
    foreignKey: string
    /** Columna de imagen (la de `gallery: true`). */
    imageKey: string
    /** Columnas derivadas (si el modelo las tiene). */
    widthKey?: string
    heightKey?: string
    positionKey?: string
    /** Carpeta de almacenamiento (`storage_path` de la columna). */
    storagePath?: string
    accept: string
    maxSize?: number
    /** Filtros de alcance de la relación (polimórficos): se copian a cada fila. */
    scope?: Record<string, string>
}

/**
 * Busca la relación 1:N con galería. Necesita la metadata del hijo (para saber
 * cuál es su columna de imagen); `childMetadata` la resuelve el llamador.
 */
export function deriveBulkImageTarget(
    relation: Pick<RelationMeta, 'through' | 'foreign_key' | 'scope' | 'kind'>,
    childMetadata: Pick<TableMetadata, 'columns'> | null | undefined,
): BulkImageTarget | null {
    if (relation.kind !== 'one_to_many') return null
    const img: ColumnDefinition | undefined = relationGalleryColumn(childMetadata)
    if (!img) return null
    // Sin la FK declarada el listado ignoraría `f_<fk>=in:` en silencio y devolvería todo.
    if (!(childMetadata?.columns ?? []).some((c) => c.key === relation.foreign_key)) return null
    const sc = (img.styleConfig ?? {}) as Record<string, unknown>
    const keyOf = (derive: string) =>
        (childMetadata?.columns ?? []).find((c) => relationColumnUi(c).derive === derive)?.key
    const storagePath = (sc.storage_path ?? sc.storagePath) as string | undefined
    return {
        childModel: relation.through,
        foreignKey: relation.foreign_key,
        imageKey: img.key,
        widthKey: keyOf('image_width'),
        heightKey: keyOf('image_height'),
        positionKey: keyOf('next_position') ?? (childMetadata?.columns ?? []).find((c) => c.key === 'position')?.key,
        storagePath: typeof storagePath === 'string' && storagePath ? storagePath : undefined,
        accept: (img as { accept?: string }).accept || 'image/*',
        maxSize: (img as { maxSize?: number; max_size?: number }).maxSize ?? (img as { max_size?: number }).max_size,
        scope: relation.scope,
    }
}

// ---------------------------------------------------------------------------
// Vista previa
// ---------------------------------------------------------------------------

export interface ParentRef {
    id: string
    label: string
    sku: string
    /** Mayor `position` ya cargada en su galería (0 si no tiene fotos). */
    existingMaxPosition: number
    existingCount: number
}

export type PreviewStatus =
    | 'ok'
    | 'low_res'
    | 'sku_not_found'
    | 'duplicate'
    | 'invalid_image'
    | 'too_large'

export interface PreviewInput {
    /** Ruta completa (puede traer carpetas). */
    path: string
    size: number
    width?: number
    height?: number
    /** `false` si el navegador no pudo decodificarla. */
    decodable?: boolean
}

export interface PreviewRow extends PreviewInput {
    key: string
    status: PreviewStatus
    sku?: string
    order?: number
    parent?: ParentRef
    /** Posición asignada en la galería del padre (solo filas importables). */
    position?: number
    /** Mensaje corto para la tabla. */
    note?: string
}

export interface PreviewOptions {
    minLongSide?: number
    maxSize?: number
}

/** ¿La fila se importa por defecto? (`low_res` sí, con aviso; el usuario puede excluirla). */
export const isImportable = (r: PreviewRow) => r.status === 'ok' || r.status === 'low_res'

/**
 * Cruza los archivos con el catálogo. Reglas:
 *  - gana el nombre completo; si no existe como SKU, se prueba quitando `_N`;
 *  - dos archivos para el mismo SKU y el mismo orden son duplicados (se
 *    conserva el primero por ruta; el resto se marca y no se importa);
 *  - las fotos de un producto se numeran a continuación de las que ya tiene,
 *    en orden de `_N` (y de ruta a igualdad).
 */
export function buildPreview(
    inputs: PreviewInput[],
    parentsBySku: Map<string, ParentRef>,
    opts: PreviewOptions = {},
): PreviewRow[] {
    const minLong = opts.minLongSide ?? DEFAULT_MIN_LONG_SIDE
    const rows: PreviewRow[] = inputs
        .slice()
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
        .map((inp, i) => {
            const base: PreviewRow = { ...inp, key: `${i}:${inp.path}`, status: 'ok' }
            if (inp.decodable === false) return { ...base, status: 'invalid_image', note: 'No es una imagen válida' }
            if (opts.maxSize && inp.size > opts.maxSize) return { ...base, status: 'too_large', note: 'Excede el tamaño máximo' }
            const parsed = parseImageName(inp.path)
            for (const c of parsed.candidates) {
                const parent = parentsBySku.get(normalizeSku(c.sku))
                if (parent) {
                    const long = Math.max(inp.width ?? 0, inp.height ?? 0)
                    const lowRes = long > 0 && long < minLong
                    return {
                        ...base,
                        sku: parent.sku,
                        order: c.order,
                        parent,
                        status: lowRes ? 'low_res' : 'ok',
                        note: lowRes ? `Baja resolución (${inp.width}×${inp.height})` : undefined,
                    } as PreviewRow
                }
            }
            return { ...base, sku: parsed.stem, status: 'sku_not_found', note: 'SKU no encontrado' }
        })

    // Duplicados: mismo producto + mismo orden.
    const seen = new Set<string>()
    for (const r of rows) {
        if (!r.parent) continue
        const k = `${r.parent.id}#${r.order}`
        if (seen.has(k)) {
            r.status = 'duplicate'
            r.note = `Duplicado: ya hay otra foto ${r.order === 1 ? 'principal' : `_${r.order}`} para ${r.parent.sku}`
        } else {
            seen.add(k)
        }
    }

    // Posiciones consecutivas por producto, a continuación de las existentes.
    const byParent = new Map<string, PreviewRow[]>()
    for (const r of rows) {
        if (!r.parent || !isImportable(r)) continue
        const list = byParent.get(r.parent.id) ?? []
        list.push(r)
        byParent.set(r.parent.id, list)
    }
    for (const list of byParent.values()) {
        list.sort((a, b) => (a.order ?? 1) - (b.order ?? 1) || a.path.localeCompare(b.path, undefined, { numeric: true }))
        list.forEach((r, i) => {
            r.position = (r.parent?.existingMaxPosition ?? 0) + i + 1
        })
    }
    return rows
}

export interface PreviewSummary {
    total: number
    importable: number
    products: number
    ok: number
    low_res: number
    sku_not_found: number
    duplicate: number
    invalid_image: number
    too_large: number
}

export function summarizePreview(rows: PreviewRow[], excluded?: ReadonlySet<string>): PreviewSummary {
    const s: PreviewSummary = {
        total: rows.length, importable: 0, products: 0, ok: 0, low_res: 0,
        sku_not_found: 0, duplicate: 0, invalid_image: 0, too_large: 0,
    }
    const parents = new Set<string>()
    for (const r of rows) {
        s[r.status] += 1
        if (isImportable(r) && !excluded?.has(r.key)) {
            s.importable += 1
            if (r.parent) parents.add(r.parent.id)
        }
    }
    s.products = parents.size
    return s
}

/**
 * Tras excluir filas a mano, las posiciones se recalculan para no dejar
 * huecos (la 2.ª foto de un producto cuya 1.ª se excluyó pasa a ser la 1.ª).
 */
export function selectForImport(rows: PreviewRow[], excluded: ReadonlySet<string>): PreviewRow[] {
    const byOrder = (a: PreviewRow, b: PreviewRow) =>
        (a.order ?? 1) - (b.order ?? 1) || a.path.localeCompare(b.path, undefined, { numeric: true })
    // Mismo criterio que buildPreview: dentro de cada producto manda `_N`, no la ruta.
    const picked = rows.filter((r) => isImportable(r) && !excluded.has(r.key)).sort(byOrder)
    const counter = new Map<string, number>()
    return picked.map((r) => {
        const n = (counter.get(r.parent!.id) ?? 0) + 1
        counter.set(r.parent!.id, n)
        return { ...r, position: r.parent!.existingMaxPosition + n }
    })
}

// ---------------------------------------------------------------------------
// Cuerpo de la fila hija
// ---------------------------------------------------------------------------

export function buildChildPayload(
    target: BulkImageTarget,
    row: Pick<PreviewRow, 'parent' | 'position' | 'width' | 'height'>,
    url: string,
): Record<string, unknown> {
    const out: Record<string, unknown> = {
        ...(target.scope || {}),
        [target.imageKey]: url,
        [target.foreignKey]: row.parent!.id,
    }
    if (target.positionKey && row.position) out[target.positionKey] = row.position
    if (target.widthKey && row.width) out[target.widthKey] = Math.round(row.width)
    if (target.heightKey && row.height) out[target.heightKey] = Math.round(row.height)
    return out
}

// ---------------------------------------------------------------------------
// Registro de lote (deshacer)
// ---------------------------------------------------------------------------

export interface BatchLogItem {
    rowId: string
    path: string
    sku: string
    parentId: string
    url: string
    undone?: boolean
}

export interface BatchLog {
    batchId: string
    createdAt: string
    childModel: string
    /** Organización/usuario (cacheScope) en que se creó: otro alcance no lo ve ni lo deshace. */
    scope?: string
    items: BatchLogItem[]
}

const LOG_KEY = 'metacore.bulk-image-batches.v1'
const MAX_LOGS = 10

export function newBatchId(now: Date = new Date()): string {
    return `bulk-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`
}

export function loadBatchLogs(storage: Pick<Storage, 'getItem'> | undefined = safeStorage(), scope?: string): BatchLog[] {
    try {
        const raw = storage?.getItem(LOG_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        if (!Array.isArray(parsed)) return []
        // Con `scope`, solo los lotes de esa organización/usuario.
        return scope === undefined ? parsed : parsed.filter((l: BatchLog) => !!l.scope && l.scope === scope)
    } catch {
        return []
    }
}

export function saveBatchLog(log: BatchLog, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = safeStorage()): void {
    try {
        const all = loadBatchLogs(storage).filter((l) => l.batchId !== log.batchId)
        all.unshift(log)
        storage?.setItem(LOG_KEY, JSON.stringify(all.slice(0, MAX_LOGS)))
    } catch {
        /* almacenamiento no disponible: el registro descargable sigue siendo válido */
    }
}

function safeStorage(): Storage | undefined {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : undefined
    } catch {
        return undefined
    }
}

/** Filas del lote que aún se pueden deshacer. */
export const pendingUndo = (log: BatchLog) => log.items.filter((i) => !i.undone)

// ---------------------------------------------------------------------------
// Entradas: ZIP y carpeta
// ---------------------------------------------------------------------------

export interface BulkFile {
    path: string
    file: File
}

const MIME_BY_EXT: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
}

/** Máximo descomprimido aceptado por archivo de un ZIP (defensa ante zip-bombs). */
export const MAX_ENTRY_BYTES = 25 * 1024 * 1024
export const MAX_TOTAL_BYTES = 400 * 1024 * 1024

/** Descomprime un ZIP en el navegador y devuelve solo las imágenes. */
export async function readZipImages(zip: Blob): Promise<{ files: BulkFile[]; skipped: number }> {
    const { unzipSync } = await import('fflate')
    const data = new Uint8Array(await zip.arrayBuffer())
    let total = 0
    let skipped = 0
    const files: BulkFile[] = []
    const entries = unzipSync(data, {
        filter: (f) => {
            if (f.name.endsWith('/')) return false
            // Solo almacenado (0) o deflate (8): deflate64/cifrado abortarían todo el ZIP.
            if (isIgnoredEntry(f.name) || (f.compression !== 0 && f.compression !== 8)) {
                skipped += 1
                return false
            }
            total += f.originalSize
            if (f.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
                skipped += 1
                return false
            }
            return true
        },
    })
    for (const [path, bytes] of Object.entries(entries)) {
        const ext = path.split('.').pop()?.toLowerCase() ?? ''
        files.push({ path, file: new File([bytes as BlobPart], baseName(path), { type: MIME_BY_EXT[ext] ?? '' }) })
    }
    return { files, skipped }
}

/** Normaliza lo que entrega un `<input>` / drop: ZIP o imágenes sueltas/carpeta. */
export async function collectBulkFiles(list: File[]): Promise<{ files: BulkFile[]; skipped: number }> {
    const files: BulkFile[] = []
    let skipped = 0
    for (const f of list) {
        if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
            const z = await readZipImages(f)
            files.push(...z.files)
            skipped += z.skipped
            continue
        }
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        if (isIgnoredEntry(rel)) {
            skipped += 1
            continue
        }
        files.push({ path: rel, file: f })
    }
    return { files, skipped }
}
