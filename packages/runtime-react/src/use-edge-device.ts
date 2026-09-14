// useEdgeDevice — THE standard primitive for resolving a paired edge device
// (printer, scale, payment terminal, cashdro…) by capability, without every
// addon re-implementing its own lookup against `GET /edge/devices`.
//
// `pos-edge-print` implemented this locally as `findEdgePrinter` (first
// paired+online device with `capabilities.includes('print')`, filtered by
// active branch). Any addon that needs a device by capability hits the same
// shape, so the lookup belongs here, not copied per addon.
//
// react-query is a PEER dependency of runtime-react: `useQuery` resolves to
// the HOST's singleton QueryClient (the MF shared singleton), so this hook
// never constructs its own client and stays cache-coherent with the rest of
// the app. Do not add a QueryClientProvider here.
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './api-context'
import { useCurrentBranch } from './api-context'

/** A physical device paired to an org (and usually a branch) via ops-edge-agent. */
export interface EdgeDevice {
    id: string
    label: string
    kind: string
    status: 'online' | 'offline'
    capabilities: string[]
    sucursalId?: string | number | null
}

/** Stable react-query key for the org's edge device list. */
export function edgeDevicesKey() {
    return ['edge-devices'] as const
}

/**
 * Pick the best device for `capability`: online devices only, preferring one
 * paired to `sucursalId` and falling back to an org-level device (no
 * `sucursalId`) when the branch has none. Pure + exported for unit testing.
 */
export function resolveEdgeDevice(
    devices: EdgeDevice[],
    capability: string,
    sucursalId?: string | number | null,
): EdgeDevice | undefined {
    const eligible = devices.filter(
        (d) => d.status === 'online' && d.capabilities.includes(capability),
    )
    if (sucursalId != null) {
        const branchMatch = eligible.find((d) => String(d.sucursalId ?? '') === String(sucursalId))
        if (branchMatch) return branchMatch
    }
    return eligible.find((d) => d.sucursalId == null) ?? eligible[0]
}

export interface UseEdgeDeviceOptions {
    /** Override staleTime (default 15s — device pairing/online status can change). */
    staleTime?: number
    /** Poll interval; devices go on/offline without any local event to react to. */
    refetchInterval?: number
    /** Defer fetching. */
    enabled?: boolean
}

export interface UseEdgeDeviceResult {
    device: EdgeDevice | undefined
    isLoading: boolean
    error: unknown
    refetch: () => void
}

/**
 * Resolve the best online device offering `capability` for the active branch.
 *
 * @example
 * const { device, isLoading } = useEdgeDevice('print')
 * if (device) await sendEdgeDeviceCommand(device.id, { type: 'print', payload })
 */
export function useEdgeDevice(
    capability: string,
    opts: UseEdgeDeviceOptions = {},
): UseEdgeDeviceResult {
    const api = useApi()
    const branch = useCurrentBranch()
    const { staleTime, refetchInterval, enabled } = opts

    const query = useQuery<EdgeDevice[]>({
        queryKey: edgeDevicesKey(),
        queryFn: async () => {
            const res = await api.get('/edge/devices')
            const body = (res as { data: any }).data
            const devices = body?.success ? body.data : body
            return (devices ?? []) as EdgeDevice[]
        },
        staleTime: staleTime ?? 15_000,
        refetchInterval,
        enabled: (enabled ?? true) && !!capability,
    })

    const device = useMemo(
        () => resolveEdgeDevice(query.data ?? [], capability, branch.id),
        [query.data, capability, branch.id],
    )

    return {
        device,
        isLoading: query.isLoading,
        error: query.error,
        refetch: () => {
            void query.refetch()
        },
    }
}

/**
 * Send a command to a paired edge device (e.g. a print job, an open-drawer
 * pulse, a weigh request). Generic over the command payload shape — each
 * addon defines its own command contract with the local agent.
 *
 * @example
 * const send = useSendEdgeDeviceCommand()
 * await send.mutateAsync({ deviceId: device.id, command: { type: 'print', payload } })
 */
export async function sendEdgeDeviceCommand(
    api: Pick<import('./api-context').ApiClient, 'post'>,
    deviceId: string,
    command: Record<string, unknown>,
): Promise<unknown> {
    const res = await api.post(`/edge/devices/${deviceId}/commands`, command)
    const body = (res as { data: any }).data
    return body?.success ? body.data : body
}

export interface SendEdgeDeviceCommandArgs {
    deviceId: string
    command: Record<string, unknown>
}

/** Mutation wrapper over {@link sendEdgeDeviceCommand} bound to the host's ApiClient. */
export function useSendEdgeDeviceCommand() {
    const api = useApi()
    const qc = useQueryClient()

    return useMutation<unknown, Error, SendEdgeDeviceCommandArgs>({
        mutationFn: ({ deviceId, command }) => sendEdgeDeviceCommand(api, deviceId, command),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: edgeDevicesKey() })
        },
    })
}
