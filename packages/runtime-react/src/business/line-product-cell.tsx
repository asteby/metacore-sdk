// LineProductCell — buscador de producto DENTRO de la celda «Descripción» de un
// renglón (patrón de editor de facturas pro: Odoo/Holded/Linear). Es una
// configuración del <RecordPicker> compartido (trigger «input», texto libre,
// variante celda): ocupa solo su celda y la lista va en un portal — nunca la
// recorta el overflow de la tabla ni del modal, queda por encima del diálogo y
// se abre hacia arriba si abajo no hay espacio.
//
// Teclado: ↑/↓ recorren, Enter elige (el grid pasa el foco a «Cant.»), Esc
// cierra, Tab cierra y avanza normal. El texto escrito sin elegir queda como
// descripción libre (el renglón libre sigue funcionando igual).
//
// Con `onCreate`, la celda ofrece crear el producto como las apps top: «+» unido
// al buscador y «Crear producto «texto»» al pie de la lista, prellenado con lo
// buscado. El grid llena el renglón con el producto nuevo al guardarlo.
import { forwardRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { RecordPicker } from '../record-picker'
import {
    ProductHitRow,
    productHitKey,
    productHitLabel,
    useProductSearch,
    type ProductHit,
    type ProductSearchFn,
} from './product-options'
import type { ProductResult, ProductVariant } from './product-search'

export type LineProductSearch = ProductSearchFn

/** @deprecated Alias de {@link ProductHit}. */
export type LineProductHit = ProductHit

export interface LineProductCellProps {
    search: LineProductSearch
    /** Texto de la celda (la descripción del renglón, o el borrador del renglón vacío). */
    text: string
    onTextChange: (text: string) => void
    onPick: (product: ProductResult, variant?: ProductVariant) => void
    /**
     * Teclas que el buscador no consume (lista cerrada, Enter sin
     * coincidencias…): el grid aplica sus comandos (Enter agrega, Supr en
     * celda vacía borra…).
     */
    onKeyDownClosed?: (e: KeyboardEvent<HTMLInputElement>) => void
    warehouseId?: string
    currency?: string
    placeholder?: string
    ariaLabel: string
    disabled?: boolean
    invalid?: boolean
    className?: string
    /** Atributos de datos para que el grid ubique la celda (foco por teclado). */
    dataCell?: string
    /** Alta del producto desde la celda, prellenada con lo buscado. */
    onCreate?: (query: string) => void
    /** Nombre del modelo para «Crear …» (default «producto»). */
    entityLabel?: string
    /** Detalle de qué se puede buscar: tooltip del buscador y estado sin coincidencias. */
    hint?: string
}

export const LineProductCell = forwardRef<HTMLInputElement, LineProductCellProps>(function LineProductCell(
    { search, text, onTextChange, onPick, onKeyDownClosed, warehouseId, currency, placeholder, ariaLabel, disabled, invalid, className, dataCell, onCreate, entityLabel, hint },
    ref,
) {
    const { t } = useTranslation()
    // Solo se busca/abre mientras se escribe: enfocar un renglón libre ya
    // capturado no despliega «sin resultados» encima de la tabla.
    const [typing, setTyping] = useState(false)
    const { hits, loading, minChars } = useProductSearch(typing ? text : '', search, typing)
    const entity = entityLabel ?? t('lineItems.productEntity', { defaultValue: 'producto' })
    const searchHint = hint ?? t('lineItems.searchHint', { defaultValue: 'Busca por nombre, SKU o código de barras' })

    return (
        <RecordPicker<ProductHit>
            trigger="input"
            variant="cell"
            freeText
            anchorSlot="line-product-cell"
            contentSlot="line-product-results"
            minListWidth="26.25rem"
            maxListWidth="35rem"
            items={hits}
            loading={loading}
            minChars={minChars}
            query={text}
            onQueryChange={onTextChange}
            open={typing}
            onOpenChange={setTyping}
            getKey={productHitKey}
            getLabel={productHitLabel}
            renderItem={(hit) => <ProductHitRow hit={hit} warehouseId={warehouseId} currency={currency} compact />}
            onSelect={(hit) => onPick(hit.product, hit.variant)}
            onUnhandledKeyDown={onKeyDownClosed}
            inputRef={ref}
            ariaLabel={ariaLabel}
            listLabel={ariaLabel}
            disabled={disabled}
            invalid={invalid}
            triggerClassName={className}
            triggerProps={{ 'data-cell': dataCell }}
            placeholder={placeholder ?? t('lineItems.searchPlaceholderShort', { defaultValue: 'Buscar producto…' })}
            loadingText={t('common.searching', { defaultValue: 'Buscando…' })}
            emptyText={
                <span className="block space-y-1">
                    <span className="block">{t('lineItems.noProduct', { defaultValue: 'Sin coincidencias. Se usará como descripción libre.' })}</span>
                    <span className="block text-xs">{searchHint}</span>
                </span>
            }
            onCreate={onCreate}
            entityLabel={entity}
            createLabel={t('lineItems.createProduct', { defaultValue: 'Crear {{entity}}', entity })}
            createFooterLabel={(q) => (
                <>
                    {t('lineItems.createProduct', { defaultValue: 'Crear {{entity}}', entity })}
                    {q ? <span className="text-muted-foreground"> «{q}»</span> : null}
                </>
            )}
        />
    )
})
