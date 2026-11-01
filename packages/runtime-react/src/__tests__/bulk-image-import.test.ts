import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import {
    buildChildPayload, buildPreview, collectBulkFiles, collectCandidateSkus, deriveBulkImageTarget,
    isIgnoredEntry, loadBatchLogs, parseImageName, pendingUndo, saveBatchLog, selectForImport,
    summarizePreview, type ParentRef,
} from '../bulk-image-import'

const parent = (id: string, sku: string, max = 0, count = 0): ParentRef => ({ id, sku, label: sku, existingMaxPosition: max, existingCount: count })
const map = (...ps: ParentRef[]) => new Map(ps.map((p) => [p.sku.toLowerCase(), p]))
const inp = (path: string, w = 800, h = 800) => ({ path, size: 1000, width: w, height: h })

describe('parseImageName', () => {
    it('SKU.ext y SKU_N.ext', () => {
        expect(parseImageName('a/b/ABC123.jpg').candidates).toEqual([{ sku: 'ABC123', order: 1 }])
        expect(parseImageName('ABC123_2.png').candidates).toEqual([{ sku: 'ABC123_2', order: 1 }, { sku: 'ABC123', order: 2 }])
    })
    it('ignora basura de zips', () => {
        expect(isIgnoredEntry('__MACOSX/x.jpg')).toBe(true)
        expect(isIgnoredEntry('.DS_Store')).toBe(true)
        expect(isIgnoredEntry('fotos/')).toBe(true)
        expect(isIgnoredEntry('notas.txt')).toBe(true)
        expect(isIgnoredEntry('fotos/A.JPG')).toBe(false)
    })
    it('candidatos únicos', () => {
        expect(collectCandidateSkus(['A.jpg', 'A_2.jpg', 'b.jpg']).sort()).toEqual(['A', 'A_2', 'B', 'a', 'a_2', 'b'].sort())
    })
})

describe('buildPreview', () => {
    const A = parent('1', 'A100', 2, 2)
    const B = parent('2', 'B200')
    it('asigna producto, orden y posición a continuación de las existentes', () => {
        const rows = buildPreview([inp('A100_2.jpg'), inp('A100.jpg'), inp('B200.jpg')], map(A, B))
        const a1 = rows.find((r) => r.path === 'A100.jpg')!
        const a2 = rows.find((r) => r.path === 'A100_2.jpg')!
        expect([a1.position, a2.position]).toEqual([3, 4])
        expect(rows.find((r) => r.path === 'B200.jpg')!.position).toBe(1)
    })
    it('SKU no encontrado, baja resolución, duplicado e inválida', () => {
        const rows = buildPreview(
            [inp('ZZZ.jpg'), inp('B200.jpg', 100, 100), inp('x/A100.jpg'), inp('y/A100.jpg'), { path: 'C.png', size: 1, decodable: false }],
            map(A, B),
        )
        const st = Object.fromEntries(rows.map((r) => [r.path, r.status]))
        expect(st['ZZZ.jpg']).toBe('sku_not_found')
        expect(st['B200.jpg']).toBe('low_res')
        expect(st['x/A100.jpg']).toBe('ok')
        expect(st['y/A100.jpg']).toBe('duplicate')
        expect(st['C.png']).toBe('invalid_image')
        const s = summarizePreview(rows)
        expect(s).toMatchObject({ importable: 2, products: 2, duplicate: 1, sku_not_found: 1, low_res: 1, invalid_image: 1 })
    })
    it('SKU que termina en _N gana el nombre completo', () => {
        const X = parent('9', 'KIT_2')
        const rows = buildPreview([inp('KIT_2.jpg')], map(X, parent('8', 'KIT')))
        expect(rows[0].parent?.id).toBe('9')
        expect(rows[0].order).toBe(1)
    })
    it('SKU.jpg y SKU_2.jpg: la principal es la primera aunque la ruta ordene al revés', () => {
        const rows = buildPreview([inp('B200_2.jpg'), inp('B200.jpg')], map(B))
        const sel = selectForImport(rows, new Set())
        const pos = Object.fromEntries(sel.map((r) => [r.path, r.position]))
        expect(pos).toEqual({ 'B200.jpg': 1, 'B200_2.jpg': 2 })
        expect(Object.fromEntries(rows.map((r) => [r.path, r.position]))).toEqual(pos)
    })
    it('SKU_0 y SKU_01 cuentan como orden 1 y chocan con SKU.jpg', () => {
        const rows = buildPreview([inp('B200.jpg'), inp('B200_01.jpg')], map(B))
        expect(rows.filter((r) => r.status === 'duplicate')).toHaveLength(1)
    })
    it('el cruce no distingue mayúsculas', () => {
        const rows = buildPreview([inp('b200.jpg')], map(B))
        expect(rows[0].parent?.id).toBe('2')
    })
    it('excluir a mano recompacta posiciones', () => {
        const rows = buildPreview([inp('B200.jpg'), inp('B200_2.jpg')], map(B))
        const first = rows.find((r) => r.path === 'B200.jpg')!
        const sel = selectForImport(rows, new Set([first.key]))
        expect(sel).toHaveLength(1)
        expect(sel[0].position).toBe(1)
    })
})

