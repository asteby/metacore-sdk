# @asteby/metacore-app-providers

Providers genéricos reutilizables para apps metacore: direction (LTR/RTL), font (font class), layout (sidebar variant/collapsible) y search (command palette hotkey).

## Instalación

```bash
pnpm add @asteby/metacore-app-providers @radix-ui/react-direction
```

## Uso

```tsx
import {
  DirectionProvider,
  FontProvider,
  LayoutProvider,
  SearchProvider,
} from '@asteby/metacore-app-providers'

const fonts = ['inter', 'manrope', 'system'] as const

<DirectionProvider>
  <FontProvider fonts={fonts}>
    <LayoutProvider>
      <SearchProvider>
        <App />
      </SearchProvider>
    </LayoutProvider>
  </FontProvider>
</DirectionProvider>
```

## Customización

- `FontProvider` requiere prop `fonts` (lista; el primero es el default).
- `SearchProvider` acepta `hotkey` (default `'k'`, con Cmd/Ctrl). El consumidor renderiza el command menu usando `useSearch()`.

## Persistencia

Todos los providers persisten estado en cookies (`dir`, `font`, `layout_collapsible`, `layout_variant`).
