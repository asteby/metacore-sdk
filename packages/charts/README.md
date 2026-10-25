# @asteby/metacore-charts

Shared charting for metacore hosts and addons (`ui.charts` page share).

| Entry | What | Weight |
| --- | --- | --- |
| `@asteby/metacore-charts` | palette + value formatting, `Sparkline`, lazy `BarChart`/`LineChart`/`AreaChart`/`PieChart`/`DonutChart`, `preloadCharts` | no recharts in the static graph |
| `@asteby/metacore-charts/sparkline` | `Sparkline` only (pure SVG) | < 1 KB gzip, 0 KB recharts |
| `@asteby/metacore-charts/recharts` | eager recharts-backed chart bodies | pulls recharts (~100 KB gzip); load lazily |

```tsx
import { Sparkline, BarChart } from '@asteby/metacore-charts'

<Sparkline data={[3, 5, 4, 9]} accent="emerald" area label="Weekly orders" />
<BarChart series={[{ key: 'a', label: 'A', value: 3 }]} format="currency" currency="MXN" />
```

Colors come from theme CSS vars (`--color-widget-*`, `--border`, `--muted-foreground`), so charts are dark-mode safe.
`@asteby/metacore-runtime-react` keeps re-exporting the dashboard widgets and formatters it always exposed.

Note: the accent class strings (`bg-sky-500/10`, …) in `format.ts` are Tailwind utilities; hosts that scan
`node_modules/@asteby/*` for classes should include this package too.
