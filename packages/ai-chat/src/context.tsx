import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAgentSuggestions } from '@asteby/metacore-app-providers'
import {
  DEFAULT_LABELS,
  type ChatClient,
  type CopilotBranding,
  type CopilotLabels,
  type CopilotPermissions,
} from './types'

export interface CopilotContextValue {
  client: ChatClient
  permissions: Required<CopilotPermissions>
  branding: CopilotBranding
  labels: CopilotLabels
  /** Explicit starter prompts; null means "use useAgentSuggestions()". */
  suggestions: readonly string[] | null
  /** Show the "demo data" badge. */
  demo: boolean
}

const CopilotContext = createContext<CopilotContextValue | null>(null)

export interface CopilotProviderProps {
  /** Transport. Build one with `createHttpChatClient(api)` or inject your own. */
  client: ChatClient
  permissions?: CopilotPermissions
  branding?: CopilotBranding
  labels?: Partial<CopilotLabels>
  /** Starter prompts. Omit to resolve them from platform branding. */
  suggestions?: readonly string[]
  /** Mark the copilot as running on demo data: renders the `labels.demo` badge. */
  demo?: boolean
  children: ReactNode
}

export function CopilotProvider({
  client,
  permissions,
  branding,
  labels,
  suggestions,
  demo = false,
  children,
}: CopilotProviderProps) {
  const value = useMemo<CopilotContextValue>(
    () => ({
      client,
      permissions: { canChat: true, canDecideProposals: true, ...permissions },
      branding: branding ?? {},
      labels: { ...DEFAULT_LABELS, ...labels },
      suggestions: suggestions ?? null,
      demo,
    }),
    [client, permissions, branding, labels, suggestions, demo],
  )
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
}

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext)
  if (!ctx) throw new Error('useCopilot must be used inside <CopilotProvider>')
  return ctx
}

/** Starter prompts: provider override first, else tenant branding. */
export function useCopilotSuggestions(): string[] {
  const { suggestions } = useCopilot()
  const fromBranding = useAgentSuggestions()
  return suggestions ? [...suggestions] : fromBranding
}
