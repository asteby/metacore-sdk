// RelationGallery — the thumbnail-grid view of a one_to_many relation whose
// image column declares `display_config.gallery: true` (e.g. a product's
// ProductImage rows). Opt-in: DynamicRelation keeps its table for every other
// relation. Pure UI over callbacks — DynamicRelation owns the API calls, so the
// `/upload` and `/data` contracts are the ones the table already uses.
//
//   - Add several photos at once (picker or drag & drop), one progress bar,
//     preview, error and retry per file; type/size limits with clear messages.
//   - Reorder by dragging (pointer or keyboard: Space to lift, arrows to move)
//     or with the explicit move buttons; the first image is the main one.
//   - Delete asks for confirmation, then offers «Deshacer» for a few seconds.
//   - Theme tokens only (bg-card, border, muted…) so it follows dark mode.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@asteby/metacore-ui/lib'
import { Button } from '@asteby/metacore-ui/primitives'
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Pencil, RotateCcw, Star, Trash2, X } from 'lucide-react'
import { validateUploadFile } from './upload-field'

export interface GalleryUploadProgress {
    (fraction: number): void
}

export interface RelationGalleryProps {
    rows: Record<string, any>[]
    rowKey: (row: Record<string, any>, index: number) => string
    imageKey: string
    /** Optional caption column (alt text). */
    captionKey?: string
    getImageUrl: (path: string) => string
    accept?: string
    maxSize?: number
    canCreate?: boolean
    canEdit?: boolean
    /** Reorder / «Hacer principal» (needs a position column). Default = canEdit. */
    canReorder?: boolean
    canDelete?: boolean
    /** Uploads one file and creates its row at gallery index `offset` past the end. */
    onUpload: (file: File, offset: number, onProgress: GalleryUploadProgress, reuseUrl?: string) => Promise<void>
    /** All uploads of one batch finished (refresh the list). */
    onUploadsSettled?: () => void
    /** New order of the rows (persist positions). */
    onReorder: (ordered: Record<string, any>[]) => Promise<void> | void
    onEdit?: (row: Record<string, any>) => void
    /** Asks for confirmation and deletes (with undo) — owned by the host. */
    onDelete?: (row: Record<string, any>) => void
    /** Keys of rows pending deletion (hidden while «Deshacer» is offered). */
    hiddenKeys?: Set<string>
}

interface UploadItem {
    id: string
    file: File
    preview: string
    progress: number
    status: 'uploading' | 'error' | 'done'
    error?: string
    offset: number
    /** Stored file of a failed row create — a retry reuses it. */
    uploadedUrl?: string
}

let uploadSeq = 0

