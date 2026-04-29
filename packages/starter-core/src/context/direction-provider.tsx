/**
 * Re-export of `DirectionProvider` from `@asteby/metacore-app-providers`,
 * which is the source of truth for transport-agnostic context providers in
 * the metacore ecosystem (see feedback note "PlatformConfigProvider en
 * app-providers").
 *
 * Kept here as a thin alias so any legacy import path continues to resolve.
 * New code should import directly from `@asteby/metacore-app-providers`.
 */
export {
  DirectionProvider,
  useDirection,
  type Direction,
} from '@asteby/metacore-app-providers'
