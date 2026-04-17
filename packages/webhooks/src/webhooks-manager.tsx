import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Shield } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { CreateDialog, DEFAULT_EVENT_PRESETS } from './components/create-dialog'
import { LogsDialog } from './components/logs-dialog'
import { StatsBar } from './components/stats-bar'
import { WebhooksList } from './components/webhooks-list'
import { useWebhooks } from './hooks'
import type { Webhook, WebhooksConfig } from './types'
import { defaultTranslate, type WebhooksTranslate } from './i18n'

export interface WebhooksManagerProps extends WebhooksConfig {
  /** Optional translation function (`react-i18next`-compatible signature). */
  t?: WebhooksTranslate
  /** Optional extra class for the root element. */
  className?: string
  /** Hide the header block. */
  hideHeader?: boolean
  /** Hide the payload/headers reference block at the bottom. */
  hidePayloadReference?: boolean
}

/**
 * Top-level component orchestrating the webhooks UX. Wire it with any
 * axios-compatible client plus the scope (`device` | `organization`).
 */
export function WebhooksManager(props: WebhooksManagerProps) {
  const {
    t = defaultTranslate,
    className,
    hideHeader,
    hidePayloadReference,
    eventPresets = DEFAULT_EVENT_PRESETS,
    enableTest = true,
    enableReplay = false,
    devices = [],
    ...rest
  } = props

  const config: WebhooksConfig = {
    ...rest,
    eventPresets,
    enableTest,
    enableReplay,
    devices,
  }

  const {
    webhooks,
    stats,
    isLoading,
    create,
    update,
    remove,
    test,
    basePath,
  } = useWebhooks(config)

  const [showCreate, setShowCreate] = useState(false)
  const [logsTarget, setLogsTarget] = useState<Webhook | null>(null)

  const handleDelete = (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm(
      t('webhooks.confirm.delete', '¿Eliminar este webhook?')
    )) return

    remove.mutate(id, {
      onSuccess: () => toast.success(t('webhooks.toast.deleted', 'Webhook eliminado')),
      onError: () =>
        toast.error(t('webhooks.toast.delete_error', 'Error al eliminar webhook')),
    })
  }

  const handleToggle = (id: string, nextStatus: 'active' | 'paused') => {
    update.mutate(
      { id, patch: { status: nextStatus } },
      {
        onSuccess: () =>
          toast.success(
            nextStatus === 'active'
              ? t('webhooks.toast.activated', 'Webhook activado')
              : t('webhooks.toast.paused', 'Webhook pausado')
          ),
        onError: () =>
          toast.error(
            t('webhooks.toast.update_error', 'Error al actualizar webhook')
          ),
      }
    )
  }

  const handleTest = (id: string) => {
    test.mutate(id, {
      onSuccess: () =>
        toast.success(t('webhooks.toast.test_sent', 'Evento de prueba enviado')),
      onError: () =>
        toast.error(
          t('webhooks.toast.test_error', 'Error al enviar evento de prueba')
        ),
    })
  }

  return (
    <div className={cn('space-y-6', className)}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {t('webhooks.header.title', 'Webhooks')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {config.scope === 'organization'
                ? t(
                    'webhooks.header.subtitle_org',
                    'Recibe eventos de toda la organización en tiempo real.'
                  )
                : t(
                    'webhooks.header.subtitle_device',
                    'Recibe eventos del dispositivo en tiempo real.'
                  )}
            </p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="gap-2 bg-violet-600 hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            {t('webhooks.header.new', 'Nuevo webhook')}
          </Button>
        </div>
      )}

      <StatsBar stats={stats} t={t} />

      <WebhooksList
        webhooks={webhooks}
        isLoading={isLoading}
        onDelete={handleDelete}
        onToggle={handleToggle}
        onTest={enableTest ? handleTest : undefined}
        onViewLogs={(wh) => setLogsTarget(wh)}
        enableTest={enableTest}
        showDeviceChip={config.scope === 'device'}
        t={t}
      />

      {!hidePayloadReference && <PayloadReference t={t} />}

      <CreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        showDeviceSelector={config.scope === 'device'}
        devices={devices}
        defaultDeviceId={config.deviceId}
        eventPresets={eventPresets}
        t={t}
        onSubmit={async (payload) => {
          const res = await create.mutateAsync(payload)
          return { secret: res.data.secret }
        }}
      />

      <LogsDialog
        open={!!logsTarget}
        onOpenChange={(open) => {
          if (!open) setLogsTarget(null)
        }}
        webhookId={logsTarget?.id ?? null}
        webhookName={logsTarget?.name ?? ''}
        apiClient={config.apiClient}
        basePath={basePath}
        enableReplay={enableReplay}
        t={t}
      />
    </div>
  )
}

/** Small docs block rendered below the list. */
function PayloadReference({ t }: { t: WebhooksTranslate }) {
  const headers = [
    { header: 'Content-Type', value: 'application/json' },
    { header: 'X-Webhook-ID', value: t('webhooks.docs.h_id', 'UUID del webhook') },
    { header: 'X-Webhook-Event', value: t('webhooks.docs.h_event', 'Tipo de evento') },
    { header: 'X-Webhook-Timestamp', value: t('webhooks.docs.h_ts', 'Unix timestamp') },
    { header: 'X-Webhook-Signature', value: t('webhooks.docs.h_sig', 'HMAC-SHA256 signature') },
    { header: 'X-Webhook-Delivery', value: t('webhooks.docs.h_delivery', 'ID único de entrega') },
  ]

  return (
    <div className="rounded-xl border bg-card/40 overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/20 flex items-center gap-2">
        <Shield className="h-4 w-4 text-violet-500" />
        <span className="text-sm font-semibold">
          {t('webhooks.docs.title', 'Formato del payload')}
        </span>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">
            {t('webhooks.docs.headers', 'Headers que recibirás:')}
          </h4>
          <div className="space-y-1">
            {headers.map((h) => (
              <div key={h.header} className="flex items-center gap-2 text-xs">
                <code className="font-mono text-primary font-semibold">{h.header}</code>
                <span className="text-muted-foreground">&mdash; {h.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2">
            {t('webhooks.docs.body', 'Body (JSON):')}
          </h4>
          <pre className="text-[11px] font-mono text-muted-foreground p-3 rounded-lg bg-muted/20 overflow-x-auto">
            {`{
  "id": "uuid-unique-event-id",
  "type": "message.incoming",
  "timestamp": "2026-02-10T22:47:42Z",
  "device_id": "uuid-device-id",
  "org_id": "uuid-organization-id",
  "data": {
    "message_id": "uuid",
    "conversation_id": "uuid",
    "content": "Hola!",
    "content_type": "text",
    "sender_type": "contact",
    "contact": {
      "name": "Juan Pérez",
      "phone": "+521234567890"
    }
  }
}`}
          </pre>
        </div>
      </div>
    </div>
  )
}
