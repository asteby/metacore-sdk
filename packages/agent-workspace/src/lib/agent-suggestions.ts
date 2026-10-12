import { useQuery } from '@tanstack/react-query'
import { api } from '../host'

/**
 * Chat empty-state starter prompts, per vertical. Cascade resolved by the
 * backend (OrgBranding.AgentSuggestions -> PlatformConfig.AgentSuggestions) and
 * served by GET /org/branding. When no set is configured the generic ERP
 * defaults below are used, exactly as before this was configurable.
 */
const DEFAULT_SUGGESTIONS = [
  'Buscar un cliente',
  'Crear un pedido',
  '¿Cómo va el inventario?',
  'Resumen de ventas de hoy',
]

export function useAgentSuggestions(): string[] {
  const { data } = useQuery({
    queryKey: ['org-branding', 'agent-suggestions'],
    queryFn: async () => {
      const res = await api.get('/org/branding')
      const list = res.data?.data?.agent_suggestions
      return Array.isArray(list) && list.length ? (list as string[]) : null
    },
    staleTime: 10 * 60 * 1000,
  })
  return data ?? DEFAULT_SUGGESTIONS
}
