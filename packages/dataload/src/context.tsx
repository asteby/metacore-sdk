import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { resolveCapabilities, type DataloadCapabilities } from './capabilities'
import { makeT, type DataloadI18n, type DataloadMessages, type DataloadT } from './messages'
import type { TranslateFn } from './types'

export interface DataloadNotify {
  success(msg: string): void
  error(msg: string): void
}

/** What the host sets once for every dataload component below it. Each component prop wins over it. */
export interface DataloadConfig extends DataloadI18n {
  capabilities?: Partial<DataloadCapabilities>
  notify?: DataloadNotify
}

const Ctx = createContext<DataloadConfig>({})

export function DataloadProvider({ children, ...config }: DataloadConfig & { children: ReactNode }) {
  const parent = useContext(Ctx)
  const value = useMemo(
    () => ({ ...parent, ...config, messages: config.messages ? { ...parent.messages, ...config.messages } : parent.messages }),
    [parent, config.locale, config.messages, config.t, config.capabilities, config.notify],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Props every component accepts to override the provider. */
export interface DataloadUiProps {
  t?: TranslateFn
  locale?: string
  messages?: Partial<DataloadMessages>
  capabilities?: Partial<DataloadCapabilities>
  notify?: DataloadNotify
}

export interface ResolvedDataloadUi {
  t: DataloadT
  locale: string
  caps: DataloadCapabilities
  notify?: DataloadNotify
  /** Raw i18n to hand down to child components. */
  i18n: DataloadI18n
}

/** Merges component props over the provider. */
export function useDataloadUi(p: DataloadUiProps = {}): ResolvedDataloadUi {
  const c = useContext(Ctx)
  const tIn = p.t ?? c.t
  const locale = p.locale ?? c.locale ?? 'es-MX'
  const messages = useMemo(() => (p.messages ? { ...c.messages, ...p.messages } : c.messages), [p.messages, c.messages])
  const capsIn = p.capabilities ?? c.capabilities
  const t = useMemo(() => makeT(tIn, { locale, messages }), [tIn, locale, messages])
  const caps = useMemo(() => resolveCapabilities(capsIn), [capsIn])
  return { t, locale, caps, notify: p.notify ?? c.notify, i18n: { t: tIn, locale, messages } }
}
