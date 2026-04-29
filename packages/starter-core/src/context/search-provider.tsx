/**
 * Re-export of `SearchProvider` from `@asteby/metacore-app-providers`, which
 * is the source of truth for transport-agnostic context providers in the
 * metacore ecosystem (see feedback note "PlatformConfigProvider en
 * app-providers").
 *
 * NOTE: the legacy starter copy auto-rendered `<CommandMenu />` as a child of
 * the provider, which coupled the provider to a specific UI tree. The
 * canonical `app-providers` `SearchProvider` is UI-agnostic — apps render
 * their own `<CommandMenu />` (typically inside the authenticated layout).
 */
export {
  SearchProvider,
  useSearch,
  type SearchProviderProps,
} from '@asteby/metacore-app-providers'