export function RelationGallery({
    rows,
    rowKey,
    imageKey,
    captionKey,
    getImageUrl,
    accept = 'image/*',
    maxSize,
    canCreate = true,
    canEdit = true,
    canReorder,
    canDelete = true,
    onUpload,
    onUploadsSettled,
    onReorder,
    onEdit,
    onDelete,
    hiddenKeys,
}: RelationGalleryProps) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragOver, setDragOver] = useState(false)
    const [uploads, setUploads] = useState<UploadItem[]>([])
    const reorderable = canReorder ?? canEdit
    // Every local preview is released when its item goes away or on unmount.
    const uploadsRef = useRef<UploadItem[]>([])
    uploadsRef.current = uploads
    const releasePreview = (u: UploadItem) => {
        if (u.preview) URL.revokeObjectURL?.(u.preview)
    }

    const keyed = useMemo(
        () =>
            rows
                .map((row, i) => ({ row, key: rowKey(row, i) }))
                .filter((r) => !hiddenKeys?.has(r.key)),
        [rows, rowKey, hiddenKeys],
    )
    const ids = useMemo(() => keyed.map((k) => k.key), [keyed])

    useEffect(() => () => uploadsRef.current.forEach(releasePreview), [])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const move = useCallback(
        (from: number, to: number) => {
            if (from === to || to < 0 || to >= keyed.length) return
            void onReorder(arrayMove(keyed, from, to).map((k) => k.row))
        },
        [keyed, onReorder],
    )

    const handleDragEnd = useCallback(
        (e: DragEndEvent) => {
            if (!e.over || e.active.id === e.over.id) return
            move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
        },
        [ids, move],
    )

    const runUpload = useCallback(
        async (item: UploadItem) => {
            setUploads((list) => list.map((u) => (u.id === item.id ? { ...u, status: 'uploading', progress: 0, error: undefined } : u)))
            try {
                await onUpload(
                    item.file,
                    item.offset,
                    (fraction) =>
                        setUploads((list) => list.map((u) => (u.id === item.id ? { ...u, progress: Math.max(0, Math.min(1, fraction)) } : u))),
                    item.uploadedUrl,
                )
                setUploads((list) => list.map((u) => (u.id === item.id ? { ...u, status: 'done', progress: 1 } : u)))
                return true
            } catch (err: any) {
                const msg =
                    err?.response?.data?.message ||
                    err?.message ||
                    t('dynamic.gallery.upload_failed', { defaultValue: 'No se pudo subir la foto.' })
                const stored = typeof err?.uploadedUrl === 'string' ? err.uploadedUrl : item.uploadedUrl
                setUploads((list) => list.map((u) => (u.id === item.id ? { ...u, status: 'error', error: String(msg), uploadedUrl: stored } : u)))
                return false
            }
        },
        [onUpload, t],
    )

    const addFiles = useCallback(
        async (files: FileList | File[] | null | undefined) => {
            const picked = Array.from(files ?? [])
            if (picked.length === 0) return
            const accepted: UploadItem[] = []
            const rejected: UploadItem[] = []
            for (const file of picked) {
                const item: UploadItem = {
                    id: `up-${++uploadSeq}`,
                    file,
                    preview: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(file) : '',
                    progress: 0,
                    status: 'uploading',
                    offset: accepted.length,
                }
                const bad = validateUploadFile(file, { accept, maxSize })
                if (bad === 'type') {
                    rejected.push({ ...item, status: 'error', error: t('dynamic.gallery.invalid_type', { defaultValue: 'Formato no permitido. Usa JPG, PNG o WebP.' }) })
                } else if (bad === 'size') {
                    const mb = ((maxSize ?? 0) / (1024 * 1024)).toFixed(1)
                    rejected.push({ ...item, status: 'error', error: t('dynamic.gallery.too_large', { mb, defaultValue: `La foto pesa más de ${mb} MB.` }) })
                } else {
                    accepted.push(item)
                }
            }
            setUploads((list) => {
                list.filter((u) => u.status === 'done').forEach(releasePreview)
                return [...list.filter((u) => u.status !== 'done'), ...accepted, ...rejected]
            })
            // Sequential: keeps positions in pick order and spares the server.
            let any = false
            for (const item of accepted) {
                if (await runUpload(item)) any = true
            }
            if (any) onUploadsSettled?.()
        },
        [accept, maxSize, runUpload, onUploadsSettled, t],
    )

    const retry = useCallback(
        async (item: UploadItem) => {
            if (await runUpload({ ...item, offset: 0 })) onUploadsSettled?.()
        },
        [runUpload, onUploadsSettled],
    )

    const dismiss = useCallback((id: string) => {
        setUploads((list) => {
            const gone = list.find((u) => u.id === id)
            if (gone) releasePreview(gone)
            return list.filter((u) => u.id !== id)
        })
    }, [])

    const pending = uploads.filter((u) => u.status !== 'done')
    // A retry numbers its photo past the rows already refreshed; while a batch
    // is still uploading that list is stale, so retry waits for it.
    const busy = uploads.some((u) => u.status === 'uploading')
    const hintId = useMemo(() => `gallery-hint-${++uploadSeq}`, [])
    const mainLabel = t('dynamic.gallery.main', { defaultValue: 'Principal' })

    return (
        <div className="grid gap-3" data-relation-view="gallery">
            {canCreate && (
                <div
                    role="button"
                    tabIndex={0}
                    aria-label={t('dynamic.gallery.add', { defaultValue: 'Agregar fotos' })}
                    aria-describedby={hintId}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            inputRef.current?.click()
                        }
                    }}
                    onDragOver={(e) => {
                        e.preventDefault()
                        setDragOver(true)
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        void addFiles(e.dataTransfer?.files)
                    }}
                    className={cn(
                        'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        dragOver && 'border-primary/60 bg-muted/50',
                    )}
                    data-testid="gallery-dropzone"
                >
                    <ImagePlus className="h-6 w-6" aria-hidden />
                    <span className="font-medium text-foreground">
                        {t('dynamic.gallery.add', { defaultValue: 'Agregar fotos' })}
                    </span>
                    <span className="text-xs" id={hintId}>
                        {maxSize
                            ? t('dynamic.gallery.hint_size', {
                                  mb: (maxSize / (1024 * 1024)).toFixed(0),
                                  defaultValue: `Arrastra aquí o elige varias a la vez · JPG, PNG o WebP · hasta ${(maxSize / (1024 * 1024)).toFixed(0)} MB`,
                              })
                            : t('dynamic.gallery.hint', { defaultValue: 'Arrastra aquí o elige varias a la vez · JPG, PNG o WebP' })}
                    </span>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        multiple
                        className="hidden"
                        data-testid="gallery-input"
                        onChange={(e) => {
                            void addFiles(e.target.files)
                            e.target.value = ''
                        }}
                    />
                </div>
            )}

            {pending.length > 0 && (
                <ul className="grid gap-2" aria-live="polite" data-testid="gallery-uploads">
                    {pending.map((u) => (
                        <li key={u.id} className="flex items-center gap-3 rounded-md border bg-card p-2">
                            {u.preview ? (
                                <img src={u.preview} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                            ) : (
                                <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm">{u.file.name}</div>
                                {u.status === 'error' ? (
                                    <div className="text-xs text-destructive" role="alert">
                                        {u.error}
                                    </div>
                                ) : (
                                    <div
                                        className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted"
                                        role="progressbar"
                                        aria-label={u.file.name}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={Math.round(u.progress * 100)}
                                    >
                                        <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                                    </div>
                                )}
                            </div>
                            {u.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                            {u.status === 'error' && !validateUploadFile(u.file, { accept, maxSize }) && (
                                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void retry(u)} aria-label={t('dynamic.gallery.retry', { defaultValue: 'Reintentar' })}>
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                            )}
                            {u.status === 'error' && (
                                <Button type="button" size="sm" variant="ghost" onClick={() => dismiss(u.id)} aria-label={t('dynamic.gallery.dismiss', { defaultValue: 'Quitar' })}>
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {keyed.length === 0 && !canCreate && pending.length === 0 && (
                <div className="rounded-md border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
                    {t('dynamic.gallery.empty', { defaultValue: 'Sin fotos.' })}
                </div>
            )}

            {keyed.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={ids} strategy={rectSortingStrategy}>
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-testid="gallery-grid">
                            {keyed.map(({ row, key }, index) => (
                                <GalleryTile
                                    key={key}
                                    id={key}
                                    src={row[imageKey] ? getImageUrl(String(row[imageKey])) : ''}
                                    caption={captionKey ? String(row[captionKey] ?? '') : ''}
                                    index={index}
                                    total={keyed.length}
                                    isMain={index === 0}
                                    mainLabel={mainLabel}
                                    canEdit={canEdit}
                                    canReorder={reorderable}
                                    canDelete={canDelete}
                                    onMove={(to) => move(index, to)}
                                    onEdit={onEdit ? () => onEdit(row) : undefined}
                                    onDelete={onDelete ? () => onDelete(row) : undefined}
                                />
                            ))}
                        </ul>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    )
}

function GalleryTile({
    id,
    src,
    caption,
    index,
    total,
    isMain,
    mainLabel,
    canEdit,
    canReorder,
    canDelete,
    onMove,
    onEdit,
    onDelete,
}: {
    id: string
    src: string
    caption: string
    index: number
    total: number
    isMain: boolean
    mainLabel: string
    canEdit: boolean
    canReorder: boolean
    canDelete: boolean
    onMove: (to: number) => void
    onEdit?: () => void
    onDelete?: () => void
}) {
    const { t } = useTranslation()
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canReorder })
    const label = caption || t('dynamic.gallery.photo', { n: index + 1, defaultValue: `Foto ${index + 1}` })
    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                'group relative min-w-0 overflow-hidden rounded-lg border bg-card',
                isMain && 'ring-2 ring-primary',
                isDragging && 'z-10 opacity-80 shadow-lg',
            )}
            data-testid="gallery-tile"
            data-main={isMain ? 'true' : undefined}
        >
            <div
                className="aspect-square w-full touch-none bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...attributes}
                {...listeners}
                aria-roledescription={t('dynamic.gallery.sortable', { defaultValue: 'foto reordenable' })}
                aria-label={`${label}${isMain ? ` · ${mainLabel}` : ''}`}
            >
                {src ? (
                    <img src={src} alt={caption} className="h-full w-full min-h-24 object-cover" draggable={false} />
                ) : null}
            </div>
            {isMain && (
                <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    <Star className="h-3 w-3" aria-hidden />
                    {mainLabel}
                </span>
            )}
            {/* Wraps instead of clipping: a 140 px tile (or a phone) holds up to five icons. */}
            <div className="flex flex-wrap items-center justify-between gap-x-1 border-t bg-card px-1 py-0.5" data-testid="gallery-tile-actions">
                <div className="flex flex-wrap items-center">
                    {canReorder && (
                        <>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                disabled={index === 0}
                                onClick={() => onMove(index - 1)}
                                aria-label={t('dynamic.gallery.move_before', { defaultValue: 'Mover antes' })}
                            >
                                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                disabled={index === total - 1}
                                onClick={() => onMove(index + 1)}
                                aria-label={t('dynamic.gallery.move_after', { defaultValue: 'Mover después' })}
                            >
                                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                            </Button>
                            {!isMain && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={() => onMove(0)}
                                    aria-label={t('dynamic.gallery.make_main', { defaultValue: 'Hacer principal' })}
                                    title={t('dynamic.gallery.make_main', { defaultValue: 'Hacer principal' })}
                                >
                                    <Star className="h-4 w-4" />
                                </Button>
                            )}
                        </>
                    )}
                </div>
                <div className="flex flex-wrap items-center">
                    {canEdit && onEdit && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit} aria-label={t('dynamic.gallery.edit', { defaultValue: 'Editar foto' })}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                    {canDelete && onDelete && (
                        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={onDelete} aria-label={t('dynamic.gallery.delete', { defaultValue: 'Eliminar foto' })}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </li>
    )
}
