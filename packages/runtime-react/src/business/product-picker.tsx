// ProductPicker — una sola búsqueda para productos, llantas y variantes
// (medida «205/55R16», SKU, código de barras, clave de proveedor). Benchmark §7.
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Badge, Input } from '@asteby/metacore-ui'
import { useFormatter } from './format'
import { useAsyncSearch } from './use-async-search'
import {
    availableStock,
    parseProductQuery,
    type ProductQuery,
    type ProductResult,
    type ProductVariant,
} from './product-search'
import { EmptyState } from './feedback'

export interface ProductPickerProps {
    /**
     * Búsqueda: recibe la consulta ya clasificada (`barcode` | `tire_size` |
     * `text`) para que el backend elija el índice. Debe ser estable (useCallback).
     */
    search: (query: Exclude<ProductQuery, { kind: 'empty' }>, signal: AbortSignal) => Promise<ProductResult[]>
    /** Se emite al elegir un producto o una variante concreta. */
    onSelect: (product: ProductResult, variant?: ProductVariant) => void
    /** Almacén para mostrar/validar existencias; sin él, se suma el total. */
    warehouseId?: string
    /** Un código de barras con un único resultado se selecciona solo al pulsar Enter. Default true. */
    autoSelectBarcode?: boolean
    /** Permite elegir productos sin existencia (se marcan). Default true. */
    allowOutOfStock?: boolean
    placeholder?: string
    autoFocus?: boolean
    currency?: string
    disabled?: boolean
}

export function ProductPicker({
    search,
    onSelect,
    warehouseId,
    autoSelectBarcode = true,
    allowOutOfStock = true,
    placeholder,
    autoFocus,
    currency,
    disabled,
}: ProductPickerProps) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const [text, setText] = useState('')
    const parsed = parseProductQuery(text)
    // Un código de barras es exacto: no se espera a 2 caracteres ni se debouncea mucho.
    const run = useCallback(
        (q: string, signal: AbortSignal) => {
            const p = parseProductQuery(q)
            return p.kind === 'empty' ? Promise.resolve([]) : search(p, signal)
        },
        [search],
    )
    const { results, loading, error } = useAsyncSearch(text, run, {
        minChars: parsed.kind === 'barcode' ? 8 : 2,
        delay: parsed.kind === 'barcode' ? 0 : 250,
    })

    const pick = (p: ProductResult, v?: ProductVariant) => {
        const stock = availableStock(v ?? p, warehouseId)
        if (!allowOutOfStock && stock != null && stock <= 0) return
        onSelect(p, v)
        setText('')
    }

    return (
        <div data-slot="product-picker" className="space-y-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                <Input
                    autoFocus={autoFocus}
                    disabled={disabled}
                    className="pl-8"
                    value={text}
                    placeholder={placeholder ?? t('productPicker.placeholder', { defaultValue: 'Producto, medida (205/55R16), SKU o código de barras' })}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && autoSelectBarcode && parsed.kind === 'barcode' && results.length === 1) {
                            e.preventDefault()
                            const only = results[0]!
                            const exact = only.variants?.find((v) => v.barcode === parsed.barcode)
                            pick(only, exact)
                        }
                    }}
                />
            </div>

            {parsed.kind === 'tire_size' && (
                <p className="text-xs text-muted-foreground">
                    {t('productPicker.tireSize', { defaultValue: 'Medida de llanta' })}: {parsed.tire.normalized}
                </p>
            )}
            {loading && <p className="text-sm text-muted-foreground">{t('common.searching', { defaultValue: 'Buscando…' })}</p>}
            {error && !loading && (
                <p role="alert" className="text-sm text-destructive">
                    {t('productPicker.error', { defaultValue: 'No se pudo buscar. Revisa tu conexión e inténtalo de nuevo.' })}
                </p>
            )}
            {!loading && !error && parsed.kind !== 'empty' && text.trim().length >= 2 && results.length === 0 && (
                <EmptyState
                    title={t('productPicker.empty', { defaultValue: 'No encontramos ese producto' })}
                    description={t('productPicker.emptyHint', { defaultValue: 'Prueba con otra medida, SKU o código de barras.' })}
                />
            )}

            {results.length > 0 && (
                <ul role="listbox" className="max-h-72 divide-y overflow-auto rounded-md border">
                    {results.map((p) => {
                        const stock = availableStock(p, warehouseId)
                        const hasVariants = (p.variants?.length ?? 0) > 0
                        return (
                            <li key={p.id} role="option" aria-selected={false} className="px-2 py-1.5">
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between gap-2 text-left disabled:opacity-50"
                                    disabled={hasVariants || (!allowOutOfStock && stock != null && stock <= 0)}
                                    onClick={() => pick(p)}
                                >
                                    <span>
                                        <span className="block text-sm font-medium">{p.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {[p.sku, p.tire?.normalized, p.supplier_sku && `Prov. ${p.supplier_sku}`].filter(Boolean).join(' · ')}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {stock != null && (
                                            <Badge variant={stock > 0 ? 'success' : 'danger'}>
                                                {stock > 0 ? t('productPicker.inStock', { defaultValue: '{{n}} disp.', n: stock }) : t('productPicker.outOfStock', { defaultValue: 'Sin existencia' })}
                                            </Badge>
                                        )}
                                        {p.price != null && !hasVariants && <span className="text-sm tabular-nums">{fmt.money(p.price)}</span>}
                                    </span>
                                </button>
                                {hasVariants && (
                                    <ul className="mt-1 space-y-0.5 pl-3">
                                        {p.variants!.map((v) => {
                                            const vs = availableStock(v, warehouseId)
                                            return (
                                                <li key={v.id}>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                                                        disabled={!allowOutOfStock && vs != null && vs <= 0}
                                                        onClick={() => pick(p, v)}
                                                    >
                                                        <span>{v.label}</span>
                                                        <span className="flex items-center gap-2">
                                                            {vs != null && <Badge variant={vs > 0 ? 'success' : 'danger'}>{vs}</Badge>}
                                                            {(v.price ?? p.price) != null && <span className="tabular-nums">{fmt.money(v.price ?? p.price)}</span>}
                                                        </span>
                                                    </button>
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
