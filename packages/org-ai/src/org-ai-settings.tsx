import { useEffect, useState } from 'react'
import { Button, Card, CardContent, Input, Label } from '@asteby/metacore-ui'
import {
  requestErrorMessage,
  useOrgAIConfig,
  useUpdateOrgAIConfig,
  useUpdateUserAISource,
} from './api'
import { ClaudeConnectDialog } from './claude-connect-dialog'
import { makeTr } from './i18n'
import { DEFAULT_PROVIDERS, FallbackProviderIcon, type ProviderPreset } from './providers'
import type { ClaudeConnectApi, Notifier, OrgAIApi, TranslateFn } from './types'

export interface OrgAISettingsProps {
  api: OrgAIApi
  t?: TranslateFn
  /** Provider cards; defaults to {@link DEFAULT_PROVIDERS}. */
  providers?: ProviderPreset[]
  /** Enables the Claude connect flow (seat card + dialog). Omit to hide it. */
  claudeConnect?: { api: ClaudeConnectApi; seatId?: string; openUrl?: (url: string) => void }
  /** Optional toast bridge; inline status is always rendered. */
  notify?: Notifier
  /** Hide the heading when the host already renders one. */
  hideHeading?: boolean
  className?: string
}

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

/**
 * Per-organization AI settings: provider card, endpoint/model, API key (write
 * only) and optional Claude connection. States: loading, error (retry), empty
 * (no providers), ready, saving.
 */
