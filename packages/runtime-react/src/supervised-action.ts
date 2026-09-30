// Supervisor authorization for actions that declare `supervisor_policy`
// (POS-2 / PER-2). The served action metadata carries `supervisorPolicy`; before
// dispatching, the action modals call `useSupervisor().authorize(action, …)`:
//   - a caller who holds `general.approve_<policy>` (or is admin) passes straight
//     through (the server bypasses them too);
//   - anyone else gets the PIN dialog (ApprovalGate) and the resulting grant id
//     travels as `approval_id` in the action payload, where the host redeems it
//     (single use, same caller, fresh, same record — kernel ConsumePINGrant).
// The grant is anchored to the record so it cannot be spent on another document.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useApprovalGate } from './approval-gate'

export interface SupervisedAction {
    label?: string
    supervisorPolicy?: string
}

export interface SupervisorAuthorization {
    /** Grant id to send as `approval_id`; undefined when the caller bypassed. */
    approvalId?: string
}

export interface AuthorizeOptions {
    model?: string
    recordId?: string
    /** Free-form audit data stored with the grant (document folio, motive…). */
    context?: Record<string, unknown>
    description?: React.ReactNode
}

/**
 * Resolves the authorization for `action`, `{}` when it needs none, or null when
 * the operator cancelled the PIN prompt (do NOT dispatch).
 */
export function useSupervisor() {
    const gate = useApprovalGate()
    const { t } = useTranslation()
    const authorize = useCallback(
        async (action: SupervisedAction, opts: AuthorizeOptions = {}): Promise<SupervisorAuthorization | null> => {
            const policy = action.supervisorPolicy
            if (!policy) return {}
            const grant = await gate.requestApproval({
                policy,
                label: action.label || t(`approvals.policy.${policy}`, { defaultValue: 'Requiere autorización' }),
                description:
                    opts.description ??
                    t('approvals.supervisor_needed', { defaultValue: 'Esta acción necesita la autorización de un supervisor.' }),
                context: opts.context,
                model: opts.model,
                recordId: opts.recordId,
            })
            if (!grant) return null
            return grant.bypassed || !grant.id ? {} : { approvalId: grant.id }
        },
        [gate, t],
    )
    return { authorize }
}

/** Adds `approval_id` to an action payload when a grant was collected. */
export function withApproval<T extends Record<string, unknown>>(
    payload: T,
    auth: SupervisorAuthorization | null | undefined,
): T & { approval_id?: string } {
    return auth?.approvalId ? { ...payload, approval_id: auth.approvalId } : payload
}
