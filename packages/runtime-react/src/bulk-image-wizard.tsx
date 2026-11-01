// Asistente de carga masiva (se carga bajo demanda desde bulk-image-dialog.tsx para no
// engordar el JS inicial del shell). Ver el encabezado de ese archivo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@asteby/metacore-ui/primitives'
import { AlertCircle, Check, FolderUp, ImagePlus, Loader2, Undo2, Download } from 'lucide-react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { cacheScope } from './cache-scope'
import { modelCapability, useCan } from './permissions-context'
import { Progress } from './dialogs/_primitives'
import { extractUploadedValue, readImageSize } from './upload-field'
import type { TableMetadata } from './types'
import {
    buildChildPayload,
    buildPreview,
    chunk,
    collectBulkFiles,
    collectCandidateSkus,
    deriveBulkImageTarget,
    isImportable,
    loadBatchLogs,
    MAX_BULK_FILES,
    newBatchId,
    normalizeSku,
    pendingUndo,
    saveBatchLog,
    selectForImport,
    summarizePreview,
    type BatchLog,
    type BulkFile,
    type BulkImageTarget,
    type ParentRef,
    type PreviewRow,
} from './bulk-image-import'


type Step = 'pick' | 'analyzing' | 'preview' | 'importing' | 'done'
type ItemState = { status: 'pending' | 'uploading' | 'done' | 'error'; progress: number; error?: string }

const LOOKUP_CHUNK = 40
const CONCURRENCY = 3
const PAGE_SIZE = 200

/**
 * Alcance del registro de lotes: organización + usuario (sin el idioma de
 * cacheScope, para que cambiar de idioma no esconda lotes). null = desconocido:
 * no se ofrecen lotes anteriores.
 */
function batchScope(): string | null {
    const s = cacheScope()
    return s ? s.split(':').slice(0, 2).join(':') : null
}

/** map con concurrencia acotada (decodificar cientos de bitmaps a la vez tumba la pestaña). */
async function mapPool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length)
    let i = 0
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) {
                const idx = i++
                out[idx] = await fn(items[idx])
            }
        }),
    )
    return out
}

function asRows(res: any): any[] {
    const d = res?.data?.data ?? res?.data
    return Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []
}

export type BulkImageDialogProps = DialogProps

interface DialogProps {
    open: boolean
    onOpenChange: (o: boolean) => void
    model: string
    target: BulkImageTarget
    skuKey: string
    dataBase: string
    minLongSide?: number
    onChange?: () => void
}

