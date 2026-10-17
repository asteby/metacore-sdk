import type { CSSProperties } from 'react'
import type { Image as ImageData, Product, ProductVariant } from '@asteby/storefront'
import { resolveMockupKind, type MockupKind, type MockupProduct, type MockupVariant } from '@asteby/storefront/mockup'
import { Image, type ImageProps } from '../components.js'
import type { MockupFrameProps } from './frame.js'
import type { MockupLabels } from './labels.js'
import { useMockupConfig, type MockupRegistry, type ResolveMockupKind } from './registry.js'

type SvgPassThrough = Omit<MockupFrameProps, 'label' | 'kind' | 'children'>

export type ProductMockupProps<D = unknown> = SvgPassThrough & {
  kind: MockupKind
  data: D
  /** Accessible name override (still prefixed with `labels.illustration`). */
  label?: string
  labels?: Partial<MockupLabels>
  registry?: MockupRegistry
}

/**
 * Draws the mockup registered for `kind` with already extracted `data`
 * (e.g. from `mockupDataFromProduct`). Unknown kinds fall back to `generic`;
 * returns `null` when the registry has neither.
 */
export function ProductMockup<D>({ kind, data, label, labels: labelOverrides, registry: registryProp, ...svg }: ProductMockupProps<D>) {
  const config = useMockupConfig()
  const registry = registryProp ?? config.registry
  const renderer = registry.get(kind) ?? registry.get('generic')
  if (!renderer) return null
  const labels = labelOverrides ? { ...config.labels, ...labelOverrides } : config.labels
  const name = label ? `${labels.illustration}: ${label}` : renderer.describe(data, labels)
  const Component = renderer.component
  return <Component data={data} label={name} labels={labels} {...svg} />
}

/** Product fields `ProductImage` reads: the mockup fields plus the images. */
export type ProductImageProduct = MockupProduct & Partial<Pick<Product, 'featured_image' | 'images'>>

export type ProductImageProps = Omit<ImageProps, 'data'> & {
  product: ProductImageProduct
  /** Selected variant: its image wins; its options (flavor, presentation) feed the mockup. */
  variant?: (MockupVariant & Partial<Pick<ProductVariant, 'image'>>) | null
  /** Explicit image (e.g. a gallery slide). `null` forces the mockup. */
  image?: ImageData | null
  /** Forces a mockup kind (skips resolution). */
  kind?: MockupKind
  resolveKind?: ResolveMockupKind
  registry?: MockupRegistry
  labels?: Partial<MockupLabels>
}

/**
 * The product's image from OPS (responsive `Image`: `alt`, intrinsic size,
 * `priority` for LCP) or, when it has none, the mockup for its kind. Kind:
 * `kind` prop → `resolveKind` (prop, then `MockupProvider`) → `resolveMockupKind`.
 *
 * The mockup's accessible name always says it is an illustration; `alt=""`
 * makes it decorative (`aria-hidden`), like an empty `alt` on an image.
 */
export function ProductImage({
  product,
  variant,
  image,
  kind: kindProp,
  resolveKind: resolveProp,
  registry: registryProp,
  labels: labelOverrides,
  alt,
  className,
  style,
  id,
  ...imageProps
}: ProductImageProps) {
  const config = useMockupConfig()
  const img = image !== undefined ? image : (variant?.image ?? product.featured_image ?? product.images?.[0] ?? null)
  if (img?.url) {
    return <Image data={img} alt={alt ?? img.alt ?? product.title} className={className} style={style} id={id} {...imageProps} />
  }

  const registry = registryProp ?? config.registry
  let kind = kindProp
  if (!kind) {
    const guess = resolveMockupKind(product, { kinds: registry.kinds() })
    kind = (resolveProp ?? config.resolveKind)?.(product, guess) ?? guess
  }
  const renderer = registry.get(kind) ?? registry.get('generic')
  if (!renderer) return null
  const labels = labelOverrides ? { ...config.labels, ...labelOverrides } : config.labels
  const data = renderer.fromProduct(product, variant)
  const decorative = alt === ''
  const label = alt ? `${labels.illustration}: ${alt}` : renderer.describe(data, labels)
  const Component = renderer.component
  return (
    <Component
      data={data}
      label={label}
      labels={labels}
      decorative={decorative}
      className={className}
      style={style as CSSProperties | undefined}
      id={id}
      data-mockup-fallback=""
    />
  )
}
