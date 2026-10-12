import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClaudeConnectApi,
  OrgAIApi,
  OrgAIConfig,
  OrgAIHttpClient,
} from './types'

export const orgAIConfigQueryKey = ['organization', 'ai-config'] as const

/** Stable error codes the backend sends in `error.code` for the Claude flow. */
export const CLAUDE_CONNECT_ERROR_CODES = [
  'binary_missing',
  'invalid_code',
  'timeout',
  'expired',
  'busy',
  'invalid_token',
] as const
export type ClaudeConnectErrorCode = (typeof CLAUDE_CONNECT_ERROR_CODES)[number]

type Envelope<T> = { success?: boolean; data: T }
const unwrap = <T>(res: { data?: unknown }): T => (res.data as Envelope<T>).data

export function createOrgAIApi(
  http: OrgAIHttpClient,
  opts: { basePath?: string; userSourcePath?: string | false } = {},
): OrgAIApi {
  const base = opts.basePath ?? '/organization/ai-config'
  const userSourcePath = opts.userSourcePath === undefined ? '/organization/ai-source' : opts.userSourcePath
  const api: OrgAIApi = {
    async getConfig() {
      return unwrap<OrgAIConfig>(await http.get(base))
    },
    async updateConfig(body) {
      return unwrap<OrgAIConfig>(await http.put(base, body))
    },
  }
  if (userSourcePath) {
    api.updateUserSource = async (source) =>
      unwrap<{ user_ai_source: 'inherit' | 'local' }>(await http.put(userSourcePath, { source })).user_ai_source
  }
  return api
}

export function createClaudeConnectApi(
  http: OrgAIHttpClient,
  opts: { basePath?: string } = {},
): ClaudeConnectApi {
  const base = opts.basePath ?? '/organization/ai-config/claude'
  return {
    getBinary: async () => unwrap(await http.get(`${base}/binary`)),
    install: async () => unwrap(await http.post(`${base}/install`)),
    start: async () => unwrap(await http.post(`${base}/connect`)),
    submitCode: async (id, code) =>
      unwrap<{ connected: boolean }>(
        await http.post(`${base}/connect/${encodeURIComponent(id)}/code`, { code }),
      ).connected === true,
    submitToken: async (token) =>
      unwrap<{ connected: boolean }>(await http.put(`${base}/token`, { token })).connected === true,
    cancel: async (id) => {
      await http.delete(`${base}/connect/${encodeURIComponent(id)}`)
    },
  }
}

/** The stable code of a failed request, or null when it is not one we know. */
export function claudeConnectErrorCode(err: unknown): ClaudeConnectErrorCode | null {
  const data = (err as { response?: { data?: { error?: { code?: unknown } | string } } })?.response?.data
  const raw = typeof data?.error === 'object' ? data.error?.code : undefined
  return CLAUDE_CONNECT_ERROR_CODES.find((c) => c === raw) ?? null
}

/** i18n key for the user-facing message; unknown failures get a generic one. */
export function claudeConnectErrorKey(err: unknown): string {
  return `org_ai.claude_connect.errors.${claudeConnectErrorCode(err) ?? 'generic'}`
}

export function useOrgAIConfig(api: OrgAIApi) {
  return useQuery({ queryKey: orgAIConfigQueryKey, queryFn: () => api.getConfig(), staleTime: 30_000 })
}

export function useUpdateOrgAIConfig(api: OrgAIApi) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Parameters<OrgAIApi['updateConfig']>[0]) => api.updateConfig(body),
    onSuccess: (data) => qc.setQueryData(orgAIConfigQueryKey, data),
  })
}

export function useUpdateUserAISource(api: OrgAIApi) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (source: 'inherit' | 'local') => {
      if (!api.updateUserSource) throw new Error('updateUserSource not provided')
      return api.updateUserSource(source)
    },
    onSuccess: (source) =>
      qc.setQueryData<OrgAIConfig | undefined>(orgAIConfigQueryKey, (prev) =>
        prev ? { ...prev, user_ai_source: source } : prev,
      ),
  })
}

/** Best-effort message from a failed request (`response.data.message`). */
export function requestErrorMessage(err: unknown): string | undefined {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  return typeof m === 'string' && m ? m : undefined
}
