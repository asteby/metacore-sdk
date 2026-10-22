// AddonConfigSurface — the unified "Configurar addon" dialog, moved from the
// ops host (installed-addons) into the SDK so every host renders the same
// surface. It combines:
//   • Credenciales — the addon's connector credential form (secrets are
//     write-only: never read back, empty = keep the stored one). Required
//     fields up top, optional under "Avanzado"; or grouped by `form_layout`
//     (sections / steps). Saved via POST /integrations/:provider.
//   • Ajustes — the addon's settings_defs (GET/PUT /addons/:key/settings),
//     with per-branch overrides, `visible_when` and `write_only`.
//   • Probar conexión (connector.test_export) and Sincronizar ahora.
// Fixed header + footer; only the body scrolls (a connector can declare many
// fields). Everything host-specific is injected: the API client (ApiProvider
// or `client`), the admin gate (`canManageIssuer`), the active branch, the
// addon i18n bundle loader and the notifier.
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Cable, Check, CheckCircle2, Loader2, Plug, RefreshCw, Settings, XCircle } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { useApi, type ApiClient } from '../api-context'
import { evaluateVisibleWhen, getVisibleWhen } from '../dynamic-form-schema'
import type { VisibleWhen } from '../types'
import { useSetupT } from './messages'
import {
  isSecretCredential,
  missingRequired,
  parseSaveError,
  shapeMismatch,
  textOrFallback,
} from './connector-form-model'

export interface AddonSettingDef {
  key: string
  label: string
  type: string
  default_value?: unknown
  options?: { value: unknown; label: string }[]
  /** "org" (default) or "branch": each branch may override the value (POS-1). */
  scope?: string
  /** Shown only while the predicate holds against the live values. */
  visible_when?: VisibleWhen
  visibleWhen?: VisibleWhen
  /** Never read back; an empty input keeps the stored value. */
  write_only?: boolean
  /** The server holds a value for this write_only setting. */
  stored?: boolean
}

export interface AddonConfigAddon {
  addon_key: string
  manifest: {
    name: string
    display_name?: string
    settings_defs?: AddonSettingDef[]
  }
}

export interface ConnectorCredentialField {
  key: string
  type?: string // "secret" | "text" | "select" | "dynamic_select"
  required?: boolean
  secret?: boolean
  label?: string // i18n key
  description?: string // i18n key (help text)
  default?: string
  options?: { value: string; label: string }[]
  options_source?: string // dynamic_select: export the host runs to list options
  section?: string // binds to a form_layout section
}

export interface ConnectorFormLayoutSection {
  key: string
  title?: string // i18n key
  description?: string // i18n key
}
export interface ConnectorFormLayout {
  mode?: 'sections' | 'steps'
  sections?: ConnectorFormLayoutSection[]
}

export interface ConnectorEntry {
  addon_key: string
  addon_name?: string
  provider: string
  key?: string
  label?: string
  auth?: string // "token" | "oauth2"
  connected: boolean
  status?: string
  resources?: string[]
  credentials?: ConnectorCredentialField[]
  form_layout?: ConnectorFormLayout
  test_export?: string
  // ops-native connectors (e.g. `hub`) expose a route "Sincronizar ahora" POSTs to.
  sync_endpoint?: string
}

export interface AddonConfigNotifier {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
}

export interface AddonConfigSurfaceProps {
  addon: AddonConfigAddon
  connector: ConnectorEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
  /**
   * GET /integrations/:provider/values is org-admin only: pass false for other
   * roles and the credentials area explains why instead of firing the request.
   * Default true.
   */
  canManageIssuer?: boolean
  /** Active branch (for per-branch settings); null/absent hides the branch picker. */
  activeBranch?: { id: string; name?: string } | null
  /** Pulls the addon's own i18n bundle when its labels do not resolve yet. */
  ensureAddonBundle?: (addonKey: string, i18n: unknown) => void | Promise<unknown>
  /** Default: sonner `toast`. */
  notify?: AddonConfigNotifier
  /** Overrides the `useApi()` client. */
  client?: ApiClient
  /** Title name; default `manifest.display_name ?? manifest.name`. */
  displayName?: string
}

// ─── Connector credential field (reusable render) ───────────────────────────
// One connector credential field: label (i18n) + control (select|password|text)
// + optional help. Shared by the unified config dialog for both the essential
// and the advanced groups so the select/secret/label/help logic lives in a
// single place (DRY).
// Humanize an i18n key's last segment as a graceful fallback so a missing addon
// translation never surfaces the raw dotted key (e.g.
// "fiscal_mexico.connector.section.connection" → "Connection").
const humanizeKey = (k?: string) =>
  (k?.split('.').pop() ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())