export function BulkImageDialog({ open, onOpenChange, model, target, skuKey, dataBase, minLongSide, onChange }: DialogProps) {
    const { t } = useTranslation()
    const api = useApi()
    const [step, setStep] = useState<Step>('pick')
    const [error, setError] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)
    const [rows, setRows] = useState<PreviewRow[]>([])
    const [excluded, setExcluded] = useState<Set<string>>(new Set())
    const [items, setItems] = useState<Record<string, ItemState>>({})
    const [log, setLog] = useState<BatchLog | null>(null)
    const [undoing, setUndoing] = useState<{ done: number; total: number } | null>(null)
    const [previousLogs, setPreviousLogs] = useState<BatchLog[]>(() => { const sc = batchScope(); return sc === null ? [] : loadBatchLogs(undefined, sc).filter((l) => l.childModel === target.childModel && pendingUndo(l).length > 0) })
    const filesRef = useRef<Map<string, File>>(new Map())
    const urlsRef = useRef<Map<string, string>>(new Map())
    const cancelRef = useRef(false)
    const zipInput = useRef<HTMLInputElement>(null)
    const dirInput = useRef<HTMLInputElement>(null)

    const releaseUrls = () => {
        urlsRef.current.forEach((u) => URL.revokeObjectURL?.(u))
        urlsRef.current.clear()
    }
    useEffect(() => () => releaseUrls(), [])

    const childEndpoint = `${dataBase}/${target.childModel}`
    const parentEndpoint = `${dataBase}/${model}`

    const analyze = useCallback(
        async (picked: File[]) => {
            if (picked.length === 0) return
            setError(null)
            setNote(null)
            setStep('analyzing')
            try {
                const { files, skipped } = await collectBulkFiles(picked)
                if (files.length === 0) throw new Error(t('bulk_images.no_images', { defaultValue: 'No se encontraron imágenes (jpg, png, webp, gif, avif).' }))
                if (files.length > MAX_BULK_FILES) {
                    throw new Error(t('bulk_images.too_many', { defaultValue: 'Máximo {{n}} imágenes por lote; divide la carga.', n: MAX_BULK_FILES }))
                }
                if (skipped > 0) setNote(t('bulk_images.skipped', { defaultValue: '{{n}} archivos ignorados (no son imágenes o son demasiado grandes).', n: skipped }))

                // Medir en el navegador (el servidor no mide nada).
                releaseUrls()
                filesRef.current = new Map()
                const inputs = await mapPool(
                    files,
                    4,
                    async (f: BulkFile) => {
                        const size = await readImageSize(f.file)
                        filesRef.current.set(f.path, f.file)
                        urlsRef.current.set(f.path, URL.createObjectURL(f.file))
                        const ok = !!(size.width && size.height)
                        return { path: f.path, size: f.file.size, width: size.width, height: size.height, decodable: ok }
                    },
                )

                // Resolver SKU contra la API de datos existente (por lotes).
                const skus = collectCandidateSkus(inputs.map((i) => i.path)).filter((s) => !s.includes(','))
                const parents = new Map<string, ParentRef>()
                for (const part of chunk(skus, LOOKUP_CHUNK)) {
                    const res = await api.get(parentEndpoint, {
                        params: { [`f_${skuKey}`]: `in:${part.join(',')}`, per_page: Math.min(200, part.length + 20) },
                    })
                    for (const r of asRows(res)) {
                        const sku = String(r[skuKey] ?? '')
                        if (!sku || r.id === undefined || r.id === null) continue
                        parents.set(normalizeSku(sku), {
                            id: String(r.id),
                            sku,
                            label: String(r.name ?? r.title ?? r.label ?? sku),
                            existingMaxPosition: -1,
                            existingCount: 0,
                        })
                    }
                }

                // Fotos que ya tiene cada producto: las nuevas van a continuación.
                if (target.positionKey) {
                    const byId = new Map([...parents.values()].map((p) => [p.id, p]))
                    // El kernel limita per_page a 200: se pagina hasta agotar.
                    for (const part of chunk([...byId.keys()], LOOKUP_CHUNK)) {
                        for (let page = 1; page <= 50; page++) {
                            const res = await api.get(childEndpoint, {
                                params: { [`f_${target.foreignKey}`]: `in:${part.join(',')}`, per_page: PAGE_SIZE, page },
                            })
                            const got = asRows(res)
                            for (const r of got) {
                                const p = byId.get(String(r[target.foreignKey]))
                                if (!p) continue
                                p.existingCount += 1
                                const n = Number(r[target.positionKey])
                                if (Number.isFinite(n) && n > p.existingMaxPosition) p.existingMaxPosition = n
                            }
                            if (got.length < PAGE_SIZE) break
                        }
                    }
                    // Fotos existentes sin posición: las nuevas van detrás, nunca delante.
                    for (const p of byId.values()) {
                        if (p.existingCount > 0 && p.existingMaxPosition < p.existingCount - 1) p.existingMaxPosition = p.existingCount - 1
                    }
                }

                setRows(buildPreview(inputs, parents, { minLongSide, maxSize: target.maxSize }))
                setExcluded(new Set())
                setStep('preview')
            } catch (e: any) {
                setError(e?.message || t('bulk_images.analyze_failed', { defaultValue: 'No se pudo analizar la selección.' }))
                setStep('pick')
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [api, childEndpoint, minLongSide, parentEndpoint, skuKey, target],
    )

    const summary = useMemo(() => summarizePreview(rows, excluded), [rows, excluded])

    const runImport = useCallback(async () => {
        const queue = selectForImport(rows, excluded)
        if (queue.length === 0) return
        cancelRef.current = false
        setStep('importing')
        setError(null)
        const batch: BatchLog = { batchId: newBatchId(), createdAt: new Date().toISOString(), childModel: target.childModel, scope: batchScope() ?? undefined, items: [] }
        setLog(batch)
        setItems(Object.fromEntries(queue.map((r) => [r.key, { status: 'pending', progress: 0 } as ItemState])))
        const patch = (key: string, s: Partial<ItemState>) =>
            setItems((m) => ({ ...m, [key]: { ...m[key], ...s } as ItemState }))

        let next = 0
        const worker = async () => {
            while (!cancelRef.current) {
                const row = queue[next++]
                if (!row) return
                patch(row.key, { status: 'uploading', progress: 0 })
                let url = ''
                try {
                    const file = filesRef.current.get(row.path)
                    if (!file) throw new Error('archivo no disponible')
                    const form = new FormData()
                    form.append('file', file)
                    if (target.storagePath) {
                        form.append('folder', target.storagePath)
                        form.append('storage_path', target.storagePath)
                    }
                    const up = await api.post('/upload', form, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                        onUploadProgress: (e: { loaded: number; total?: number }) => {
                            if (e.total) patch(row.key, { progress: (e.loaded / e.total) * 0.9 })
                        },
                    } as any)
                    const body = (up as { data?: any })?.data
                    if (body && body.success === false) throw new Error(body.message || 'upload failed')
                    url = extractUploadedValue(body)
                    if (!url) throw new Error('upload failed')
                    const res = (await api.post(childEndpoint, buildChildPayload(target, row, url))) as any
                    if (!res?.data?.success) throw new Error(res?.data?.message || 'create failed')
                    const created = res.data.data ?? res.data
                    const rowId = created?.id
                    // Sin id no hay deshacer fiable: se avisa en vez de callar.
                    if (rowId === undefined || rowId === null) throw new Error('el servidor no devolvió el id de la fila creada')
                    batch.items.push({ rowId: String(rowId), path: row.path, sku: row.sku ?? '', parentId: row.parent!.id, url })
                    saveBatchLog(batch)
                    patch(row.key, { status: 'done', progress: 1 })
                } catch (e: any) {
                    patch(row.key, { status: 'error', progress: 0, error: e?.response?.data?.message || e?.message || 'error' })
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
        setLog({ ...batch, items: [...batch.items] })
        setStep('done')
        if (batch.items.length) onChange?.()
    }, [api, childEndpoint, excluded, onChange, rows, target])

    const undo = useCallback(
        async (l: BatchLog) => {
            const todo = pendingUndo(l)
            setUndoing({ done: 0, total: todo.length })
            setError(null)
            const failures: string[] = []
            for (const it of todo) {
                try {
                    const res = (await api.delete(`${childEndpoint}/${it.rowId}`)) as any
                    if (res?.data?.success === false) throw new Error(res.data.message || 'delete failed')
                    it.undone = true
                } catch (e: any) {
                    // 404 = ya no existe: el objetivo (que no esté) está cumplido.
                    if (e?.response?.status === 404) it.undone = true
                    else failures.push(`${it.sku || it.path}`)
                }
                setUndoing((u) => (u ? { ...u, done: u.done + 1 } : u))
            }
            saveBatchLog(l)
            setUndoing(null)
            setLog((cur) => (cur && cur.batchId === l.batchId ? { ...l, items: [...l.items] } : cur))
            setPreviousLogs((ls) => ls.map((x) => (x.batchId === l.batchId ? { ...l, items: [...l.items] } : x)).filter((x) => pendingUndo(x).length > 0))
            if (failures.length) {
                setError(t('bulk_images.undo_partial', { defaultValue: 'No se pudieron deshacer: {{list}}. Reintenta.', list: failures.slice(0, 10).join(', ') }))
            }
            onChange?.()
        },
        [api, childEndpoint, onChange, t],
    )

    const downloadLog = (l: BatchLog) => {
        const blob = new Blob([JSON.stringify(l, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${l.batchId}.json`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }

    const statusLabel = (r: PreviewRow) => {
        switch (r.status) {
            case 'ok': return t('bulk_images.s_ok', { defaultValue: 'Listo' })
            case 'low_res': return t('bulk_images.s_low', { defaultValue: 'Baja resolución' })
            case 'sku_not_found': return t('bulk_images.s_nosku', { defaultValue: 'SKU no encontrado' })
            case 'duplicate': return t('bulk_images.s_dup', { defaultValue: 'Duplicado' })
            case 'invalid_image': return t('bulk_images.s_invalid', { defaultValue: 'No es imagen' })
            case 'too_large': return t('bulk_images.s_large', { defaultValue: 'Muy pesada' })
        }
    }

    const doneCount = Object.values(items).filter((i) => i.status === 'done').length
    const errCount = Object.values(items).filter((i) => i.status === 'error').length
    const total = Object.keys(items).length
    const busy = step === 'importing' || step === 'analyzing' || !!undoing

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o && busy) return; if (!o) releaseUrls(); onOpenChange(o) }}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="bulk-image-dialog">
                <DialogHeader>
                    <DialogTitle>{t('bulk_images.title', { defaultValue: 'Carga masiva de imágenes' })}</DialogTitle>
                    <DialogDescription>
                        {t('bulk_images.help', {
                            defaultValue: 'Sube un ZIP o una carpeta con archivos nombrados SKU.jpg, SKU_2.jpg… Cada archivo se agrega a la galería del producto con ese SKU.',
                        })}
                    </DialogDescription>
                </DialogHeader>

                {error && <div role="alert" className="text-sm text-destructive flex gap-2 items-start"><AlertCircle className="size-4 mt-0.5" />{error}</div>}
                {note && <div className="text-xs text-muted-foreground">{note}</div>}

                {step === 'pick' && (
                    <div className="space-y-4">
                        <div
                            className="border-2 border-dashed rounded-lg p-8 text-center text-sm text-muted-foreground"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); void analyze(Array.from(e.dataTransfer?.files ?? [])) }}
                        >
                            <p className="mb-3">{t('bulk_images.drop', { defaultValue: 'Arrastra aquí el ZIP o las imágenes' })}</p>
                            <div className="flex gap-2 justify-center">
                                <Button variant="outline" onClick={() => zipInput.current?.click()}>
                                    <ImagePlus className="size-4 mr-1" />{t('bulk_images.pick_zip', { defaultValue: 'Elegir ZIP o imágenes' })}
                                </Button>
                                <Button variant="outline" onClick={() => dirInput.current?.click()}>
                                    <FolderUp className="size-4 mr-1" />{t('bulk_images.pick_folder', { defaultValue: 'Elegir carpeta' })}
                                </Button>
                            </div>
                            <input
                                ref={zipInput} type="file" multiple className="hidden" data-testid="bulk-image-input"
                                accept=".zip,application/zip,image/*"
                                onChange={(e) => { void analyze(Array.from(e.target.files ?? [])); e.target.value = '' }}
                            />
                            <input
                                ref={dirInput} type="file" multiple className="hidden" data-testid="bulk-image-dir"
                                {...({ webkitdirectory: '' } as Record<string, string>)}
                                onChange={(e) => { void analyze(Array.from(e.target.files ?? [])); e.target.value = '' }}
                            />
                        </div>
                        {previousLogs.length > 0 && (
                            <div className="text-sm space-y-2">
                                <div className="font-medium">{t('bulk_images.previous', { defaultValue: 'Lotes anteriores' })}</div>
                                {previousLogs.map((l) => (
                                    <div key={l.batchId} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                                        <span>{new Date(l.createdAt).toLocaleString()} · {pendingUndo(l).length} {t('bulk_images.images', { defaultValue: 'imágenes' })}</span>
                                        <span className="flex gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => downloadLog(l)}><Download className="size-4" /></Button>
                                            <Button size="sm" variant="outline" disabled={!!undoing} onClick={() => void undo(l)}>
                                                <Undo2 className="size-4 mr-1" />{t('bulk_images.undo', { defaultValue: 'Deshacer lote' })}
                                            </Button>
                                        </span>
                                    </div>
                                ))}
                                {undoing && <Progress value={(undoing.done / Math.max(1, undoing.total)) * 100} />}
                            </div>
                        )}
                    </div>
                )}

                {step === 'analyzing' && (
                    <div className="flex items-center gap-2 text-sm py-8 justify-center"><Loader2 className="size-4 animate-spin" />{t('bulk_images.analyzing', { defaultValue: 'Analizando imágenes y buscando SKU…' })}</div>
                )}

                {(step === 'preview' || step === 'importing' || step === 'done') && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-3 text-sm" data-testid="bulk-image-summary">
                            <span>{t('bulk_images.sum_import', { defaultValue: '{{n}} fotos para {{p}} productos', n: summary.importable, p: summary.products })}</span>
                            {summary.sku_not_found > 0 && <span className="text-destructive">{summary.sku_not_found} {t('bulk_images.s_nosku', { defaultValue: 'SKU no encontrado' })}</span>}
                            {summary.duplicate > 0 && <span className="text-destructive">{summary.duplicate} {t('bulk_images.s_dup', { defaultValue: 'Duplicado' })}</span>}
                            {summary.low_res > 0 && <span className="text-amber-600">{summary.low_res} {t('bulk_images.s_low', { defaultValue: 'Baja resolución' })}</span>}
                            {(summary.invalid_image + summary.too_large) > 0 && <span className="text-destructive">{summary.invalid_image + summary.too_large} {t('bulk_images.s_invalid', { defaultValue: 'No es imagen' })}</span>}
                        </div>
                        {step !== 'preview' && (
                            <div className="space-y-1">
                                <Progress value={(doneCount + errCount) / Math.max(1, total) * 100} />
                                <div className="text-xs text-muted-foreground" data-testid="bulk-image-progress">
                                    {t('bulk_images.progress', { defaultValue: '{{done}} de {{total}} subidas · {{err}} con error', done: doneCount, total, err: errCount })}
                                </div>
                            </div>
                        )}
                        <div className="border rounded-md max-h-[45vh] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {step === 'preview' && <TableHead className="w-8" />}
                                        <TableHead className="w-14" />
                                        <TableHead>{t('bulk_images.col_file', { defaultValue: 'Archivo' })}</TableHead>
                                        <TableHead>{t('bulk_images.col_product', { defaultValue: 'Producto' })}</TableHead>
                                        <TableHead>{t('bulk_images.col_pos', { defaultValue: 'Pos.' })}</TableHead>
                                        <TableHead>{t('bulk_images.col_status', { defaultValue: 'Estado' })}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((r) => {
                                        const it = items[r.key]
                                        const skip = excluded.has(r.key)
                                        return (
                                            <TableRow key={r.key} data-status={r.status} className={skip ? 'opacity-50' : undefined}>
                                                {step === 'preview' && (
                                                    <TableCell>
                                                        {isImportable(r) && (
                                                            <input
                                                                type="checkbox" checked={!skip} aria-label={r.path}
                                                                onChange={() => setExcluded((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n })}
                                                            />
                                                        )}
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    {urlsRef.current.get(r.path) && <img src={urlsRef.current.get(r.path)} alt="" className="size-10 object-contain rounded bg-muted" loading="lazy" />}
                                                </TableCell>
                                                <TableCell className="text-xs break-all">{r.path}<div className="text-muted-foreground">{r.width && r.height ? `${r.width}×${r.height}` : ''}</div></TableCell>
                                                <TableCell className="text-xs">{r.parent ? <>{r.parent.label}<div className="text-muted-foreground">{r.sku}{r.parent.existingCount ? ` · ${r.parent.existingCount} ${t('bulk_images.already', { defaultValue: 'ya tiene' })}` : ''}</div></> : '—'}</TableCell>
                                                <TableCell className="text-xs">{isImportable(r) && !skip && typeof r.position === 'number' ? (r.position === 0 ? `1 · ${t('bulk_images.main', { defaultValue: 'Principal' })}` : r.position + 1) : '—'}</TableCell>
                                                <TableCell className="text-xs">
                                                    {it ? (
                                                        it.status === 'done' ? <span className="text-emerald-600 inline-flex items-center gap-1"><Check className="size-3" />{t('bulk_images.uploaded', { defaultValue: 'Subida' })}</span>
                                                        : it.status === 'error' ? <span className="text-destructive" title={it.error}>{it.error}</span>
                                                        : <div className="w-24"><Progress value={it.progress * 100} /></div>
                                                    ) : (
                                                        <span className={r.status === 'ok' ? '' : r.status === 'low_res' ? 'text-amber-600' : 'text-destructive'} title={r.note}>{statusLabel(r)}</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {step === 'preview' && (
                        <>
                            <Button variant="outline" onClick={() => { releaseUrls(); setRows([]); setStep('pick') }}>{t('bulk_images.back', { defaultValue: 'Elegir otros' })}</Button>
                            <Button disabled={summary.importable === 0} onClick={() => void runImport()} data-testid="bulk-image-import">
                                {t('bulk_images.import', { defaultValue: 'Importar {{n}} fotos', n: summary.importable })}
                            </Button>
                        </>
                    )}
                    {step === 'importing' && (
                        <Button variant="outline" onClick={() => { cancelRef.current = true }}>{t('bulk_images.cancel', { defaultValue: 'Detener' })}</Button>
                    )}
                    {step === 'done' && log && (
                        <>
                            <Button variant="ghost" onClick={() => downloadLog(log)}><Download className="size-4 mr-1" />{t('bulk_images.download_log', { defaultValue: 'Descargar registro' })}</Button>
                            {pendingUndo(log).length > 0 && (
                                <Button variant="outline" disabled={!!undoing} onClick={() => void undo(log)} data-testid="bulk-image-undo">
                                    <Undo2 className="size-4 mr-1" />
                                    {undoing ? `${undoing.done}/${undoing.total}` : t('bulk_images.undo', { defaultValue: 'Deshacer lote' })}
                                </Button>
                            )}
                            <Button onClick={() => { releaseUrls(); onOpenChange(false) }}>{t('bulk_images.close', { defaultValue: 'Cerrar' })}</Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
