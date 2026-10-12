import { Brain, Cloud, KeyRound, Sparkles, Waves } from 'lucide-react'
import type { ComponentType } from 'react'

export interface ProviderPreset {
  /** Sent as `mode`. */
  id: string
  /** Literal fallback; the i18n key `org_ai.providers.<id>.title` wins when translated. */
  title?: string
  subtitle?: string
  icon?: ComponentType<{ className?: string }>
  needsEndpoint: boolean
  needsKey: boolean
  defaultURL: string
  defaultModel: string
  /** Key into `OrgAIConfig.seats`; the preset is disabled while that seat is not ready. */
  seatId?: string
}

/** Bring-your-own-key providers. Hosts can pass their own list. */
export const DEFAULT_PROVIDERS: ProviderPreset[] = [
  { id: 'anthropic', icon: Sparkles, needsEndpoint: true, needsKey: true, defaultURL: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5' },
  { id: 'openai', icon: Brain, needsEndpoint: true, needsKey: true, defaultURL: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { id: 'deepseek', icon: Waves, needsEndpoint: true, needsKey: true, defaultURL: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { id: 'custom', icon: KeyRound, needsEndpoint: true, needsKey: true, defaultURL: '', defaultModel: '' },
]

export const FallbackProviderIcon = Cloud
