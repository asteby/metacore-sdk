import type { AccountMessages } from '../account/orders-messages.js'
import { useAccountText, type AccountTextProps } from '../account/orders-ui.js'
import { fillText, trackingMessages, type TrackingMessages } from './messages.js'

/** Locale, time zone and per-key text overrides of a tracking component (the order screens' keys and the tracking keys share one prop). */
export type TrackingTextProps = Omit<AccountTextProps, 'messages'> & {
  messages?: Partial<AccountMessages> & Partial<TrackingMessages>
}

/** Resolves both text sets (`m`: order-screen texts such as the shipment statuses; `tm`: tracking texts) and the date formatter. */
export function useTrackingText({ messages, ...rest }: TrackingTextProps) {
  const a = useAccountText({ ...rest, ...(messages ? { messages: messages as Partial<AccountMessages> } : {}) })
  const tm = trackingMessages(a.locale, messages as Partial<TrackingMessages> | undefined)
  const tt = (key: keyof TrackingMessages, vars?: Record<string, string | number>): string => (vars ? fillText(tm[key], vars) : tm[key])
  return { ...a, tm, tt }
}
