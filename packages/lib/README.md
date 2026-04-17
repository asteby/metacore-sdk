# @asteby/metacore-lib

Pure utilities shared across the Metacore ecosystem. No React, no DOM.

Covers:

- **date** — `formatDate`, `formatDistance`, `formatRelative`, `getAllTimezones`
- **format** — `formatNumber`, `formatPercentage`, `truncate`
- **currency** — `formatCurrency`, `parseCurrency`, `getCurrencySymbol`, `SPANISH_SYMBOLS`
- **errors** — `handleServerError(error, toast?, { labels?, logger? })`

Cookie helpers live in `@asteby/metacore-ui/lib` (`getCookie`, `setCookie`, `removeCookie`).

## Install

```bash
pnpm add @asteby/metacore-lib date-fns
# sonner is an optional peer for the error handler
pnpm add sonner
```

## Usage

```ts
import { formatCurrency, parseCurrency } from '@asteby/metacore-lib/currency'
import { formatDate, formatDistance } from '@asteby/metacore-lib/date'
import { formatNumber, truncate } from '@asteby/metacore-lib/format'
import { handleServerError } from '@asteby/metacore-lib/errors'
import { toast } from 'sonner'

formatCurrency(1234.56, 'USD', 'en') // "$1,234.56"
parseCurrency('S/ 1.234,56') // 1234.56
formatDate('2024-01-15', 'dd/MM/yyyy') // "15/01/2024"
formatDistance('2024-01-01') // "about 2 years ago"
formatNumber(1234.5, { locale: 'es' }) // "1.234,5"
truncate('hello world', 5) // "hello…"

try {
  // ...
} catch (err) {
  handleServerError(err, toast, {
    labels: {
      unauthorized: 'Sesión expirada',
      forbidden: 'No tienes permisos',
      notFound: 'Recurso no encontrado',
    },
  })
}
```

## Error labels

`handleServerError` accepts an injected `toast` so consumers decide the UI binding, and an optional `labels` map for localization.

```ts
interface ErrorLabels {
  generic: string
  notFound: string
  unauthorized: string
  forbidden: string
  network: string
  timeout: string
}
```

## License

Apache-2.0
