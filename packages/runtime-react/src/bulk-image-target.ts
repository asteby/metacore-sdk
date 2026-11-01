// Descubrimiento de la galería de un modelo (ligero: lo importa el botón del catálogo,
// que vive en el JS inicial; el resto de la carga masiva se carga bajo demanda).
import type { ColumnDefinition, RelationMeta, TableMetadata } from './types'
import { relationColumnUi, relationGalleryColumn } from './dynamic-relation-helpers'

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

