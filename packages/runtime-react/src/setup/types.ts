// Wire shapes for `contributions.setup` / `contributions.health` and the
// adapter the host provides to drive a setup flow. Pure types: importing this
// file costs nothing at runtime.
import type { FormLayout } from '../form-layout'
import type { VisibleWhen } from '../types'

export type StepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error' | 'blocked'
export type SetupStepKind = 'check' | 'form' | 'action' | 'records' | 'custom'

/** What the "fix" button of a diagnostic does. Exactly one is expected. */
export interface SetupFix {
    label?: string
    /** Runs a server action on the step (`runStep(step, { action })`). */
    action?: string
    /** Opens a link (http(s) or an app-relative path). */
    url?: string
    /** Jumps to another step of the flow. */
    step?: string
}

export type DiagnosticSeverity = 'info' | 'warn' | 'error'

export interface SetupDiagnostic {
    code?: string
    severity?: DiagnosticSeverity
    message: string
    detail?: string
    fix?: SetupFix
}

export type RecordStatus = 'ok' | 'missing' | 'wrong_value' | 'propagating' | 'pending' | 'error'

/** One row of a records step (typically a DNS record to publish). */
export interface SetupRecord {
    id?: string
    type: string
    name: string
    value: string
    status?: RecordStatus
    /** Human explanation for the row's state. */
    diagnostic?: string | SetupDiagnostic
    /** What the server actually found, when it differs. */
    found?: string
    ttl?: number
    priority?: number
}

export type SetupFieldType = 'text' | 'secret' | 'number' | 'boolean' | 'select' | 'textarea'

export interface SetupField {
    key: string
    type?: SetupFieldType
    label?: string
    description?: string
    placeholder?: string
    required?: boolean
    /** Value is never read back from the server; empty input keeps the stored one. */
    write_only?: boolean
    default?: unknown
    options?: { value: string; label: string }[]
    /** `form_layout` section this field belongs to. */
    section?: string
    visible_when?: VisibleWhen
}

export interface SetupStepDef {
    key: string
    kind: SetupStepKind
    title: string
    description?: string
    depends_on?: string[]
    optional?: boolean
    /** kind=form */
    fields?: SetupField[]
    form_layout?: FormLayout
    /** kind=action / check / records: label of the main button. */
    action_label?: string
    /** kind=custom: federated slot name (default `setup.<flow>.<step>`). */
    slot?: string
}

export interface SetupFlowDef {
    key?: string
    title?: string
    description?: string
    steps: SetupStepDef[]
}

export interface SetupStepState {
    key: string
    status: StepStatus
    message?: string
    diagnostics?: SetupDiagnostic[]
    records?: SetupRecord[]
    /** Non-secret saved values (kind=form). */
    values?: Record<string, unknown>
    /** write_only fields that already hold a stored value. */
    stored_keys?: string[]
    /** Server hint: poll again after this many seconds. */
    retry_after_s?: number
    skipped?: boolean
    updated_at?: string
}

export interface SetupFlowState {
    steps: SetupStepState[] | Record<string, SetupStepState>
    /** Server's own verdict; otherwise derived from the steps. */
    completed?: boolean
}

export interface RunStepInput {
    values?: Record<string, unknown>
    action?: string
}

/** What the host plugs in. The server owns the state; the UI is resumable. */
export interface SetupFlowClient {
    getState(): Promise<SetupFlowState>
    /** May answer the new step state, the whole flow state, or nothing (then the state is re-read). */
    runStep(key: string, input?: RunStepInput): Promise<SetupStepState | SetupFlowState | void>
    skipStep(key: string): Promise<SetupStepState | SetupFlowState | void>
    /** Autosave of a form step's draft (non-final). Absent → no autosave. */
    saveStep?(key: string, values: Record<string, unknown>): Promise<void>
    /** Push channel (SSE/WS). Returns the unsubscribe. Polling still covers a missed push. */
    subscribe?(onState: (state: SetupFlowState) => void): () => void
}

// ─── Health ─────────────────────────────────────────────────────────────────
export type HealthStatus = 'ok' | 'warn' | 'error' | 'unknown'
export type MetricTone = 'neutral' | 'good' | 'warn' | 'bad'

export interface HealthMetric {
    key: string
    label: string
    value: string | number
    unit?: string
    tone?: MetricTone
    hint?: string
}

export interface HealthIssue {
    id?: string
    severity: DiagnosticSeverity
    message: string
    detail?: string
    fix?: SetupFix
}
