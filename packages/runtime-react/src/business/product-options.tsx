// Product options for <RecordPicker>: one search (products, tires, variants)
// and one option row (name · variant, SKU / tire size / supplier code, stock and
// price on the right) shared by ProductPicker and the DocumentEditor's
// LineProductCell — so both product pickers are configurations of the same
// primitive instead of two hand-rolled lists.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@asteby/metacore-ui/primitives'
import { useLatestSearch, useRecordSearch } from '../record-picker'
import { useFormatter } from './format'
import { OptionDisplayRow } from '../option-display'
import {
    availableStock,
    parseProductQuery,
    type ProductQuery,
    type ProductResult,
    type ProductVariant,
} from './product-search'

/** A pickable row: a product, or one concrete variant of it. */
export interface ProductHit {
    product: ProductResult
    variant?: ProductVariant
}

export type ProductSearchFn = (
    query: Exclude<ProductQuery, { kind: 'empty' }>,
    signal: AbortSignal,
) => Promise<ProductResult[]>

/** Products with variants expand to one row per variant. */
export function flattenProductHits(results: readonly ProductResult[]): ProductHit[] {
    return results.flatMap((p) =>
        (p.variants?.length ?? 0) > 0 ? p.variants!.map((v) => ({ product: p, variant: v })) : [{ product: p }],
    )
}

export const productHitKey = (h: ProductHit): string => `${h.product.id}:${h.variant?.id ?? ''}`
export const productHitLabel = (h: ProductHit): string =>
    h.variant ? `${h.product.name} · ${h.variant.label}` : h.product.name
export const productHitMeta = (h: ProductHit): string =>
    [
        h.variant?.sku ?? h.product.sku,
        h.product.tire?.normalized,
        h.product.supplier_sku && `Prov. ${h.product.supplier_sku}`,
    ]
        .filter(Boolean)
        .join(' · ')

/**
 * Classified product search: a barcode is exact (8+ digits, no debounce), the
 * rest waits for 2 characters and 250ms. `search` needn't be memoized.
 */
export function useProductSearch(text: string, search: ProductSearchFn, enabled = true) {
    const stable = useLatestSearch(search)
    const parsed = parseProductQuery(text)
    const run = useMemo(
        () => (q: string, signal: AbortSignal) => {
            const p = parseProductQuery(q)
            return p.kind === 'empty' ? Promise.resolve([] as ProductResult[]) : stable(p, signal)
        },
        [stable],
    )
    const minChars = parsed.kind === 'barcode' ? 8 : 2
    const delay = parsed.kind === 'barcode' ? 0 : 250
    const { results, loading, error, pending } = useRecordSearch(text, run, { minChars, delay, enabled })
    const hits = useMemo(() => flattenProductHits(results), [results])
    return { parsed, results, hits, loading: loading || pending, error, minChars }
}

/** Stock + price at the right of a product row. `compact` → bare stock count (table cell). */
export function ProductHitTrailing({
    hit,
    warehouseId,
    currency,
    compact = false,
}: {
    hit: ProductHit
    warehouseId?: string
    currency?: string
    compact?: boolean
}) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const price = hit.variant?.price ?? hit.product.price
    const stock = availableStock(hit.variant ?? hit.product, warehouseId)
    return (
        <>
            {stock != null &&
                (compact ? (
                    <Badge variant="secondary" className="font-normal tabular-nums">
                        {stock}
                    </Badge>
                ) : (
                    <Badge variant={stock > 0 ? 'success' : 'danger'}>
                        {stock > 0
                            ? t('productPicker.inStock', { defaultValue: '{{n}} disp.', n: stock })
                            : t('productPicker.outOfStock', { defaultValue: 'Sin existencia' })}
                    </Badge>
                ))}
            {price != null && <span className="tabular-nums">{fmt.money(price)}</span>}
        </>
    )
}

/**
 * Option body: bold name (· variant), muted meta line, stock/price right. A
 * product whose catalog declares an `option_display` (the server resolved it,
 * see `withOptionDisplays`) paints that row instead: avatar, two-line title,
 * subtitle and toned metrics (price + stock contributed by inventory).
 */
export function ProductHitRow({ hit, warehouseId, currency, compact }: { hit: ProductHit; warehouseId?: string; currency?: string; compact?: boolean }) {
    if (hit.product.display && !hit.variant) {
        return <OptionDisplayRow display={hit.product.display} label={productHitLabel(hit)} currency={currency} />
    }
    const meta = productHitMeta(hit)
    return (
        <span className="flex w-full min-w-0 items-center justify-between gap-3">
            <span className="min-w-0">
                <span className="line-clamp-2 break-words font-medium" title={productHitLabel(hit)}>{productHitLabel(hit)}</span>
                {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
                <ProductHitTrailing hit={hit} warehouseId={warehouseId} currency={currency} compact={compact} />
            </span>
        </span>
    )
}
