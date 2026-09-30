// approval-events — dependency-free glue between server-error.ts (which sees a
// parked `approval_required` write) and <ApprovalGateProvider> (which owns the
// PIN dialog). Kept apart so the error toaster never imports React/UI code.

/** Window event toastServerError fires for a parked `approval_required` write. */
export const APPROVAL_PARKED_EVENT = 'metacore:approval-parked'
/** Fired after a parked request was approved (and replayed) with a PIN. */
export const APPROVAL_DECIDED_EVENT = 'metacore:approval-decided'

let gateMounted = 0
/** @internal provider bookkeeping. */
export function gateMountedDelta(d: number): void {
    gateMounted += d
}

/** True while an <ApprovalGateProvider> is mounted (toastServerError offers the PIN action only then). */
export function approvalGateAvailable(): boolean {
    return gateMounted > 0
}

export interface ApprovalRequiredInfo {
    requestId: string
    label?: string
    roles: string[]
}

/** Extracts the parked-request info from an axios error / response body, or null. */
export function approvalRequiredInfo(err: unknown): ApprovalRequiredInfo | null {
    const data = ((err as { response?: { data?: unknown } })?.response?.data ?? err) as
        | { error?: { code?: string }; meta?: { approval_request_id?: string; approval_label?: string; approval_roles?: string[] } }
        | undefined
    if (data?.error?.code !== 'approval_required') return null
    return {
        requestId: data.meta?.approval_request_id ?? '',
        label: data.meta?.approval_label,
        roles: data.meta?.approval_roles ?? [],
    }
}

