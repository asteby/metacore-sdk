// BulkImageImportButton — carga masiva de imágenes a nivel catálogo.
//
// Botón que abre el asistente (elegir ZIP/carpeta → vista previa → importar con
// progreso → deshacer lote, en bulk-image-wizard.tsx, cargado bajo demanda) para cualquier modelo con una galería declarada
// (relación 1:N cuya columna de imagen trae `display_config.gallery: true`).
// No renderiza nada si el modelo no tiene galería. Usa solo contratos que ya
// existen: GET /metadata/table, GET /data/<modelo> (filtro `f_<col>=in:`),
// POST /upload, POST y DELETE /data/<hijo>.
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { modelCapability, useCan } from './permissions-context'
import type { TableMetadata } from './types'
import { deriveBulkImageTarget, type BulkImageTarget } from './bulk-image-target'

// El asistente (tabla de vista previa, progreso, deshacer) pesa bastante y solo se usa al
// pulsar el botón: se carga bajo demanda, fuera del JS inicial del shell.
const BulkImageDialog = lazy(() => import('./bulk-image-wizard').then((m) => ({ default: m.BulkImageDialog })))

export interface BulkImageImportButtonProps {
    /** Modelo padre (catálogo), p. ej. `products`. */
    model: string
    /** Metadata del padre; si se omite se lee de la caché / `/metadata/table`. */
    metadata?: TableMetadata | null
    /** Columna del padre que identifica la foto en el nombre de archivo. Default `sku`. */
    skuKey?: string
    /** Prefijo del endpoint de datos. Default `/data`. */
    dataBase?: string
    /** Lado largo mínimo antes de avisar «baja resolución». Default 600. */
    minLongSide?: number
    className?: string
    /** Tras importar o deshacer (refrescar la lista). */
    onChange?: () => void
}

export function BulkImageImportButton({
    model,
    metadata,
    skuKey = 'sku',
    dataBase = '/data',
    minLongSide,
    className,
    onChange,
}: BulkImageImportButtonProps) {
    const { t } = useTranslation()
    const api = useApi()
    const [target, setTarget] = useState<BulkImageTarget | null>(null)
    const [open, setOpen] = useState(false)
    const can = useCan()

    // Descubre la galería: relación 1:N cuyo hijo tiene una columna de imagen con gallery.
    useEffect(() => {
        let alive = true
        ;(async () => {
            try {
                let meta = metadata ?? useMetadataCache.getState().getMetadata(model) ?? null
                if (!meta) {
                    const res = (await api.get(`/metadata/table/${model}`)) as any
                    meta = res?.data?.data ?? null
                }
                // El padre debe tener la columna que identifica la foto (SKU).
                if (!(meta?.columns ?? []).some((c) => c.key === skuKey)) return
                for (const rel of meta?.relations ?? []) {
                    if (rel.kind !== 'one_to_many') continue
                    let child = useMetadataCache.getState().getMetadata(rel.through) ?? null
                    if (!child) {
                        const r = (await api.get(`/metadata/table/${rel.through}`)) as any
                        child = r?.data?.data ?? null
                    }
                    const found = deriveBulkImageTarget(rel, child)
                    if (found) {
                        if (alive) setTarget(found)
                        return
                    }
                }
            } catch {
                /* sin galería detectable: el botón no aparece */
            }
        })()
        return () => {
            alive = false
        }
    }, [api, model, metadata, skuKey])

    // El flujo crea y borra filas del HIJO: exige sus permisos, no solo los del padre.
    if (!target || !can(modelCapability(target.childModel, 'create')) || !can(modelCapability(target.childModel, 'delete'))) return null
    return (
        <>
            <button
                type="button"
                data-testid="bulk-image-open"
                onClick={() => setOpen(true)}
                className={
                    className ??
                    'inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background hover:bg-accent text-sm font-medium text-foreground'
                }
            >
                <ImagePlus className="size-4" />
                {t('bulk_images.open', { defaultValue: 'Cargar imágenes' })}
            </button>
            {open && (
                <Suspense fallback={null}>
                    <BulkImageDialog
                        open={open}
                        onOpenChange={setOpen}
                        model={model}
                        target={target}
                        skuKey={skuKey}
                        dataBase={dataBase}
                        minLongSide={minLongSide}
                        onChange={onChange}
                    />
                </Suspense>
            )}
        </>
    )
}
