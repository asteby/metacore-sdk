import * as React from 'react'
import { createT, type Locale, type Messages } from './i18n'
import { InboundTab } from './inbound-tab'
import { LogTab } from './log-tab'
import { OutboundTab } from './outbound-tab'
import type { IntegrationsApi } from './types'

export type PanelTab = 'out' | 'in' | 'log'
const TABS: PanelTab[] = ['out', 'in', 'log']

export interface IntegrationsPanelProps {
  /** Implemented by the host (Ops). The panel never does HTTP itself. */
  api: IntegrationsApi
  locale?: Locale
  /** Rename/translate any message key. */
  messages?: Partial<Messages>
  /** Controlled tab (optional). */
  tab?: PanelTab
  onTabChange?: (tab: PanelTab) => void
  className?: string
}

/**
 * Integrations → Events screen (RFC 0003 §4): Outbound / Inbound / Log tabs.
 * Tabs follow the WAI-ARIA pattern (roving tabindex, arrow/Home/End keys).
 */
export function IntegrationsPanel({ api, locale = 'es', messages, tab, onTabChange, className }: IntegrationsPanelProps) {
  const t = React.useMemo(() => createT(locale, messages), [locale, messages])
  const [inner, setInner] = React.useState<PanelTab>('out')
  const current = tab ?? inner
  const base = React.useId()
  const refs = React.useRef<Record<PanelTab, HTMLButtonElement | null>>({ out: null, in: null, log: null })

  const select = (next: PanelTab, focus = false) => {
    setInner(next)
    onTabChange?.(next)
    if (focus) refs.current[next]?.focus()
  }
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const last = TABS.length - 1
    let n = -1
    if (e.key === 'ArrowRight') n = i === last ? 0 : i + 1
    else if (e.key === 'ArrowLeft') n = i === 0 ? last : i - 1
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = last
    if (n >= 0) {
      e.preventDefault()
      select(TABS[n]!, true)
    }
  }

  return (
    <div className={className} data-metacore="integrations-panel">
      <h1 className="mb-3 text-xl font-semibold">{t('panel.title')}</h1>
      <div role="tablist" aria-label={t('panel.title')} className="mb-4 flex gap-1 border-b">
        {TABS.map((id, i) => (
          <button
            key={id}
            ref={(el) => {
              refs.current[id] = el
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${id}`}
            aria-selected={current === id}
            aria-controls={`${base}-panel-${id}`}
            tabIndex={current === id ? 0 : -1}
            className={`px-4 py-2 text-sm font-medium ${current === id ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}
            onClick={() => select(id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t(`tab.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-${current}`} aria-labelledby={`${base}-tab-${current}`} tabIndex={0}>
        {current === 'out' ? <OutboundTab api={api} t={t} /> : null}
        {current === 'in' ? <InboundTab api={api} t={t} /> : null}
        {current === 'log' ? <LogTab api={api} t={t} locale={locale} /> : null}
      </div>
    </div>
  )
}
