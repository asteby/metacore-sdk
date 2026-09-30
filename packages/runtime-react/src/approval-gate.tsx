// ApprovalGate — one place for "this needs a supervisor" in hosts that mount an
// ApiProvider. It answers two situations with the same PIN dialog:
//
//   1. INLINE policy (POS oversell, discount over the cap, refund…): the client
//      calls `requestApproval({policy, …})`. A user who already holds the policy's
//      `general.approve_<policy>` capability passes straight through (`bypassed`);
//      everyone else gets the dialog, which posts `/approvals/pin-grant`.
//   2. PARKED request: a write answered 422 `approval_required`. toastServerError
//      shows "Enviado a aprobación" with an "Aprobar con PIN" action that opens the
//      dialog against `/approvals/:id/approve-pin` (kernel approvals_pin.go).
//
// Federated addons with their own HTTP client use <ApprovalPinDialog> directly
// (approval-pin-dialog.tsx) and post to the same endpoints.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useApi } from './api-context'
import { useCan } from './permissions-context'
import { ApprovalPinDialog, type ApprovalPinSubmit } from './approval-pin-dialog'
import {
    APPROVAL_DECIDED_EVENT,
    APPROVAL_PARKED_EVENT,
    gateMountedDelta,
    type ApprovalRequiredInfo,
} from './approval-events'

export {
    APPROVAL_DECIDED_EVENT,
    APPROVAL_PARKED_EVENT,
    approvalGateAvailable,
    approvalRequiredInfo,
    type ApprovalRequiredInfo,
} from './approval-events'

/** Capability that authorizes `policy` (and lets its holder skip the prompt). */
export function approvalCapability(policy: string): string {
    return `general.approve_${policy}`
}

export interface ApprovalGrant {
    /** Audit row id (ApprovalRequest.kind=pin); null when the caller bypassed. */
    id: string | null
    policy: string
    bypassed: boolean
    reason?: string
}

export interface RequestApprovalOptions {
    /** Policy key: oversell | discount | price_below_min | refund | cancel_cfdi | inventory_adjust | <addon-declared>. */
    policy: string
    label: string
    description?: React.ReactNode
    /** Free-form audit data stored with the grant (product, qty, before → after…). */
    context?: Record<string, unknown>
    model?: string
    recordId?: string
    addonKey?: string
}

export interface ApprovalGateValue {
    /** Resolves the grant, or null when the operator cancelled. */
    requestApproval: (opts: RequestApprovalOptions) => Promise<ApprovalGrant | null>
    /** True when the current user may do `policy` without asking anyone. */
    canSelfApprove: (policy: string) => boolean
}

const ApprovalGateContext = createContext<ApprovalGateValue | null>(null)

type Pending =
    | { kind: 'inline'; opts: RequestApprovalOptions; resolve: (g: ApprovalGrant | null) => void }
    | { kind: 'parked'; info: ApprovalRequiredInfo }

export function ApprovalGateProvider({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation()
    const api = useApi()
    const can = useCan()
    const [pending, setPending] = useState<Pending | null>(null)
    const pendingRef = useRef<Pending | null>(null)
    pendingRef.current = pending

    useEffect(() => {
        gateMountedDelta(1)
        const onParked = (e: Event) => {
            const info = (e as CustomEvent<ApprovalRequiredInfo>).detail
            if (info?.requestId) setPending({ kind: 'parked', info })
        }
        window.addEventListener(APPROVAL_PARKED_EVENT, onParked)
        return () => {
            gateMountedDelta(-1)
            window.removeEventListener(APPROVAL_PARKED_EVENT, onParked)
        }
    }, [])

    const canSelfApprove = useCallback((policy: string) => can(approvalCapability(policy)), [can])

    const requestApproval = useCallback(
        (opts: RequestApprovalOptions) => {
            if (can(approvalCapability(opts.policy))) {
                return Promise.resolve<ApprovalGrant>({ id: null, policy: opts.policy, bypassed: true })
            }
            return new Promise<ApprovalGrant | null>((resolve) => {
                pendingRef.current?.kind === 'inline' && pendingRef.current.resolve(null)
                setPending({ kind: 'inline', opts, resolve })
            })
        },
        [can],
    )

    const close = () => {
        const p = pendingRef.current
        if (p?.kind === 'inline') p.resolve(null)
        setPending(null)
    }

    const submit = async ({ pin, reason }: ApprovalPinSubmit) => {
        const p = pendingRef.current
        if (!p) return
        if (p.kind === 'inline') {
            const res = await api.post('/approvals/pin-grant', {
                policy: p.opts.policy,
                label: p.opts.label,
                pin,
                reason,
                context: p.opts.context,
                model: p.opts.model,
                record_id: p.opts.recordId,
                addon_key: p.opts.addonKey,
            })
            const row = res.data?.data
            p.resolve({ id: row?.id ?? null, policy: p.opts.policy, bypassed: false, reason })
        } else {
            await api.post(`/approvals/${p.info.requestId}/approve-pin`, { pin, reason })
            toast.success(t('approvals.approved_applied', { defaultValue: 'Aprobado y aplicado' }))
            window.dispatchEvent(new CustomEvent(APPROVAL_DECIDED_EVENT, { detail: p.info }))
        }
        setPending(null)
    }

    const value = useMemo<ApprovalGateValue>(() => ({ requestApproval, canSelfApprove }), [requestApproval, canSelfApprove])

    const title =
        pending?.kind === 'inline'
            ? pending.opts.label
            : pending?.kind === 'parked'
              ? pending.info.label || t('approvals.parked_title', { defaultValue: 'Requiere aprobación' })
              : ''

    return (
        <ApprovalGateContext.Provider value={value}>
            {children}
            <ApprovalPinDialog
                open={pending !== null}
                title={title}
                description={pending?.kind === 'inline' ? pending.opts.description : undefined}
                onSubmit={submit}
                onCancel={close}
            />
        </ApprovalGateContext.Provider>
    )
}

/**
 * Access the gate. Without a provider the gate fails CLOSED for inline requests
 * (resolves null) — never silently authorizes — but honours the capability
 * bypass, and `canSelfApprove` follows `useCan()` (always-true with no
 * <PermissionsProvider>, i.e. legacy hosts keep today's behaviour).
 */
export function useApprovalGate(): ApprovalGateValue {
    const ctx = useContext(ApprovalGateContext)
    const can = useCan()
    return useMemo<ApprovalGateValue>(
        () =>
            ctx ?? {
                canSelfApprove: (policy) => can(approvalCapability(policy)),
                requestApproval: async (opts) =>
                    can(approvalCapability(opts.policy)) ? { id: null, policy: opts.policy, bypassed: true } : null,
            },
        [ctx, can],
    )
}
