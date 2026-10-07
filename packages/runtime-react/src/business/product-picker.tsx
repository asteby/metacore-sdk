// ProductPicker — una sola búsqueda para productos, llantas y variantes
// (medida «205/55R16», SKU, código de barras, clave de proveedor). Benchmark §7.
// Configuración del <RecordPicker> compartido (mismas filas que la celda de
// producto del DocumentEditor, ver product-options.tsx).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RecordPicker } from '../record-picker'
import { ProductHitRow, productHitKey, productHitLabel, useProductSearch, type ProductHit } from './product-options'
import { availableStock, type ProductQuery, type ProductResult, type ProductVariant } from './product-search'

export interface ProductPickerProps {
    /**
     * Búsqueda: recibe la consulta ya clasificada (`barcode` | `tire_size` |
     * `text`) para que el backend elija el índice.
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

/**
 * @deprecated Configuración fina de {@link RecordPicker}; para pantallas nuevas
 * usa RecordPicker con `useProductSearch` / `ProductHitRow`.
 */
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
    const [text, setText] = useState('')
    const [open, setOpen] = useState(false)
    const { parsed, results, hits, loading, error, minChars } = useProductSearch(text, search)

    const outOfStock = (h: ProductHit) => {
        const stock = availableStock(h.variant ?? h.product, warehouseId)
        return !allowOutOfStock && stock != null && stock <= 0
    }
    const pick = (p: ProductResult, v?: ProductVariant) => {
        if (outOfStock({ product: p, variant: v })) return
        onSelect(p, v)
        setText('')
    }

    return (
        <RecordPicker<ProductHit>
            trigger="input"
            slot="product-picker"
            items={hits}
            loading={loading}
            error={error}
            minChars={minChars}
            query={text}
            onQueryChange={setText}
            open={open}
            onOpenChange={setOpen}
            getKey={productHitKey}
            getLabel={productHitLabel}
            renderItem={(hit) => <ProductHitRow hit={hit} warehouseId={warehouseId} currency={currency} />}
            isItemDisabled={outOfStock}
            onSelect={(hit) => pick(hit.product, hit.variant)}
            onInputKeyDown={(e) => {
                // Código de barras exacto con un único resultado: Enter lo elige.
                if (e.key === 'Enter' && autoSelectBarcode && parsed.kind === 'barcode' && results.length === 1) {
                    e.preventDefault()
                    const only = results[0]!
                    pick(only, only.variants?.find((v) => v.barcode === parsed.barcode))
                    setOpen(false)
                }
            }}
            disabled={disabled}
            triggerProps={{ autoFocus }}
            minListWidth="22rem"
            placeholder={placeholder ?? t('productPicker.placeholder', { defaultValue: 'Producto, medida (205/55R16), SKU o código de barras' })}
            loadingText={t('common.searching', { defaultValue: 'Buscando…' })}
            errorText={t('productPicker.error', { defaultValue: 'No se pudo buscar. Revisa tu conexión e inténtalo de nuevo.' })}
            emptyText={
                <span className="block space-y-0.5">
                    <span className="block font-medium text-foreground">{t('productPicker.empty', { defaultValue: 'No encontramos ese producto' })}</span>
                    <span className="block text-xs">{t('productPicker.emptyHint', { defaultValue: 'Prueba con otra medida, SKU o código de barras.' })}</span>
                </span>
            }
            below={
                parsed.kind === 'tire_size' ? (
                    <p className="text-xs text-muted-foreground">
                        {t('productPicker.tireSize', { defaultValue: 'Medida de llanta' })}: {parsed.tire.normalized}
                    </p>
                ) : null
            }
        />
    )
}
