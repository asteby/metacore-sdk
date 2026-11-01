import type { Image, Product, ProductVariant } from '@asteby/storefront'

/**
 * One image of the gallery: the contract `Image` plus two optional hints a store (or a future contract) can carry.
 * `variant_id` ties the image to a variant (`product_images.variant_id` in OPS); `low_res` forces the "small photo"
 * treatment when the size is unknown.
 */
export type GalleryImage = Image & { variant_id?: string | null; low_res?: boolean | null }

/** Longest side, in px, of a "low resolution" photo: it is shown at its real size, centered, never stretched. */
export const LOW_RES_MAX = 300

/**
 * Whether a photo is small: `low_res: true`, or a known width and height whose longest side is at most `max`.
 * Without a size (legacy images) it is not small: nothing is assumed.
 */
export function isLowResImage(img: Pick<GalleryImage, 'width' | 'height' | 'low_res'> | null | undefined, max: number = LOW_RES_MAX): boolean {
  if (!img) return false
  if (img.low_res === true) return true
  if (img.low_res === false) return false
  const w = img.width ?? 0
  const h = img.height ?? 0
  return w > 0 && h > 0 && Math.max(w, h) <= max
}

export type GalleryProduct = Pick<Product, 'title'> & Partial<Pick<Product, 'images' | 'featured_image'>>
export type GalleryVariant = Pick<ProductVariant, 'id'> & Partial<Pick<ProductVariant, 'image'>>

/**
 * The images to show, in order: `images` when given, else `product.images`, else `featured_image`. Without a URL an
 * image is dropped; a repeated URL keeps its first place. The selected variant's image is added in front when the list
 * does not have it (the API usually includes it already).
 */
export function galleryImages(product: GalleryProduct, images?: readonly GalleryImage[] | null, variant?: GalleryVariant | null): GalleryImage[] {
  const source: readonly GalleryImage[] = images ?? (product.images?.length ? product.images : product.featured_image ? [product.featured_image] : [])
  const seen = new Set<string>()
  const out: GalleryImage[] = []
  for (const img of source) {
    const url = img?.url?.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(img)
  }
  const own = variant?.image
  if (own?.url?.trim() && !seen.has(own.url.trim())) out.unshift(own)
  return out
}

/**
 * Index of the selected variant's image: the first image whose `variant_id` is the variant, else the one with the
 * variant image's URL, else `-1` (nothing to select).
 */
export function variantImageIndex(images: readonly GalleryImage[], variant?: GalleryVariant | null): number {
  if (!variant) return -1
  const byId = images.findIndex((img) => img.variant_id != null && img.variant_id === variant.id)
  if (byId >= 0) return byId
  const url = variant.image?.url?.trim()
  return url ? images.findIndex((img) => img.url.trim() === url) : -1
}

/** Keeps an index inside `[0, count - 1]`. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(Math.max(0, Math.round(index)), count - 1)
}
