import { useMemo } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  CreateWebhookPayload,
  CreateWebhookResponse,
  Webhook,
  WebhookLog,
  WebhookStats,
  WebhooksApiClient,
  WebhooksConfig,
} from './types'

/**
 * Compute the default base path for the current scope.
 */
export function resolveBasePath(config: Pick<WebhooksConfig, 'scope' | 'apiBasePath'>): string {
  if (config.apiBasePath) return config.apiBasePath.replace(/\/$/, '')
  return config.scope === 'organization' ? '/org-webhooks' : '/webhooks'
}

/** Shared query-key builder. */
export const webhookKeys = {
  all: (scope: string, deviceId?: string) =>
    ['metacore-webhooks', scope, deviceId ?? null] as const,
  list: (scope: string, deviceId?: string) =>
    [...webhookKeys.all(scope, deviceId), 'list'] as const,
  stats: (scope: string, deviceId?: string) =>
    [...webhookKeys.all(scope, deviceId), 'stats'] as const,
  logs: (scope: string, webhookId: string, page: number, deviceId?: string) =>
    [...webhookKeys.all(scope, deviceId), 'logs', webhookId, page] as const,
}

interface ListEnvelope<T> {
  success?: boolean
  data?: T
  meta?: { pages?: number }
}

/**
 * Core data-hook. Returns the list, stats, and the mutations needed by the
 * UI (create / delete / toggle / test / replay).
 */
export function useWebhooks(config: WebhooksConfig): {
  webhooks: Webhook[]
  stats: WebhookStats | null
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
  list: UseQueryResult<Webhook[]>
  statsQuery: UseQueryResult<WebhookStats | null>
  create: UseMutationResult<CreateWebhookResponse, unknown, CreateWebhookPayload>
  update: UseMutationResult<unknown, unknown, { id: string; patch: Partial<Webhook> }>
  remove: UseMutationResult<unknown, unknown, string>
  test: UseMutationResult<unknown, unknown, string>
  replay: UseMutationResult<unknown, unknown, { webhookId: string; logId: string }>
  basePath: string
} {
  const { apiClient, scope, deviceId, disablePolling } = config
  const basePath = resolveBasePath(config)
  const queryClient = useQueryClient()

  const listQueryKey = webhookKeys.list(scope, deviceId)
  const statsQueryKey = webhookKeys.stats(scope, deviceId)

  const list = useQuery<Webhook[]>({
    queryKey: listQueryKey,
    queryFn: async () => {
      const url = scope === 'device' && deviceId
        ? `${basePath}?device_id=${encodeURIComponent(deviceId)}`
        : basePath
      const res = await apiClient.get<ListEnvelope<Webhook[]>>(url)
      return res.data?.data ?? []
    },
    refetchInterval: disablePolling ? false : 30_000,
  })

  const statsQuery = useQuery<WebhookStats | null>({
    queryKey: statsQueryKey,
    queryFn: async () => {
      try {
        const res = await apiClient.get<ListEnvelope<WebhookStats>>(`${basePath}/stats`)
        return res.data?.data ?? null
      } catch {
        return null
      }
    },
    refetchInterval: disablePolling ? false : 30_000,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listQueryKey }),
      queryClient.invalidateQueries({ queryKey: statsQueryKey }),
    ])
  }

  const create = useMutation<CreateWebhookResponse, unknown, CreateWebhookPayload>({
    mutationFn: async (payload) => {
      const body: CreateWebhookPayload = { ...payload }
      if (scope === 'device' && deviceId && !body.device_id) {
        body.device_id = deviceId
      }
      const res = await apiClient.post<CreateWebhookResponse>(basePath, body)
      return res.data
    },
    onSuccess: invalidate,
  })

  const update = useMutation<unknown, unknown, { id: string; patch: Partial<Webhook> }>({
    mutationFn: async ({ id, patch }) => {
      const res = await apiClient.put(`${basePath}/${id}`, patch)
      return res.data
    },
    onSuccess: invalidate,
  })

  const remove = useMutation<unknown, unknown, string>({
    mutationFn: async (id) => {
      const res = await apiClient.delete(`${basePath}/${id}`)
      return res.data
    },
    onSuccess: invalidate,
  })

  const test = useMutation<unknown, unknown, string>({
    mutationFn: async (id) => {
      const res = await apiClient.post(`${basePath}/${id}/test`)
      return res.data
    },
  })

  const replay = useMutation<unknown, unknown, { webhookId: string; logId: string }>({
    mutationFn: async ({ webhookId, logId }) => {
      const res = await apiClient.post(
        `${basePath}/${webhookId}/logs/${logId}/replay`
      )
      return res.data
    },
  })

  return {
    webhooks: list.data ?? [],
    stats: statsQuery.data ?? null,
    isLoading: list.isLoading,
    isError: list.isError,
    refetch: async () => {
      await Promise.all([list.refetch(), statsQuery.refetch()])
    },
    list,
    statsQuery,
    create,
    update,
    remove,
    test,
    replay,
    basePath,
  }
}

/**
 * Paginated logs for a single webhook. Separate from {@link useWebhooks} so
 * the logs dialog can use its own pagination state without re-triggering the
 * list query.
 */
export function useWebhookLogs(
  apiClient: WebhooksApiClient,
  basePath: string,
  webhookId: string | null,
  page: number,
  options: { perPage?: number; enabled?: boolean } = {}
) {
  const { perPage = 15, enabled = true } = options
  const queryKey = useMemo(
    () => ['metacore-webhook-logs', basePath, webhookId, page, perPage] as const,
    [basePath, webhookId, page, perPage]
  )

  return useQuery<{ logs: WebhookLog[]; totalPages: number }>({
    queryKey,
    enabled: !!webhookId && enabled,
    queryFn: async () => {
      if (!webhookId) return { logs: [], totalPages: 1 }
      const url = `${basePath}/${webhookId}/logs?page=${page}&per_page=${perPage}`
      const res = await apiClient.get<ListEnvelope<WebhookLog[]>>(url)
      return {
        logs: res.data?.data ?? [],
        totalPages: res.data?.meta?.pages ?? 1,
      }
    },
  })
}