// What the dialog tells every credential field: which ones failed the last save
// (highlighted + described) and the full list, so a value pasted in the wrong
// box can be spotted against the form's own fields.
interface ConnectorFormState {
  fields: ConnectorCredentialField[]
  errors: Record<string, string>
}
const ConnectorFormStateContext = createContext<ConnectorFormState>({ fields: [], errors: {} })

function ConnectorCredentialFieldControl({
  field,
  value,
  connected,
  provider,
  onChange,
}: {
  field: ConnectorCredentialField
  value: string
  connected: boolean
  provider: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const st = useSetupT()
  const form = useContext(ConnectorFormStateContext)
  // label/description are i18n keys (addon locales are loaded into i18next);
  // never surface a raw dotted key: fall back to the humanized field key.
  const humanize = (k: string) =>
    k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
  const labelOf = (f: ConnectorCredentialField) =>
    f.label ? textOrFallback(t(f.label, { defaultValue: humanize(f.key) }), f.label, humanize(f.key)) : humanize(f.key)
  const label = labelOf(field)
  const help = field.description
    ? textOrFallback(t(field.description, { defaultValue: '' }), field.description, '')
    : ''
  const isSecret = isSecretCredential(field)
  const isDynamic = field.type === 'dynamic_select' || !!field.options_source
  const error = form.errors[field.key]
  const mismatch = shapeMismatch(field, value, form.fields)
  const target = mismatch?.suggestedKey
    ? form.fields.find((f) => f.key === mismatch.suggestedKey)
    : undefined
  const warning = mismatch
    ? st(
        mismatch.shape === 'public_key'
          ? 'installed_addons.shape_public_key'
          : 'installed_addons.shape_secret_key',
        { target: target ? labelOf(target) : '' },
      )
    : ''

  return (
    <div className='flex flex-col gap-1' data-field={field.key}>
      <Label htmlFor={`cred-${field.key}`}>
        {label}
        {field.required ? <span className='text-destructive'> *</span> : null}
      </Label>
      {isDynamic ? (
        <DynamicConnectorSelect
          field={field}
          value={value}
          provider={provider}
          connected={connected}
          onChange={onChange}
        />
      ) : field.type === 'select' && field.options?.length ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={`cred-${field.key}`} aria-invalid={!!error || undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.label, { defaultValue: o.value })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={`cred-${field.key}`}
          type={isSecret ? 'password' : 'text'}
          // A secret must never be offered to (or filled by) the browser's
          // password manager: "new-password" is the value browsers respect.
          autoComplete={isSecret ? 'new-password' : 'off'}
          data-1p-ignore={isSecret ? true : undefined}
          data-lpignore={isSecret ? 'true' : undefined}
          spellCheck={false}
          autoCapitalize='off'
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `cred-${field.key}-error` : undefined}
          className={cn(error && 'border-destructive focus-visible:ring-destructive/40')}
          placeholder={connected && isSecret ? '••••••••' : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error ? (
        <p id={`cred-${field.key}-error`} role='alert' className='text-xs text-destructive'>
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className='text-xs text-amber-600 dark:text-amber-400' role='status'>
          {warning}
        </p>
      ) : null}
      {help ? <p className='text-xs text-muted-foreground'>{help}</p> : null}
    </div>
  )
}

// Shared in-flight/result cache for connector option lookups, keyed by
// provider+credential. The 3 serie fields all call the SAME export and get the
// SAME list (they only differ in client-side `tipo` filtering), so without this
// they'd fire 3 identical concurrent POST /lookup on open — 3 wasm invocations +
// 3 external GETs. This dedupes them to ONE request whose result they share.
// `force` (the refresh button) bypasses the cache to re-fetch.
type LookupOption = { value: string; label: string; tipo?: string }
// useApi() hands every component its own wrapper object, so the cache cannot be
// keyed by client: it is module-level, keyed by provider + export, and dropped
// whenever a config surface closes (a new org / credentials never reads stale).
const lookupCache = new Map<string, Promise<LookupOption[]>>()
/** Drops the shared option-lookup cache (called when the surface closes). */
export function clearConnectorLookupCache() {
  lookupCache.clear()
}
function fetchLookupOptions(
  api: ApiClient,
  provider: string,
  field: ConnectorCredentialField,
  force = false,
): Promise<LookupOption[]> {
  const key = `${provider}:${field.options_source || field.key}`
  if (!force && lookupCache.has(key)) return lookupCache.get(key)!
  const p = api
    .post(`/integrations/${provider}/lookup`, { credential: field.key })
    .then((res) => (res.data?.data?.options ?? []) as LookupOption[])
    .catch((err) => {
      lookupCache.delete(key) // don't cache failures
      throw err
    })
  lookupCache.set(key, p)
  return p
}

// A dynamic_select connector credential: the option list is fetched from the
// host, which runs the addon's `options_source` WASM export org-scoped (it reads
// the org's SAVED credentials via connector_get, e.g. lists factura.com series).
// So options only resolve once the connector is configured+saved — until then we
// show a hint and a manual free-text fallback so the field is never a dead end.
function DynamicConnectorSelect({
  field,
  value,
  provider,
  connected,
  onChange,
}: {
  field: ConnectorCredentialField
  value: string
  provider: string
  connected: boolean
  onChange: (value: string) => void
}) {
  const st = useSetupT()
  const api = useApi()
  const [options, setOptions] = useState<
    { value: string; label: string; tipo?: string }[]
  >([])
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [error, setError] = useState('')

  const load = async (force = false) => {
    setState('loading')
    setError('')
    try {
      const opts = await fetchLookupOptions(api, provider, field, force)
      setOptions(opts)
      setState('done')
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          st('installed_addons.dynamic_select_error', {
            defaultValue:
              'No se pudieron listar las opciones. Guardá la conexión y volvé a intentar.',
          }),
      )
      setState('error')
    }
  }

  // Auto-load once when the connector is already configured (editing an existing
  // connection). Fresh configs load on demand via the refresh button.
  useEffect(() => {
    if (connected && state === 'idle') void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])

  // Scope the options to the credential's document type when the source reports
  // one (serie_invoice → factura, serie_credit_note → nota_credito, …), so each
  // serie field lists only its relevant series instead of the whole catalogue.
  const EXPECTED_TIPO: Record<string, string> = {
    serie_invoice: 'factura',
    serie_credit_note: 'nota_credito',
    serie_payment_complement: 'pago',
  }
  const expected = EXPECTED_TIPO[field.key]
  const filtered =
    expected && options.some((o) => o.tipo === expected)
      ? options.filter((o) => o.tipo === expected)
      : options

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center gap-2'>
        {filtered.length > 0 ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={`cred-${field.key}`} className='flex-1'>
              <SelectValue
                placeholder={st('installed_addons.dynamic_select_choose', {
                  defaultValue: 'Elegí una opción',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {filtered.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={`cred-${field.key}`}
            value={value}
            placeholder={st('installed_addons.dynamic_select_placeholder', {
              defaultValue: 'Guardá la conexión y actualizá para elegir',
            })}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => void load(true)}
          disabled={state === 'loading'}
          title={st('installed_addons.dynamic_select_refresh', {
            defaultValue: 'Actualizar opciones',
          })}
        >
          {state === 'loading' ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <RefreshCw className='h-4 w-4' />
          )}
        </Button>
      </div>
      {state === 'error' && <p className='text-xs text-destructive'>{error}</p>}
    </div>
  )
}

// ─── Unified addon configuration dialog ─────────────────────────────────────
// One "Configuración del addon" surface per addon combining two sections:
//   • Credenciales — the addon's `token` connector credential form. Essential
//     (required) fields render up top; optional/advanced fields (base_url,
//     stamp_path, …) collapse under an "Avanzado" <details>. Saved via
//     POST /integrations/:provider (only non-empty values, so re-saving without
//     retyping a stored secret doesn't wipe it).
//   • Ajustes — the addon's settings_defs (GET/PUT /addons/:key/settings).
// Fixed header + footer, scrollable body — a connector can declare many fields
// (env, keys, RFC, régimen, CP, base_url, stamp/cancel path) that would
// otherwise overflow the viewport.
export function AddonConfigSurface({
  addon,
  connector,
  open,
  onOpenChange,
  onSaved,
  canManageIssuer = true,
  activeBranch = null,
  ensureAddonBundle,
  notify = toast,
  client,
  displayName,
}: AddonConfigSurfaceProps) {
  const { t, i18n } = useTranslation()
  const st = useSetupT()
  const hostApi = useApi()
  const api = client ?? hostApi
  const activeBranchId = activeBranch?.id ?? ''
  useEffect(() => {
    if (!open) clearConnectorLookupCache()
  }, [open])

  const credFields = connector?.credentials ?? []
  const requiredFields = credFields.filter((f) => f.required)
  const advancedFields = credFields.filter((f) => !f.required)
  // A connector with a form_layout groups its credentials into titled sections
  // (a light wizard). Fall back to the required/advanced split when absent.
  const layoutSections = connector?.form_layout?.sections ?? []
  const useLayout = layoutSections.length > 0 && credFields.some((f) => !!f.section)

  // A form_layout with mode "steps" drives a real wizard (one section at a time
  // with Atrás/Siguiente), instead of stacked cards.
  const stepMode = useLayout && connector?.form_layout?.mode === 'steps'

  const [credValues, setCredValues] = useState<Record<string, string>>({})
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>({})
  const [definitions, setDefinitions] = useState<AddonSettingDef[]>([])
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  // Last failed save: the complete message (shown in full, not as a toast that
  // cuts it) and the fields to highlight.
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const errorRef = useRef<HTMLDivElement>(null)
  const setCred = (key: string, val: string) => {
    setCredValues((v) => ({ ...v, [key]: val }))
    if (fieldErrors[key]) {
      setFieldErrors((e) => {
        const { [key]: _drop, ...rest } = e
        return rest
      })
    }
  }

  // Per-branch settings (POS-1): a setting the manifest declares `scope: branch`
  // can be overridden for the ACTIVE branch. `target` picks which level the form
  // reads/writes; in "branch" mode only the branch-scoped settings show, only the
  // ones the operator touched are saved (an untouched key keeps inheriting the org
  // value) and «Heredar de la organización» clears an override.
  const [target, setTarget] = useState<'org' | 'branch'>('org')
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const [cleared, setCleared] = useState<Set<string>>(new Set())
  const hasBranchDefs = definitions.some((d) => d.scope === 'branch')
  const canTargetBranch = !!activeBranch && hasBranchDefs
  const branchMode = target === 'branch' && canTargetBranch
  // `visible_when` (kernel Setting.visible_when) is evaluated against the live values.
  const shownDefs = (branchMode ? definitions.filter((d) => d.scope === 'branch') : definitions).filter(
    (d) => evaluateVisibleWhen(getVisibleWhen(d), settingsValues),
  )
  const setSetting = (key: string, value: unknown) => {
    setSettingsValues((prev) => ({ ...prev, [key]: value }))
    setTouched((prev) => new Set(prev).add(key))
    setCleared((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Seed connector defaults (e.g. environment = sandbox, first select option,
  // or a value the backend prefilled from the org) so selects open on their
  // default, then overlay the STORED non-secret values (GET …/values). Without
  // the overlay a configured connector reopened empty, and re-saving sent the
  // select defaults over what was stored (PIT-035: régimen reset to 601).
  // Secrets are never returned; their inputs stay blank = "keep as is".
  useEffect(() => {
    if (!open) return
    const seed: Record<string, string> = {}
    for (const f of credFields) {
      if (f.default != null && f.default !== '') seed[f.key] = String(f.default)
      else if (f.type === 'select' && f.options?.length) seed[f.key] = f.options[0].value
    }
    setCredValues(seed)
    setCurrentStep(0)
    setFormError(null)
    setFieldErrors({})
    if (!canManageIssuer || !connector?.provider || credFields.length === 0) return
    let cancelled = false
    api
      .get(`/integrations/${connector.provider}/values`)
      .then((res) => {
        const stored = (res.data?.data?.values ?? {}) as Record<string, string>
        if (cancelled) return
        // Only fields the user has not touched yet.
        setCredValues((prev) => {
          const next = { ...prev }
          for (const [k, v] of Object.entries(stored)) {
            // Write-only: a secret is never prefilled, even if a host echoes it.
            const def = credFields.find((f) => f.key === k)
            if (def && isSecretCredential(def)) continue
            if (v !== '' && prev[k] === seed[k]) next[k] = v
          }
          return next
        })
      })
      .catch(() => {
        /* older backend or no stored config: keep the defaults */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connector?.provider, canManageIssuer])

  // Load stored settings values + definitions. The backend returns the
  // manifest's setting definitions alongside the stored values; fall back to
  // the manifest we already have so custom (declarative) addons whose lifecycle
  // isn't registered still render.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    setTouched(new Set())
    setCleared(new Set())
    const branchQuery =
      target === 'branch' && activeBranch ? `?branch_id=${encodeURIComponent(activeBranchId)}` : ''
    api
      .get(`/addons/${addon.addon_key}/settings${branchQuery}`)
      .then((res) => {
        setSettingsValues(res.data?.data || {})
        setOverrides(res.data?.overrides || {})
        const defs: AddonSettingDef[] =
          res.data?.definitions?.length > 0
            ? res.data.definitions
            : (addon.manifest.settings_defs ?? [])
        setDefinitions(defs)
      })
      .catch(() => {
        setSettingsValues({})
        setDefinitions(addon.manifest.settings_defs ?? [])
      })
      .finally(() => setLoading(false))
  }, [open, addon.addon_key, target, activeBranchId])

  // The addon's texts can arrive after this dialog (installed a moment ago, or
  // the org bundle still in flight): when its labels do not resolve yet, pull
  // the addon's own bundle so the form never paints raw keys.
  useEffect(() => {
    if (!open || !connector || !ensureAddonBundle) return
    const keys = [
      ...credFields.flatMap((f) => [f.label, f.description]),
      ...layoutSections.flatMap((sec) => [sec.title, sec.description]),
    ].filter((k): k is string => !!k)
    if (keys.length === 0 || keys.every((k) => i18n.exists(k))) return
    void ensureAddonBundle?.(connector.addon_key, i18n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connector?.addon_key, credFields.length])

  const credLabel = (f: ConnectorCredentialField) => {
    const fallback = humanizeKey(f.key)
    return f.label ? textOrFallback(t(f.label, { defaultValue: fallback }), f.label, fallback) : fallback
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (connector && canManageIssuer) {
        // Only send non-empty values so re-saving without retyping a stored
        // secret leaves it untouched (server merges).
        const payload: Record<string, string> = {}
        for (const [k, v] of Object.entries(credValues)) {
          if (v != null && v !== '') payload[k] = v
        }
        await api.post(`/integrations/${connector.provider}`, payload)
      }
      if (branchMode) {
        // Only what the operator touched: an untouched key keeps inheriting.
        const payload: Record<string, unknown> = {}
        for (const k of touched) payload[k] = settingsValues[k]
        for (const k of cleared) payload[k] = null
        if (Object.keys(payload).length > 0) {
          await api.put(
            `/addons/${addon.addon_key}/settings?branch_id=${encodeURIComponent(activeBranchId)}`,
            payload,
          )
        }
      } else if (definitions.length > 0) {
        // write_only settings are never read back: send them only when typed.
        const payload: Record<string, unknown> = { ...settingsValues }
        for (const d of definitions) {
          if (d.write_only && !touched.has(d.key)) delete payload[d.key]
        }
        await api.put(`/addons/${addon.addon_key}/settings`, payload)
      }
    },
    onSuccess: () => {
      setFormError(null)
      setFieldErrors({})
      notify.success(st('installed_addons.config_saved'))
      onOpenChange(false)
      onSaved?.()
    },
    onError: (err: unknown) => {
      const { message, fieldKeys } = parseSaveError(err, st('installed_addons.settings_error'))
      const known = new Set(credFields.map((f) => f.key))
      const errs: Record<string, string> = {}
      for (const k of fieldKeys) {
        const f = credFields.find((c) => c.key === k)
        if (known.has(k) && f) {
          errs[k] = st('installed_addons.field_required', {
            defaultValue: 'Falta completar este campo.',
          })
        }
      }
      setFieldErrors(errs)
      setFormError(message)
      focusFirstInvalid(Object.keys(errs))
    },
  })

  // Brings the first failed field into view and focuses it; in a stepper it
  // also jumps to the step that holds it.
  const focusFirstInvalid = (keys: string[]) => {
    const first = keys[0]
    if (!first) {
      window.setTimeout(() => errorRef.current?.scrollIntoView({ block: 'nearest' }), 0)
      return
    }
    const sectionKey = credFields.find((f) => f.key === first)?.section
    if (sectionKey) {
      const idx = layoutSections.findIndex((sec) => sec.key === sectionKey)
      if (idx >= 0) setCurrentStep(idx)
    }
    window.setTimeout(() => {
      const el = document.getElementById(`cred-${first}`)
      el?.closest('details')?.setAttribute('open', '')
      el?.scrollIntoView({ block: 'center' })
      el?.focus()
    }, 50)
  }

  // Check what is certain before the round trip, so the operator sees WHICH
  // field is missing instead of a generic failure.
  const handleSave = () => {
    setFormError(null)
    if (connector && canManageIssuer) {
      const miss = missingRequired(credFields, credValues, !!connector.connected)
      if (miss.length > 0) {
        const errs: Record<string, string> = {}
        for (const k of miss) {
          errs[k] = st('installed_addons.field_required', { defaultValue: 'Falta completar este campo.' })
        }
        setFieldErrors(errs)
        setFormError(
          st('installed_addons.missing_fields', {
            fields: miss.map((k) => credLabel(credFields.find((f) => f.key === k)!)).join(', '),
            defaultValue: 'Faltan campos obligatorios: {{fields}}.',
          }),
        )
        focusFirstInvalid(miss)
        return
      }
    }
    setFieldErrors({})
    saveMutation.mutate()
  }

  // "Probar conexión": runs the connector's test_export health-check against the
  // SAVED credentials (connector_get reads what's stored), so it validates a
  // real round-trip to the provider without saving a stamp/order.
  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/integrations/${connector?.provider}/test`, {})
      return res.data?.data as { ok?: boolean; message?: string } | undefined
    },
    onSuccess: (data) => {
      if (data?.ok) {
        notify.success(
          data.message ||
            st('installed_addons.test_ok', { defaultValue: 'Conexión válida' }),
        )
      } else {
        notify.error(
          data?.message ||
            st('installed_addons.test_failed', { defaultValue: 'No se pudo conectar' }),
        )
      }
    },
    onError: (err: any) =>
      notify.error(err.response?.data?.message || st('installed_addons.settings_error')),
  })

  // "Sincronizar ahora": ops-native connectors with a sync worker (hub →
  // partner read-models) run one sync now and report the run summary.
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(connector?.sync_endpoint ?? '', {})
      return res.data?.data as
        | {
            status?: string
            message?: string
            licenses?: { fetched?: number }
            instances?: { fetched?: number }
            accounts?: { fetched?: number }
            errors?: string[]
          }
        | undefined
    },
    onSuccess: (data) => {
      if (data?.status === 'skipped') {
        notify.info(data.message || st('installed_addons.sync_skipped'))
        return
      }
      const summary = st('installed_addons.sync_done', {
        licenses: data?.licenses?.fetched ?? 0,
        instances: data?.instances?.fetched ?? 0,
        accounts: data?.accounts?.fetched ?? 0,
      })
      if (data?.status === 'partial') {
        notify.warning(`${summary} · ${(data.errors ?? []).join('; ')}`)
      } else {
        notify.success(summary)
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      notify.error(msg || st('installed_addons.sync_failed'))
    },
  })

  const hasCredentials = credFields.length > 0
  const hasSettings = definitions.length > 0
  const canTest = !!connector?.test_export && canManageIssuer
  const issuerAdminNote = (
    <p className='text-sm text-muted-foreground'>
      {st('installed_addons.issuer_admin_only', {
        defaultValue:
          'Solo un administrador de la organización puede ver y guardar los datos del emisor y el certificado. Pide a un administrador que los configure.',
      })}
    </p>
  )
  const canSync = !!connector?.sync_endpoint && !!connector?.connected

  const renderCred = (f: ConnectorCredentialField) => (
    <ConnectorCredentialFieldControl
      key={f.key}
      field={f}
      connected={!!connector?.connected}
      provider={connector?.provider ?? ''}
      value={credValues[f.key] ?? ''}
      onChange={(val) => setCred(f.key, val)}
    />
  )

  // One setting control, shared by the flat layout and the wizard's last step.
  const renderSetting = (def: AddonSettingDef) => {
    const id = `setting-${def.key}`
    const value = settingsValues[def.key] ?? def.default_value
    const isCleared = cleared.has(def.key)
    const overridden = branchMode && def.key in overrides && !isCleared
    return (
      <div key={def.key} className='flex flex-col gap-2'>
        <div className='flex items-center gap-2'>
          <Label htmlFor={id}>{def.label || def.key}</Label>
          {def.scope === 'branch' && !branchMode && (
            <Badge variant='outline' className='text-[10px]'>
              {st('installed_addons.per_branch')}
            </Badge>
          )}
          {branchMode && (
            <span className='text-muted-foreground text-xs'>
              {isCleared
                ? st('installed_addons.inherit_pending')
                : overridden || touched.has(def.key)
                  ? st('installed_addons.branch_own')
                  : st('installed_addons.branch_inherited')}
            </span>
          )}
          {branchMode && (overridden || touched.has(def.key)) && !isCleared && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0 text-xs'
              onClick={() => setCleared((prev) => new Set(prev).add(def.key))}
            >
              {st('installed_addons.inherit')}
            </Button>
          )}
        </div>
        {def.type === 'boolean' ? (
          <Switch
            id={id}
            checked={!!value}
            onCheckedChange={(checked) => setSetting(def.key, checked)}
          />
        ) : def.type === 'select' && (def.options?.length ?? 0) > 0 ? (
          <Select value={String(value ?? '')} onValueChange={(v) => setSetting(def.key, v)}>
            <SelectTrigger id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {def.options!.map((o) => (
                <SelectItem key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : def.write_only ? (
          <>
            <Input
              id={id}
              type='password'
              autoComplete='new-password'
              data-1p-ignore
              data-lpignore='true'
              spellCheck={false}
              placeholder={def.stored ? '••••••••' : ''}
              value={touched.has(def.key) ? String(settingsValues[def.key] ?? '') : ''}
              onChange={(e) => setSetting(def.key, e.target.value)}
            />
            {def.stored ? (
              <p className='text-xs text-muted-foreground'>{st('installed_addons.secret_stored')}</p>
            ) : null}
          </>
        ) : (
          <Input
            id={id}
            type={def.type === 'number' ? 'number' : 'text'}
            value={String(value ?? '')}
            onChange={(e) =>
              setSetting(def.key, def.type === 'number' ? Number(e.target.value) : e.target.value)
            }
          />
        )}
      </div>
    )
  }

  // Which level the settings form edits (only offered when the addon has
  // branch-scoped settings and a specific branch is active).
  const targetPicker = canTargetBranch ? (
    <div className='flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm'>
      <span className='text-muted-foreground'>
        {st('installed_addons.applies_to')}
      </span>
      <Button
        type='button'
        size='sm'
        variant={branchMode ? 'outline' : 'default'}
        onClick={() => setTarget('org')}
      >
        {st('installed_addons.whole_org')}
      </Button>
      <Button
        type='button'
        size='sm'
        variant={branchMode ? 'default' : 'outline'}
        onClick={() => setTarget('branch')}
      >
        {st('installed_addons.only_branch', { name: activeBranch?.name, defaultValue: 'Solo {{name}}' })}
      </Button>
    </div>
  ) : null

  // Settings (Ajustes) body, reused by the flat layout and the wizard's last step.
  const settingsBody = (
    <div className='flex flex-col gap-3'>
      {targetPicker}
      {shownDefs.map(renderSetting)}
    </div>
  )

  // Wizard steps: credential sections that actually have fields, + a final
  // "Ajustes" step when the addon also ships settings.
  const credSteps = stepMode
    ? layoutSections.filter((sec) => credFields.some((f) => f.section === sec.key))
    : []
  const wizardSteps = [
    ...credSteps.map((sec) => ({
      key: sec.key,
      title: sec.title,
      description: sec.description,
      kind: 'creds' as const,
    })),
    ...(stepMode && hasSettings
      ? [{ key: '__settings', title: 'installed_addons.section_settings', description: undefined, kind: 'settings' as const }]
      : []),
  ]
  const totalSteps = wizardSteps.length
  const useStepper = stepMode && totalSteps > 1
  const stepIdx = Math.min(currentStep, Math.max(0, totalSteps - 1))
  const activeStep = wizardSteps[stepIdx]
  const isLastStep = stepIdx >= totalSteps - 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col'>
       <ConnectorFormStateContext.Provider value={{ fields: credFields, errors: fieldErrors }}>
        <DialogHeader className='shrink-0'>
          <DialogTitle>
            {st('installed_addons.configure_title', { name: displayName ?? addon.manifest.display_name ?? addon.manifest.name })}
          </DialogTitle>
          <DialogDescription>
            {st('installed_addons.configure_description')}
          </DialogDescription>
        </DialogHeader>

        <div className='-mr-2 flex flex-col gap-6 overflow-y-auto py-2 pr-2'>
          {loading ? (
            <div className='flex justify-center py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
            </div>
          ) : useStepper ? (
            /* WIZARD por pasos: indicador + un paso a la vez (sin card-in-card). */
            <div className='flex flex-col gap-5'>
              {/* Pro stepper: filled progress line + check on done + ringed active,
                  no inline labels (never wraps); the active step title sits below. */}
              <div className='flex flex-col gap-2.5'>
                <ol className='flex items-center'>
                  {wizardSteps.map((s, i) => {
                    const done = i < stepIdx
                    const active = i === stepIdx
                    return (
                      <li
                        key={s.key}
                        className={cn(
                          'flex items-center',
                          i < wizardSteps.length - 1 && 'flex-1',
                        )}
                      >
                        <button
                          type='button'
                          onClick={() => setCurrentStep(i)}
                          title={t(s.title ?? '', { defaultValue: humanizeKey(s.title) })}
                          aria-current={active ? 'step' : undefined}
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all',
                            active
                              ? 'border-primary bg-primary text-primary-foreground ring-4 ring-primary/15'
                              : done
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground',
                          )}
                        >
                          {done ? <Check className='h-3.5 w-3.5' /> : i + 1}
                        </button>
                        {i < wizardSteps.length - 1 && (
                          <span
                            className={cn(
                              'mx-1.5 h-0.5 flex-1 rounded-full transition-colors',
                              done ? 'bg-primary' : 'bg-border',
                            )}
                          />
                        )}
                      </li>
                    )
                  })}
                </ol>
                <div className='flex items-baseline justify-between gap-2'>
                  <h4 className='truncate text-sm font-semibold'>
                    {t(activeStep?.title ?? '', {
                      defaultValue: humanizeKey(activeStep?.title),
                    })}
                  </h4>
                  <span className='shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground'>
                    {stepIdx + 1} / {totalSteps}
                  </span>
                </div>
              </div>

              <div className='flex flex-col gap-3'>
                {activeStep?.description && (
                  <p className='text-xs text-muted-foreground'>
                    {t(activeStep.description, { defaultValue: '' })}
                  </p>
                )}
                {activeStep?.kind === 'settings'
                  ? settingsBody
                  : !canManageIssuer
                    ? issuerAdminNote
                    : credFields
                      .filter((f) => f.section === activeStep?.key)
                      .map(renderCred)}
              </div>
            </div>
          ) : (
            <>
              {/* Credenciales */}
              {hasCredentials && (
                <section className='flex flex-col gap-3'>
                  <div className='flex items-center gap-2'>
                    <Cable className='h-4 w-4 text-muted-foreground' />
                    <h3 className='text-sm font-semibold'>
                      {st('installed_addons.section_credentials')}
                    </h3>
                  </div>
                  {!canManageIssuer ? (
                    issuerAdminNote
                  ) : useLayout ? (
                    // form_layout: one titled group per section, in declared order.
                    layoutSections.map((sec) => {
                      const fields = credFields.filter((f) => f.section === sec.key)
                      if (fields.length === 0) return null
                      return (
                        <div
                          key={sec.key}
                          className='flex flex-col gap-3 rounded-md border border-border/60 px-3 py-3'
                        >
                          {sec.title && (
                            <div>
                              <h4 className='text-sm font-medium'>
                                {t(sec.title, { defaultValue: sec.title })}
                              </h4>
                              {sec.description && (
                                <p className='text-xs text-muted-foreground'>
                                  {t(sec.description, { defaultValue: '' })}
                                </p>
                              )}
                            </div>
                          )}
                          {fields.map((f) => (
                            <ConnectorCredentialFieldControl
                              key={f.key}
                              field={f}
                              connected={!!connector?.connected}
                              provider={connector?.provider ?? ''}
                              value={credValues[f.key] ?? ''}
                              onChange={(val) => setCred(f.key, val)}
                            />
                          ))}
                        </div>
                      )
                    })
                  ) : (
                    <>
                      {requiredFields.map((f) => (
                        <ConnectorCredentialFieldControl
                          key={f.key}
                          field={f}
                          connected={!!connector?.connected}
                          provider={connector?.provider ?? ''}
                          value={credValues[f.key] ?? ''}
                          onChange={(val) => setCred(f.key, val)}
                        />
                      ))}
                      {advancedFields.length > 0 && (
                        <details
                          className='rounded-md border border-border/60 px-3 py-2'
                          open={advancedFields.some((f) => !!fieldErrors[f.key]) || undefined}
                        >
                          <summary className='cursor-pointer select-none text-sm font-medium text-muted-foreground'>
                            {st('installed_addons.advanced')}
                          </summary>
                          <div className='flex flex-col gap-3 pt-3'>
                            {advancedFields.map((f) => (
                              <ConnectorCredentialFieldControl
                                key={f.key}
                                field={f}
                                connected={!!connector?.connected}
                                provider={connector?.provider ?? ''}
                                value={credValues[f.key] ?? ''}
                                onChange={(val) => setCred(f.key, val)}
                              />
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* Ajustes */}
              {hasSettings && (
                <section className='flex flex-col gap-3'>
                  <div className='flex items-center gap-2'>
                    <Settings className='h-4 w-4 text-muted-foreground' />
                    <h3 className='text-sm font-semibold'>
                      {st('installed_addons.section_settings')}
                    </h3>
                  </div>
                  {targetPicker}
                  {shownDefs.map(renderSetting)}
                </section>
              )}

              {!hasCredentials && !hasSettings && (
                <p className='text-sm text-muted-foreground'>
                  {st('installed_addons.no_settings')}
                </p>
              )}
            </>
          )}
        </div>

        {formError ? (
          <div
            ref={errorRef}
            role='alert'
            className='max-h-40 shrink-0 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
          >
            {formError}
          </div>
        ) : null}

        <DialogFooter className='shrink-0 sm:justify-between'>
          {canTest ? (
            <Button
              variant='outline'
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
              className='gap-2'
            >
              {testMutation.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : testMutation.data?.ok ? (
                <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              ) : testMutation.isError ||
                (testMutation.data && !testMutation.data.ok) ? (
                <XCircle className='h-4 w-4 text-destructive' />
              ) : (
                <Plug className='h-4 w-4' />
              )}
              {st('installed_addons.test_connection', {
                defaultValue: 'Probar conexión',
              })}
            </Button>
          ) : (
            <span />
          )}
          {canSync ? (
            <Button
              variant='outline'
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className='gap-2'
            >
              {syncMutation.isPending ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='h-4 w-4' />
              )}
              {st('installed_addons.sync_now', { defaultValue: 'Sincronizar ahora' })}
            </Button>
          ) : null}
          <div className='flex gap-2'>
            {useStepper && stepIdx > 0 && (
              <Button
                variant='outline'
                onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
              >
                {st('common.back', { defaultValue: 'Atrás' })}
              </Button>
            )}
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              {st('common.cancel')}
            </Button>
            {useStepper && !isLastStep ? (
              <Button onClick={() => setCurrentStep((s) => s + 1)}>
                {st('common.next', { defaultValue: 'Siguiente' })}
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={
                  saveMutation.isPending || loading || (!hasCredentials && !hasSettings)
                }
              >
                {saveMutation.isPending && (
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                )}
                {st('common.save')}
              </Button>
            )}
          </div>
        </DialogFooter>
       </ConnectorFormStateContext.Provider>
      </DialogContent>
    </Dialog>
  )
}