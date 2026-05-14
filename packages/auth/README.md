# @asteby/metacore-auth

Metacore auth kit: Zustand store, `createApiClient` factory, TanStack Router
guard builder, and brand-less sign-in / sign-up / forgot-password / OTP pages.

## Install

```sh
pnpm add @asteby/metacore-auth @asteby/metacore-ui zustand @tanstack/react-router
```

Peer deps required: `react`, `react-dom`, `@tanstack/react-router`, `zustand`.

## Entry points

| Import path                         | Exports                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `@asteby/metacore-auth`             | Everything below (re-exported).                              |
| `@asteby/metacore-auth/store`       | `useAuthStore`, `AuthUser`, `AuthState`, `AUTH_STORAGE_KEYS` |
| `@asteby/metacore-auth/provider`    | `AuthProvider`, `useAuth`                                    |
| `@asteby/metacore-auth/api-client`  | `createApiClient`, `ApiClient`                               |
| `@asteby/metacore-auth/guards`      | `createAuthGuard`                                            |
| `@asteby/metacore-auth/pages`       | `SignInPage`, `SignUpPage`, `ForgotPasswordPage`, `OtpPage`, `AuthLayout` |
| `@asteby/metacore-auth/components`  | `PasswordInput`, `SignOutDialog`                             |

## Quickstart

### 1. Create the API client (once, at boot)

```ts
import { createApiClient, useAuthStore } from '@asteby/metacore-auth'
import i18n from './i18n'

export const api = createApiClient({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  getToken: () => useAuthStore.getState().auth.accessToken,
  getLanguage: () => i18n.language,
  getBranchId: () => {
    try {
      const branch = JSON.parse(localStorage.getItem('current_branch') || '{}')
      return branch?.id
    } catch {
      return null
    }
  },
  onUnauthorized: () => {
    useAuthStore.getState().auth.reset()
    window.location.href = '/sign-in'
  },
})
```

### 2. Guard authenticated routes

```tsx
// src/routes/_authenticated/route.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createAuthGuard } from '@asteby/metacore-auth/guards'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: createAuthGuard(),
  component: AuthenticatedLayout,
})
```

### 3. Render branded sign-in

```tsx
import { SignInPage } from '@asteby/metacore-auth/pages'
import { useAuthStore } from '@asteby/metacore-auth/store'
import { useNavigate, Link } from '@tanstack/react-router'
import { Logo } from '@/assets/logo'
import { api } from '@/lib/api'

export function SignInRoute() {
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  return (
    <SignInPage
      brandName='MyApp'
      logo={<Logo className='size-7' />}
      showcase={<MyErpShowcase />}
      forgotPasswordSlot={<Link to='/forgot-password'>¿Olvidaste tu contraseña?</Link>}
      onSubmit={async ({ email, password, redirectTo }) => {
        const { data } = await api.post('/auth/login', { email, password })
        auth.setUser(data.data.user)
        auth.setAccessToken(data.data.token)
        navigate({ to: redirectTo || '/' })
      }}
    />
  )
}
```

## Design notes

- **Zustand store is canonical** — generic shape (user + token + reset) shared across host applications. Persists to `localStorage` keys `auth_token` / `auth_user`.
- **Factory, not singleton** — `createApiClient` avoids baking env vars into the library. The host app wires token / language / branch getters.
- **Pages are brand-less** — accept `brandName`, `logo`, `showcase`, `headerSlot`, `footerSlot` so each app supplies its own identity.
- **`onSubmit` delegated** — pages don't assume endpoints, toasts, or navigation. The caller owns the network layer.

## `AuthProvider` / `useAuth` are deprecated

Both exports remain in the public API for back-compat, but they are now thin wrappers over `useAuthStore`:

- `AuthProvider` is a `Fragment` that, on mount, optionally seeds the store with an `initialUser` / `initialAccessToken` (SSR / hydration use-case). It owns no local state and renders no Context.
- `useAuth()` projects the store's `AuthUser` down to the legacy `{ user, login, logout, isAuthenticated }` shape. `login` / `logout` mutate the same store, so `useAuth()` and `useAuthStore` cannot diverge.

**Prefer `useAuthStore` directly in new code:**

```ts
// Reading
const user = useAuthStore((state) => state.auth.user)

// Writing
useAuthStore.getState().auth.setUser(fullUser)
useAuthStore.getState().auth.setAccessToken(token)
useAuthStore.getState().auth.reset() // clears both user & token
```

The legacy hook is kept indefinitely; it's free of cost now that it's a read-through. The deprecation is purely a "prefer the typed, fully-featured surface" hint — not a removal timeline.
