import { redirect } from '@tanstack/react-router'
import { useAuthStore } from './store'

export interface CreateAuthGuardOptions {
  /**
   * Route to redirect to when the user is not authenticated.
   * Default: `/sign-in`.
   */
  signInPath?: string
  /**
   * Optional hook that runs after the auth check passes. Useful for prefetching
   * metadata or warming caches once the user is known. Exceptions are swallowed
   * so they don't block navigation.
   */
  afterAuth?: () => void | Promise<void>
  /**
   * Override how the current path is derived for the `redirect` search param.
   * Defaults to `window.location.pathname`.
   */
  getCurrentPath?: () => string
}

/**
 * Creates a `beforeLoad` function for TanStack Router. Usage:
 *
 *   export const Route = createFileRoute('/_authenticated')({
 *     beforeLoad: createAuthGuard({ afterAuth: () => useMetadataCache.getState().prefetchAll() }),
 *     component: AuthenticatedLayout,
 *   })
 */
export function createAuthGuard(options: CreateAuthGuardOptions = {}) {
  const {
    signInPath = '/sign-in',
    afterAuth,
    getCurrentPath = () =>
      typeof window !== 'undefined' ? window.location.pathname : '/',
  } = options

  return function beforeLoad() {
    const { auth } = useAuthStore.getState()
    if (!auth.accessToken || !auth.user) {
      throw redirect({
        to: signInPath,
        search: {
          redirect: getCurrentPath(),
        },
      })
    }

    if (afterAuth) {
      try {
        void afterAuth()
      } catch {
        /* swallow — never block navigation */
      }
    }
  }
}
