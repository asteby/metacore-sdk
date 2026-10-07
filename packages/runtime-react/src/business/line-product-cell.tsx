// LineProductCell — buscador de producto DENTRO de la celda «Descripción» de un
// renglón (patrón de editor de facturas pro: Odoo/Holded/Linear). Ocupa solo su
// celda; la lista de resultados va en un portal (Popover de Radix anclado al
// input): nunca la recorta el overflow de la tabla ni del modal, queda por
// encima del diálogo y se abre hacia arriba si abajo no hay espacio.
//
// Teclado: ↑/↓ recorren, Enter elige (el grid pasa el foco a «Cant.»), Esc
// cierra, Tab cierra y avanza normal. El texto escrito sin elegir queda como
// descripción libre (el renglón libre sigue funcionando igual).
import { forwardRef, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search } from 'lucide-react'
import { Badge, Input, Popover, PopoverAnchor, PopoverContent } from '@asteby/metacore-ui/primitives'
import { useFormatter } from './format'
import { useAsyncSearch } from './use-async-search'
import { useDebouncedValue } from '../use-debounced-value'
import { availableStock, parseProductQuery, type ProductQuery, type ProductResult, type ProductVariant } from './product-search'

export type LineProductSearch = (query: Exclude<ProductQuery, { kind: 'empty' }>, signal: AbortSignal) => Promise<ProductResult[]>

export interface LineProductHit {
    product: ProductResult
    variant?: ProductVariant
}

export interface LineProductCellProps {
    search: LineProductSearch
    /** Texto de la celda (la descripción del renglón, o el borrador del renglón vacío). */
    text: string
    onTextChange: (text: string) => void
    onPick: (product: ProductResult, variant?: ProductVariant) => void
    /**
     * Teclas que el buscador no consume (lista cerrada): el grid aplica sus
     * comandos (Enter agrega, Supr en celda vacía borra…).
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
}

export const LineProductCell = forwardRef<HTMLInputElement, LineProductCellProps>(function LineProductCell(
    { search, text, onTextChange, onPick, onKeyDownClosed, warehouseId, currency, placeholder, ariaLabel, disabled, invalid, className, dataCell },
    ref,
) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const listId = useId()
    const anchorRef = useRef<HTMLDivElement>(null)
    // Solo se abre mientras se escribe: enfocar un renglón libre ya capturado no
    // despliega «sin resultados» encima de la tabla.
    const [typing, setTyping] = useState(false)
    const [active, setActive] = useState(0)
    const parsed = parseProductQuery(text)
    const run = useMemo(
        () => (q: string, signal: AbortSignal) => {
            const p = parseProductQuery(q)
            return p.kind === 'empty' ? Promise.resolve([]) : search(p, signal)
        },
        [search],
    )
    const minChars = parsed.kind === 'barcode' ? 8 : 2
    const delay = parsed.kind === 'barcode' ? 0 : 250
    const { results, loading: fetching } = useAsyncSearch(typing ? text : '', run, { minChars, delay })
    // Mientras el debounce no alcanza lo escrito, la lista dice «Buscando…» y no
    // un «sin coincidencias» prematuro.
    const settled = useDebouncedValue(text.trim(), delay) === text.trim()
    const loading = fetching || !settled
    const flat = useMemo<LineProductHit[]>(
        () =>
            results.flatMap((p) =>
                (p.variants?.length ?? 0) > 0 ? p.variants!.map((v) => ({ product: p, variant: v })) : [{ product: p }],
            ),
        [results],
    )
    const queryReady = typing && text.trim().length >= minChars
    const open = queryReady && (loading || flat.length > 0 || text.trim().length >= 2)
    const hasHits = flat.length > 0

    const close = () => {
        setTyping(false)
        setActive(0)
    }
    const choose = (idx: number) => {
        const hit = flat[idx]
        if (!hit) return
        close()
        onPick(hit.product, hit.variant)
    }

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (open && hasHits) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((n) => Math.min(flat.length - 1, n + 1))
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((n) => Math.max(0, n - 1))
                return
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                choose(active)
                return
            }
        }
        if (open && e.key === 'Escape') {
            // Cierra la lista sin cerrar el diálogo que la contiene.
            e.preventDefault()
            e.stopPropagation()
            close()
            return
        }
        if (e.key === 'Tab') close()
        onKeyDownClosed?.(e)
    }

    return (
        <Popover open={open} onOpenChange={(o) => !o && close()}>
            <PopoverAnchor asChild>
                <div ref={anchorRef} className="relative w-full min-w-0" data-slot="line-product-cell">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        ref={ref}
                        value={text}
                        disabled={disabled}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={open}
                        aria-controls={open ? listId : undefined}
                        aria-activedescendant={open && hasHits ? `${listId}-${active}` : undefined}
                        aria-label={ariaLabel}
                        aria-invalid={invalid || undefined}
                        autoComplete="off"
                        data-cell={dataCell}
                        placeholder={placeholder ?? t('lineItems.searchPlaceholder', { defaultValue: 'Producto, medida (205/55R16), SKU o código de barras' })}
                        className={'h-8 pl-8 ' + (className ?? '')}
                        onChange={(e) => {
                            onTextChange(e.target.value)
                            setTyping(true)
                            setActive(0)
                        }}
                        onBlur={() => close()}
                        onKeyDown={onKeyDown}
                    />
                </div>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className="p-1"
                data-slot="line-product-results"
                // El foco se queda en la celda: se sigue escribiendo mientras se ve la lista.
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                    if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
                }}
                style={{ width: 'max(var(--radix-popover-trigger-width), 22rem)', maxWidth: 'calc(100vw - 1rem)' }}
            >
                {hasHits ? (
                    <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-auto">
                        {flat.map((hit, idx) => {
                            const price = hit.variant?.price ?? hit.product.price
                            const stock = availableStock(hit.variant ?? hit.product, warehouseId)
                            const meta = [hit.variant?.sku ?? hit.product.sku, hit.product.tire?.normalized].filter(Boolean).join(' · ')
                            return (
                                <li key={`${hit.product.id}:${hit.variant?.id ?? ''}`} id={`${listId}-${idx}`} role="option" aria-selected={idx === active}>
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        className={
                                            'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground ' +
                                            (idx === active ? 'bg-accent text-accent-foreground' : '')
                                        }
                                        onMouseDown={(e) => e.preventDefault()}
                                        onMouseEnter={() => setActive(idx)}
                                        onClick={() => choose(idx)}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium">{hit.variant ? `${hit.product.name} · ${hit.variant.label}` : hit.product.name}</span>
                                            {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            {stock != null && (
                                                <Badge variant="secondary" className="font-normal tabular-nums">
                                                    {stock}
                                                </Badge>
                                            )}
                                            {price != null && <span className="tabular-nums">{fmt.money(price)}</span>}
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                ) : loading ? (
                    <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        {t('common.searching', { defaultValue: 'Buscando…' })}
                    </p>
                ) : (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                        {t('lineItems.noProduct', { defaultValue: 'Sin coincidencias. Se usará como descripción libre.' })}
                    </p>
                )}
            </PopoverContent>
        </Popover>
    )
})
