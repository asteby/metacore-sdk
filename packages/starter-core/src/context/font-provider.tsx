/**
 * Re-export of `FontProvider` from `@asteby/metacore-app-providers`, which is
 * the source of truth for transport-agnostic context providers in the
 * metacore ecosystem (see feedback note "PlatformConfigProvider en
 * app-providers").
 *
 * NOTE: the canonical `FontProvider` requires an explicit `fonts` array prop
 * — apps should pass the constant from `@asteby/metacore-starter-config/fonts`
 * (or their own list). The legacy starter copy implicitly read a hard-coded
 * list, which made it impossible to share across apps with different
 * typography catalogues.
 */
export {
  FontProvider,
  useFont,
  type FontProviderProps,
} from '@asteby/metacore-app-providers'
