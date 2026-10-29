/**
 * Type-only check (compiled by `pnpm typecheck`, never imported nor bundled): the exact snippet the README tells a store
 * to write must type-check against the REAL `@asteby/metacore-maps`, with no cast.
 */
import type { TrackingMapsLoader } from './map.js'

export const loadMapsFromReadme: TrackingMapsLoader = () => import('@asteby/metacore-maps')

// And through the public props, the way a store passes it.
import type { TrackOrderLookupProps } from './lookup.js'
export const trackerProps: TrackOrderLookupProps['trackerProps'] = { loadMaps: () => import('@asteby/metacore-maps') }
