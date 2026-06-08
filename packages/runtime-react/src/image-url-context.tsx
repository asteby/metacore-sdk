// Image-url resolver context — its own module so any renderer (record dialog,
// relation cells, …) can consume the host's storage-path → URL resolver without
// importing from `dialogs/dynamic-record`. That dialog imports
// `dynamic-relations` (which renders `dynamic-relation`), so the relation cell
// cannot import the context back from the dialog without a circular import —
// hence this standalone module is the single source of truth.
import { createContext, useContext } from 'react'

/** Resolves a (possibly relative) storage path into a fetchable URL. */
export type GetImageUrl = (path: string | null | undefined) => string

/** Default resolver: pass the path through unchanged (works same-origin). */
export const identityImageUrl: GetImageUrl = (p) => p ?? ''

/**
 * Threads the host's image-url resolver to nested field/cell components without
 * prop-drilling. Provided by `DynamicRecordDialog`; consumers outside a provider
 * fall back to `identityImageUrl` (the relative path, which renders same-origin).
 */
export const ImageUrlContext = createContext<GetImageUrl>(identityImageUrl)

/** Reads the nearest image-url resolver (identity outside a provider). */
export const useImageUrl = () => useContext(ImageUrlContext)
