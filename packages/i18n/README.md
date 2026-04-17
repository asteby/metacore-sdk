# @asteby/metacore-i18n

i18next factory + base ES/EN bundles + layout-agnostic language switcher and
direction (RTL) provider for Metacore apps.

## Install

```sh
pnpm add @asteby/metacore-i18n i18next react-i18next
# Optional — needed only if you render `<LanguageSwitcher />`:
pnpm add @asteby/metacore-ui
```

## Usage

```ts
// src/i18n.ts
import { createI18n, baseResources } from '@asteby/metacore-i18n'
import appEn from './locales/en.json'
import appEs from './locales/es.json'

export const i18n = createI18n({
  resources: {
    en: { translation: { ...baseResources.en.translation, ...appEn } },
    es: { translation: { ...baseResources.es.translation, ...appEs } },
  },
  fallback: 'es',
})
```

```tsx
// App.tsx
import { I18nextProvider } from 'react-i18next'
import { DirectionProvider, LanguageSwitcher } from '@asteby/metacore-i18n'
import { i18n } from './i18n'

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <DirectionProvider language={i18n.language}>
        <header>
          <LanguageSwitcher
            languages={[
              { code: 'en', label: 'English', flag: '🇺🇸' },
              { code: 'es', label: 'Español', flag: '🇪🇸' },
            ]}
          />
        </header>
        {/* ...app... */}
      </DirectionProvider>
    </I18nextProvider>
  )
}
```

## Entry points

- `@asteby/metacore-i18n` — re-exports everything below.
- `@asteby/metacore-i18n/config` — `createI18n` factory.
- `@asteby/metacore-i18n/language-switcher` — `<LanguageSwitcher />`.
- `@asteby/metacore-i18n/direction-provider` — `<DirectionProvider />`, `useDirection`.
- `@asteby/metacore-i18n/hooks` — `useLocale`, `directionFor`, `DEFAULT_RTL_LANGUAGES`.
- `@asteby/metacore-i18n/locales/en`, `.../es` — raw JSON bundles.

## Base namespaces

The shipped ES/EN bundles are intentionally generic and cover:

- `auth.signIn`, `auth.signUp`
- `common.*` (save, cancel, loading, search, theme…)
- `errors.*` (validation, network, required…)
- `datatable.*` (pagination, bulk delete, rows per page…)
- `settings.profile`, `settings.appearance`, `settings.notifications`
- `coming_soon.*`
- `language.*`

App-specific namespaces (dashboards, pipelines, products, marketplace, etc.)
live in each app and should be deep-merged on top of `baseResources`.