export function OrgAISettings({
  api,
  t,
  providers = DEFAULT_PROVIDERS,
  claudeConnect,
  notify,
  hideHeading,
  className,
}: OrgAISettingsProps) {
  const tr = makeTr(t)
  const { data, isLoading, isError, refetch } = useOrgAIConfig(api)
  const update = useUpdateOrgAIConfig(api)
  const updateSource = useUpdateUserAISource(api)
  const [mode, setMode] = useState<string>(providers[0]?.id ?? '')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [claudeDialog, setClaudeDialog] = useState(false)

  const pickable = (id: string | undefined) => providers.find((p) => p.id === id)
  useEffect(() => {
    if (!data) return
    const preset = pickable(data.mode) ?? providers[0]
    if (!preset) return
    setMode(preset.id)
    setBaseURL(data.proxy_base_url || data.effective_proxy_url || preset.defaultURL)
    setModel(data.proxy_model || preset.defaultModel)
    setApiKey('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const selected = pickable(mode)
  const seats = data?.seats
  const seatReady = (p?: ProviderPreset) => (p?.seatId && seats ? seats[p.seatId]?.ready !== false : true)
  const claudeSeatId = claudeConnect?.seatId ?? 'claude_code'
  const claudeSeat = claudeConnect ? seats?.[claudeSeatId] : undefined

  const say = (kind: 'ok' | 'error', text: string) => {
    setStatus({ kind, text })
    if (kind === 'ok') notify?.success(text)
    else notify?.error(text)
  }

  const pick = (p: ProviderPreset) => {
    setMode(p.id)
    if (p.needsEndpoint) {
      setBaseURL(p.defaultURL)
      setModel(p.defaultModel)
    }
  }

  const save = async () => {
    if (!selected) return
    setStatus(null)
    try {
      await update.mutateAsync({
        mode,
        base_url: selected.needsEndpoint ? baseURL : undefined,
        model: selected.needsEndpoint ? model : undefined,
        api_key: selected.needsKey && apiKey ? apiKey : undefined,
      })
      say('ok', tr('org_ai.saved'))
      setApiKey('')
    } catch (e) {
      say('error', requestErrorMessage(e) ?? tr('org_ai.save_error'))
    }
  }

  let content
  if (isLoading) {
    content = (
      <p role="status" aria-busy="true" className="text-sm text-muted-foreground">
        {tr('org_ai.loading')}
      </p>
    )
  } else if (isError) {
    content = (
      <div role="alert" className="flex flex-col items-start gap-3 text-sm">
        <p className="text-destructive">{tr('org_ai.load_error')}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {tr('org_ai.retry')}
        </Button>
      </div>
    )
  } else if (providers.length === 0) {
    content = (
      <p role="status" className="text-sm text-muted-foreground">
        {tr('org_ai.empty')}
      </p>
    )
  } else {
    content = (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{tr('org_ai.intro')}</p>
        <div
          role="radiogroup"
          aria-label={tr('org_ai.providers_label')}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {providers.map((p) => {
            const Icon = p.icon ?? FallbackProviderIcon
            const active = mode === p.id
            const seat = p.seatId ? seats?.[p.seatId] : undefined
            const notReady = seat != null && !seat.ready
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={notReady}
                onClick={() => pick(p)}
                className={cx(
                  'rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/40',
                  notReady && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                )}
              >
                <Icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" />
                <p className="font-medium leading-none">
                  {tr(`org_ai.providers.${p.id}.title`, undefined, p.title ?? p.id)}
                </p>
                {(p.subtitle || tr(`org_ai.providers.${p.id}.subtitle`, undefined, '') !== '') && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {tr(`org_ai.providers.${p.id}.subtitle`, undefined, p.subtitle ?? '')}
                  </p>
                )}
                {seat && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {seat.ready ? tr('org_ai.seat.ready') : tr('org_ai.seat.not_ready')}
                    {seat.ready && seat.account ? ` · ${seat.account}` : ''}
                  </p>
                )}
              </button>
            )
          })}
        </div>

        {claudeConnect && claudeSeat && (
          <div className="flex items-center justify-between gap-3 rounded-xl border p-4 text-sm">
            <div>
              <p className="font-medium">{tr('org_ai.providers.claude_code.title')}</p>
              <p className="text-xs text-muted-foreground">
                {claudeSeat.ready
                  ? `${tr('org_ai.seat.ready')}${claudeSeat.account ? ` · ${claudeSeat.account}` : ''}`
                  : tr('org_ai.seat.not_ready')}
              </p>
            </div>
            <Button
              type="button"
              variant={claudeSeat.ready ? 'outline' : 'default'}
              onClick={() => setClaudeDialog(true)}
            >
              {claudeSeat.ready ? tr('org_ai.claude_connect.reconnect') : tr('org_ai.claude_connect.connect_cta')}
            </Button>
          </div>
        )}

        {api.updateUserSource && data?.user_ai_source !== undefined && (
          <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={data.user_ai_source === 'local'}
              disabled={updateSource.isPending}
              onChange={(e) => {
                void updateSource
                  .mutateAsync(e.target.checked ? 'local' : 'inherit')
                  .catch(() => say('error', tr('org_ai.save_error')))
              }}
            />
            <span>
              <span className="font-medium">{tr('org_ai.user_source.title')}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{tr('org_ai.user_source.hint')}</span>
            </span>
          </label>
        )}

        {selected?.needsEndpoint && (
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="org-ai-base-url">{tr('org_ai.fields.base_url')}</Label>
                <Input
                  id="org-ai-base-url"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  placeholder={selected.defaultURL}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-ai-model">{tr('org_ai.fields.model')}</Label>
                <Input
                  id="org-ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={selected.defaultModel}
                  autoComplete="off"
                />
              </div>
              {selected.needsKey && (
                <div className="space-y-2">
                  <Label htmlFor="org-ai-key">{tr('org_ai.fields.api_key')}</Label>
                  <Input
                    id="org-ai-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={data?.has_api_key ? tr('org_ai.fields.api_key_kept') : 'sk-...'}
                    autoComplete="off"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-3">
          {status && (
            <p
              role={status.kind === 'error' ? 'alert' : 'status'}
              className={cx('text-sm', status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')}
            >
              {status.text}
            </p>
          )}
          <Button onClick={() => void save()} disabled={update.isPending || !selected || !seatReady(selected)}>
            {update.isPending ? tr('org_ai.saving') : tr('org_ai.save')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className={className} aria-labelledby="org-ai-title" aria-busy={isLoading || update.isPending}>
      {!hideHeading && (
        <header className="mb-5">
          <h2 id="org-ai-title" className="text-lg font-semibold">{tr('org_ai.title')}</h2>
          <p className="text-sm text-muted-foreground">{tr('org_ai.description')}</p>
        </header>
      )}
      {content}
      {claudeConnect && (
        <ClaudeConnectDialog
          open={claudeDialog}
          onOpenChange={setClaudeDialog}
          api={claudeConnect.api}
          t={t}
          openUrl={claudeConnect.openUrl}
        />
      )}
    </section>
  )
}
