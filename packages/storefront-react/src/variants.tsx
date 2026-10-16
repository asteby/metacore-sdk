import { Fragment, useCallback, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import type { CartLineMerchandise, Product, ProductVariant } from '@asteby/storefront'
import { useCart } from './cart.js'

export type ProductOptionValueState = {
  value: string
  /** Part of the current selection. */
  selected: boolean
  /** A variant with this value (and the other selected options) exists. */
  exists: boolean
  /** That variant is available for sale. */
  available: boolean
  /** The variant this value would select, if it exists. */
  variant: ProductVariant | null
  /** Query string (`?Talla=M&Color=Rojo`) selecting this value, preserving other params. */
  search: string
}

export type ProductOptionState = { name: string; values: ProductOptionValueState[] }

export type ProductOptionsState = {
  options: ProductOptionState[]
  selectedOptions: Record<string, string>
  /** Variant matching every selected option, or `null` while incomplete. */
  selectedVariant: ProductVariant | null
  setOption: (name: string, value: string) => void
}

export type UseProductOptionsConfig = {
  /** Current URL search params; option names are read as keys (`?Talla=M`), plus `variant=<id>`. */
  searchParams?: URLSearchParams | string | null
  /** Select the first available variant when nothing is in the URL (default true). */
  defaultToFirstAvailable?: boolean
  onChange?: (variant: ProductVariant | null, selectedOptions: Record<string, string>) => void
}

type ProductLike = Pick<Product, 'options' | 'variants'> & { id?: string }

function toParams(input: URLSearchParams | string | null | undefined): URLSearchParams {
  if (!input) return new URLSearchParams()
  return input instanceof URLSearchParams ? new URLSearchParams(input) : new URLSearchParams(input)
}

function optionsOf(variant: ProductVariant): Record<string, string> {
  return Object.fromEntries(variant.selected_options.map((o) => [o.name, o.value]))
}

function findVariant(product: ProductLike, selection: Record<string, string>): ProductVariant | null {
  if (product.options.length === 0) return product.variants[0] ?? null
  return (
    product.variants.find((v) => v.selected_options.length > 0 && v.selected_options.every((o) => selection[o.name] === o.value)) ?? null
  )
}

function initialSelection(product: ProductLike, params: URLSearchParams, defaultToFirstAvailable: boolean): Record<string, string> {
  const byId = params.get('variant')
  const fromId = byId ? product.variants.find((v) => v.id === byId) : undefined
  if (fromId) return optionsOf(fromId)
  const selection: Record<string, string> = {}
  for (const opt of product.options) {
    const v = params.get(opt.name)
    if (v !== null && opt.values.includes(v)) selection[opt.name] = v
  }
  if (Object.keys(selection).length === 0 && defaultToFirstAvailable) {
    const first = product.variants.find((v) => v.available_for_sale) ?? product.variants[0]
    return first ? optionsOf(first) : {}
  }
  return selection
}

/**
 * Option → values matrix with availability, the selected variant (from the
 * URL or local state) and links for each value. Pure React: works in SSR.
 */
export function useProductOptions(product: ProductLike, config: UseProductOptionsConfig = {}): ProductOptionsState {
  const { defaultToFirstAvailable = true, onChange } = config
  const params = useMemo(() => toParams(config.searchParams), [String(config.searchParams ?? '')])
  const sourceKey = `${product.id ?? ''}|${params.toString()}`
  const fromSource = useMemo(
    () => initialSelection(product, params, defaultToFirstAvailable),
    // product identity is keyed by id + params
    [sourceKey, defaultToFirstAvailable],
  )

  // Local selection overrides the URL until the URL (or product) changes.
  const [local, setLocal] = useState<{ key: string; selection: Record<string, string> } | null>(null)
  const selectedOptions = local && local.key === sourceKey ? local.selection : fromSource

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setOption = useCallback(
    (name: string, value: string) => {
      const next = { ...selectedOptions, [name]: value }
      setLocal({ key: sourceKey, selection: next })
      onChangeRef.current?.(findVariant(product, next), next)
    },
    [selectedOptions, sourceKey, product],
  )

  const selectedVariant = useMemo(() => findVariant(product, selectedOptions), [product, selectedOptions])

  const options = useMemo<ProductOptionState[]>(
    () =>
      product.options.map((opt) => ({
        name: opt.name,
        values: opt.values.map((value) => {
          const candidate = { ...selectedOptions, [opt.name]: value }
          const exact = findVariant(product, candidate)
          // When other options are not chosen yet, availability = any available variant with this value.
          const loose = product.variants.filter((v) => v.selected_options.some((o) => o.name === opt.name && o.value === value))
          const search = new URLSearchParams(params)
          search.delete('variant')
          for (const [k, v] of Object.entries(candidate)) search.set(k, v)
          return {
            value,
            selected: selectedOptions[opt.name] === value,
            exists: exact ? true : loose.length > 0 && Object.keys(selectedOptions).length < product.options.length,
            available: exact ? exact.available_for_sale : Object.keys(selectedOptions).length < product.options.length && loose.some((v) => v.available_for_sale),
            variant: exact,
            search: `?${search.toString()}`,
          }
        }),
      })),
    [product, selectedOptions, params],
  )

  return { options, selectedOptions, selectedVariant, setOption }
}

export type VariantSelectorRenderProps = {
  option: ProductOptionState
  selectedVariant: ProductVariant | null
  selectedOptions: Record<string, string>
  setOption: (name: string, value: string) => void
}

export type VariantSelectorProps = UseProductOptionsConfig & {
  product: ProductLike
  /** Called once per option; render the buttons/links for `option.values`. */
  children: (props: VariantSelectorRenderProps) => ReactNode
}

/**
 * Render-prop variant picker. Example:
 *
 *   <VariantSelector product={product} searchParams={searchParams}>
 *     {({ option }) => (
 *       <fieldset>
 *         <legend>{option.name}</legend>
 *         {option.values.map((v) => (
 *           <Link key={v.value} to={v.search} replace preventScrollReset aria-current={v.selected}
 *                 aria-disabled={!v.available}>{v.value}</Link>
 *         ))}
 *       </fieldset>
 *     )}
 *   </VariantSelector>
 */
export function VariantSelector({ product, children, ...config }: VariantSelectorProps) {
  const state = useProductOptions(product, config)
  return (
    <>
      {state.options.map((option) => (
        <Fragment key={option.name}>
          {children({ option, selectedVariant: state.selectedVariant, selectedOptions: state.selectedOptions, setOption: state.setOption })}
        </Fragment>
      ))}
    </>
  )
}

/** Builds the optimistic cart-line merchandise for a product variant. */
export function toMerchandise(product: Pick<Product, 'handle' | 'title' | 'featured_image'>, variant: ProductVariant): CartLineMerchandise {
  return { ...variant, product: { handle: product.handle, title: product.title, featured_image: product.featured_image } }
}

export type AddToCartButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'onClick'> & {
  variantId: string | null | undefined
  quantity?: number
  /** Variant data for an instant optimistic cart line. */
  merchandise?: CartLineMerchandise
  onAdded?: () => void
  onClick?: ComponentPropsWithoutRef<'button'>['onClick']
}

/** Adds a variant to the cart via `useCart().addLines`. Disabled without a variant or while adding. */
export function AddToCartButton({
  variantId,
  quantity = 1,
  merchandise,
  onAdded,
  onClick,
  disabled,
  children = 'Agregar al carrito',
  type = 'button',
  ...rest
}: AddToCartButtonProps) {
  const cart = useCart()
  const [adding, setAdding] = useState(false)
  return (
    <button
      type={type}
      disabled={disabled || !variantId || adding}
      aria-busy={adding || undefined}
      data-adding={adding || undefined}
      onClick={async (event) => {
        onClick?.(event)
        if (event.defaultPrevented || !variantId) return
        setAdding(true)
        try {
          const result = await cart.addLines([{ variant_id: variantId, quantity, ...(merchandise ? { merchandise } : {}) }])
          if (result) onAdded?.()
        } finally {
          setAdding(false)
        }
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