describe('buildChildPayload / deriveBulkImageTarget', () => {
    const meta: any = {
        columns: [
            { key: 'product_id' },
            { key: 'url', type: 'image', styleConfig: { gallery: true, storage_path: 'products' } },
            { key: 'width', styleConfig: { derive: 'image_width' } },
            { key: 'height', styleConfig: { derive: 'image_height' } },
            { key: 'position', styleConfig: { derive: 'next_position' } },
        ],
    }
    it('detecta la galería y arma la fila', () => {
        const t = deriveBulkImageTarget({ kind: 'one_to_many', through: 'product_images', foreign_key: 'product_id' }, meta)!
        expect(t).toMatchObject({ imageKey: 'url', widthKey: 'width', heightKey: 'height', positionKey: 'position', storagePath: 'products' })
        const [row] = buildPreview([inp('A.jpg', 640, 480)], map(parent('1', 'A')))
        expect(buildChildPayload(t, row, '/f/a.jpg')).toEqual({ url: '/f/a.jpg', product_id: '1', position: 1, width: 640, height: 480 })
    })
    it('sin la FK declarada en el hijo = null (el filtro in: se ignoraría)', () => {
        expect(deriveBulkImageTarget({ kind: 'one_to_many', through: 'pi', foreign_key: 'nope' }, meta)).toBeNull()
    })
    it('sin galería = null', () => {
        expect(deriveBulkImageTarget({ kind: 'one_to_many', through: 'x', foreign_key: 'p' }, { columns: [{ key: 'url' }] } as any)).toBeNull()
    })
})

describe('registro de lote', () => {
    it('persiste y filtra lo deshecho', () => {
        const mem: Record<string, string> = {}
        const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v } }
        const log = { batchId: 'b1', createdAt: 'x', childModel: 'pi', items: [{ rowId: '1', path: 'a', sku: 'A', parentId: '1', url: 'u' }, { rowId: '2', path: 'b', sku: 'B', parentId: '2', url: 'u', undone: true }] }
        saveBatchLog(log, st)
        const back = loadBatchLogs(st)
        expect(back).toHaveLength(1)
        expect(pendingUndo(back[0]).map((i) => i.rowId)).toEqual(['1'])
    })
})

describe('collectBulkFiles', () => {
    it('lee imágenes de un ZIP y descarta lo demás', async () => {
        const zip = zipSync({ 'fotos/A.jpg': new Uint8Array([1, 2, 3]), 'fotos/leeme.txt': new Uint8Array([1]), '__MACOSX/fotos/._A.jpg': new Uint8Array([1]) })
        const f = new File([zip as BlobPart], 'lote.zip', { type: 'application/zip' })
        const { files, skipped } = await collectBulkFiles([f])
        expect(files.map((x) => x.path)).toEqual(['fotos/A.jpg'])
        expect(files[0].file.name).toBe('A.jpg')
        expect(skipped).toBe(2)
    })
})
