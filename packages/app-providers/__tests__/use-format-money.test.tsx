import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrgConfigProvider } from '../src/org-config-provider'
import { useFormatMoney, type FormatMoney } from '../src/use-format-money'

const nb = (s: string) => s.replace(/ | /g, ' ')

function run(cfg: Record<string, unknown> | null, fn: (f: FormatMoney) => string): string {
  function Probe() {
    return <>{fn(useFormatMoney())}</>
  }
  if (!cfg) return renderToString(<Probe />)
  const qc = new QueryClient()
  qc.setQueryData(['metacore-org-config'], {
    currency: '', locale: '', validators: {}, addressFormat: '', extra: {}, ...cfg,
  })
  return renderToString(
    <QueryClientProvider client={qc}>
      <OrgConfigProvider fetcher={async () => ({})}>
        <Probe />
      </OrgConfigProvider>
    </QueryClientProvider>,
  )
}

describe('useFormatMoney', () => {
  it('without provider: plain number, no symbol, no regional currency', () => {
    const out = run(null, (f) => f(1234.5, { locale: 'en-US' }))
    expect(out).toBe('1,234.50')
  })
  it('org without currency: no symbol', () => {
    expect(run({ locale: 'en-US' }, (f) => f(10))).toBe('10.00')
  })
  it('uses org currency and locale (JPY has 0 decimals)', () => {
    expect(nb(run({ currency: 'JPY', locale: 'en-US' }, (f) => f(1234)))).toBe('¥1,234')
    expect(nb(run({ currency: 'KWD', locale: 'en-US' }, (f) => f(1.5)))).toContain('1.500')
  })
  it('per-call override wins', () => {
    expect(nb(run({ currency: 'JPY', locale: 'en-US' }, (f) => f(5, { currency: 'USD' })))).toBe('$5.00')
  })
})
