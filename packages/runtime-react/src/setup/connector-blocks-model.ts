// Pure model of the connector setup blocks (kernel
// `connectors[].form_layout.sections[].blocks`, manifest/v3/connector_blocks.go)
// and of the wizard built from a connector form_layout. No React here: the
// components and the tests share these helpers.
import type { StepStatus } from './types'

export type ConnectorBlockKind = 'webhook_url' | 'instructions' | 'action'

export interface ConnectorBlockLink {
  label: string
  url: string
}

/** One non-input element of a connector setup step, as the host serves it. */
export interface ConnectorFormBlock {
  key: string
  kind: ConnectorBlockKind | string
  title?: string
  description?: string
  /** kind=webhook_url: webhooks[].key (the host fills `value`). */
  webhook?: string
  links?: ConnectorBlockLink[]
  /** kind=action: wasm export the host runs. */
  export?: string
  /** kind=action: button text (literal or i18n key). */
  label?: string
  /** Host-computed value (kind=webhook_url: the org's absolute URL). */
  value?: string
}

export type BlockDetailKind = 'text' | 'id' | 'url'

export interface BlockResultDetail {
  key?: string
  label?: string
  value: string
  kind?: BlockDetailKind | string
}

/** Normalized outcome of an action block run. */
export interface BlockResult {
  status: StepStatus
  message: string
  details: BlockResultDetail[]
}

const STATUSES: StepStatus[] = ['pending', 'running', 'ok', 'warn', 'error', 'blocked']

/** Only absolute https URLs are ever turned into links. */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || !u.host || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Reads what an action export (or a connector test_export) answered. Accepts
 * the kernel envelope `{success, data, error}` or a bare `data`. Never invents
 * success: anything without an explicit ok/ok-status is an error.
 */
export function normalizeBlockResult(raw: unknown, fallbackError = ''): BlockResult {
  const env = (raw ?? {}) as Record<string, any>
  const hasEnvelope = 'success' in env || 'data' in env || 'error' in env
  if (hasEnvelope && env.success === false) {
    const msg = env.error?.message ?? env.message ?? fallbackError
    return { status: 'error', message: String(msg ?? ''), details: [] }
  }
  const data = ((hasEnvelope ? env.data : env) ?? {}) as Record<string, any>
  let status: StepStatus
  if (typeof data.status === 'string' && (STATUSES as string[]).includes(data.status)) {
    status = data.status as StepStatus
  } else {
    status = data.ok === true ? 'ok' : 'error'
  }
  // An explicit ok:false wins over a status that claims success.
  if (data.ok === false && (status === 'ok' || status === 'warn')) status = 'error'
  const details: BlockResultDetail[] = Array.isArray(data.details)
    ? data.details
        .filter((d: any) => d && (typeof d.value === 'string' || typeof d.value === 'number'))
        .slice(0, 12)
        .map((d: any) => ({
          key: typeof d.key === 'string' ? d.key : undefined,
          label: typeof d.label === 'string' ? d.label : undefined,
          value: String(d.value),
          kind: d.kind === 'id' || d.kind === 'url' ? d.kind : 'text',
        }))
    : []
  const message = typeof data.message === 'string' && data.message ? data.message : status === 'error' ? fallbackError : ''
  return { status, message, details }
}

/** Message of a failed HTTP call (axios-like error), or the fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string; error?: { message?: string } } }; message?: string }
  return e?.response?.data?.message || e?.response?.data?.error?.message || fallback
}

export interface WizardSectionInput {
  key: string
  title?: string
  description?: string
  blocks?: ConnectorFormBlock[]
}

export interface WizardStep {
  key: string
  title?: string
  description?: string
  kind: 'creds' | 'settings'
  blocks: ConnectorFormBlock[]
}

/**
 * Wizard steps of a connector form_layout: every section that has fields OR
 * blocks (a step that only shows the webhook URL and a test is a real step),
 * plus a final "Ajustes" step when the addon ships settings.
 */
export function buildWizardSteps(
  sections: WizardSectionInput[],
  fieldSections: (string | undefined)[],
  hasSettings: boolean,
  settingsTitle = 'installed_addons.section_settings',
): WizardStep[] {
  const withFields = new Set(fieldSections.filter(Boolean))
  const steps: WizardStep[] = sections
    .filter((s) => withFields.has(s.key) || (s.blocks?.length ?? 0) > 0)
    .map((s) => ({ key: s.key, title: s.title, description: s.description, kind: 'creds', blocks: s.blocks ?? [] }))
  if (hasSettings) steps.push({ key: '__settings', title: settingsTitle, kind: 'settings', blocks: [] })
  return steps
}

/** Whether an explicit action block already runs the connector's test_export. */
export function hasExplicitTest(sections: WizardSectionInput[], testExport?: string): boolean {
  if (!testExport) return false
  return sections.some((s) => (s.blocks ?? []).some((b) => b.kind === 'action' && b.export === testExport))
}

/**
 * Status of a wizard step for the stepper: an error (failed field or action)
 * wins; then a finished verification; then "visited".
 */
export function stepStatus(opts: {
  index: number
  current: number
  fieldKeys: string[]
  fieldErrors: Record<string, string>
  blockKeys: string[]
  results: Record<string, BlockResult | undefined>
}): StepStatus {
  const { index, current, fieldKeys, fieldErrors, blockKeys, results } = opts
  if (fieldKeys.some((k) => !!fieldErrors[k])) return 'error'
  const rs = blockKeys.map((k) => results[k]).filter(Boolean) as BlockResult[]
  if (rs.some((r) => r.status === 'error' || r.status === 'blocked')) return 'error'
  if (rs.some((r) => r.status === 'warn')) return 'warn'
  if (rs.length > 0 && rs.every((r) => r.status === 'ok')) return 'ok'
  if (index < current) return 'ok'
  return 'pending'
}
