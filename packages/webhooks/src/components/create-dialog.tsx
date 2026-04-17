import { useState } from 'react'
import { toast } from 'sonner'
import {
  Webhook,
  Copy,
  Check,
  Shield,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Send,
  Zap,
} from 'lucide-react'
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
} from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import type {
  CreateWebhookPayload,
  WebhookDeviceRef,
  WebhookEventOption,
} from '../types'
import type { WebhooksTranslate } from '../i18n'
import { defaultTranslate } from '../i18n'

/** Default event presets covering both ops and link apps. */
export const DEFAULT_EVENT_PRESETS: WebhookEventOption[] = [
  { value: 'message.incoming', label: 'Mensaje entrante', icon: 'envelope' },
  { value: 'message.sent', label: 'Mensaje enviado', icon: 'send' },
  { value: 'message.delivered', label: 'Mensaje entregado', icon: 'check' },
  { value: 'message.read', label: 'Mensaje leído', icon: 'eye' },
  { value: 'conversation.created', label: 'Conversación creada', icon: 'chat' },
  { value: 'conversation.closed', label: 'Conversación cerrada', icon: 'lock' },
  { value: 'conversation.assigned', label: 'Conversación asignada', icon: 'user' },
  { value: 'device.connected', label: 'Dispositivo conectado', icon: 'plug' },
  { value: 'device.disconnected', label: 'Dispositivo desconectado', icon: 'unplug' },
  { value: 'contact.created', label: 'Contacto creado', icon: 'users' },
]

export interface CreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called once the webhook is created server-side. */
  onSubmit: (payload: CreateWebhookPayload) => Promise<{ secret: string }>
  /** Show the device picker (device scope). */
  showDeviceSelector?: boolean
  /** Devices list (required when `showDeviceSelector`). */
  devices?: WebhookDeviceRef[]
  /** Pre-selected device id (device scope). */
  defaultDeviceId?: string
  /** Event options; defaults to {@link DEFAULT_EVENT_PRESETS}. */
  eventPresets?: WebhookEventOption[]
  /** Optional translation fn. */
  t?: WebhooksTranslate
}

export function CreateDialog({
  open,
  onOpenChange,
  onSubmit,
  showDeviceSelector = false,
  devices = [],
  defaultDeviceId,
  eventPresets = DEFAULT_EVENT_PRESETS,
  t = defaultTranslate,
}: CreateDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSecret, setShowSecret] = useState(true)

  const initialForm: CreateWebhookPayload = {
    name: '',
    url: '',
    events: 'message.incoming,message.sent',
    max_retries: 3,
    timeout_secs: 10,
    auto_disable_threshold: 10,
    ...(showDeviceSelector ? { device_id: defaultDeviceId ?? '' } : {}),
  }
  const [form, setForm] = useState<CreateWebhookPayload>(initialForm)

  const reset = () => {
    setGeneratedSecret(null)
    setCopied(false)
    setShowSecret(true)
    setForm({
      ...initialForm,
      ...(showDeviceSelector ? { device_id: defaultDeviceId ?? '' } : {}),
    })
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  const handleSubmit = async () => {
    const missing = !form.name || !form.url || (showDeviceSelector && !form.device_id)
    if (missing) {
      toast.error(
        showDeviceSelector
          ? t(
              'webhooks.create.missing_device',
              'Nombre, URL y dispositivo son requeridos'
            )
          : t('webhooks.create.missing', 'Nombre y URL son requeridos')
      )
      return
    }
    setIsSubmitting(true)
    try {
      const { secret } = await onSubmit(form)
      setGeneratedSecret(secret)
      toast.success(t('webhooks.create.success', 'Webhook creado exitosamente'))
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })
          ?.response?.data?.message ||
        (err as { message?: string })?.message ||
        t('webhooks.create.error', 'Error al crear webhook')
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = () => {
    if (!generatedSecret) return
    navigator.clipboard.writeText(generatedSecret)
    setCopied(true)
    toast.success(t('webhooks.create.copied', 'Secret copiado al portapapeles'))
    setTimeout(() => setCopied(false), 2000)
  }

  // --- Success view: show the generated signing secret (once) ---
  if (generatedSecret) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[540px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-br from-emerald-500/10 via-background to-background">
            <div className="p-6 space-y-6">
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
                    <Check className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">
                      {t('webhooks.secret.title', 'Webhook creado')}
                    </DialogTitle>
                    <DialogDescription>
                      {t(
                        'webhooks.secret.subtitle',
                        'Copia el signing secret.'
                      )}{' '}
                      <span className="text-destructive font-semibold">
                        {t(
                          'webhooks.secret.warning',
                          'No se mostrará de nuevo.'
                        )}
                      </span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-500" />
                  <span className="text-xs text-amber-600 font-medium">
                    {t(
                      'webhooks.secret.hint',
                      'Usa este secret para verificar las firmas HMAC-SHA256 en tu servidor.'
                    )}
                  </span>
                </div>

                <div className="relative group">
                  <div className="p-4 rounded-xl bg-card border-2 border-dashed border-primary/30 font-mono text-sm break-all select-all transition-all group-hover:border-primary/60">
                    {showSecret
                      ? generatedSecret
                      : '\u2022'.repeat(generatedSecret.length)}
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-60 hover:opacity-100"
                      onClick={() => setShowSecret(!showSecret)}
                    >
                      {showSecret ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-7 w-7',
                        copied ? 'text-emerald-500' : 'opacity-60 hover:opacity-100'
                      )}
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl bg-card/60 border p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Shield className="h-3.5 w-3.5" />
                    {t(
                      'webhooks.secret.verify_title',
                      'Verificación de firma (Node.js)'
                    )}
                  </div>
                  <pre className="text-[11px] leading-relaxed font-mono text-muted-foreground overflow-x-auto">
                    {`const crypto = require('crypto');

function verifyWebhook(body, timestamp, signature, secret) {
  const signedContent = \`\${timestamp}.\${body}\`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature), Buffer.from(expected)
  );
}`}
                  </pre>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={handleCopy} variant="outline" className="gap-2">
                  <Copy className="h-4 w-4" />
                  {copied
                    ? t('webhooks.secret.copied', '¡Copiado!')
                    : t('webhooks.secret.copy', 'Copiar secret')}
                </Button>
                <Button
                  onClick={handleClose}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="h-4 w-4" />
                  {t('webhooks.secret.done', 'Listo')}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // --- Form view ---
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-none shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-violet-500/5 via-background to-background">
          <div className="p-6 space-y-6">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
                  <Webhook className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <DialogTitle className="text-lg">
                    {t('webhooks.create.title', 'Registrar webhook')}
                  </DialogTitle>
                  <DialogDescription>
                    {showDeviceSelector
                      ? t(
                          'webhooks.create.subtitle_device',
                          'Recibe eventos en tiempo real en tu servidor vía HTTP POST.'
                        )
                      : t(
                          'webhooks.create.subtitle_org',
                          'Recibe eventos de toda la organización en tiempo real vía HTTP POST.'
                        )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  {t('webhooks.fields.name', 'Nombre')}
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t(
                    'webhooks.fields.name_placeholder',
                    'Ej. CRM Integration'
                  )}
                  className="bg-muted/20"
                />
              </div>

              {/* URL */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('webhooks.fields.url', 'URL del endpoint')}
                </Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://your-server.com/webhook"
                  className="bg-muted/20 font-mono text-sm"
                />
              </div>

              {/* Device selector (optional) */}
              {showDeviceSelector && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {t('webhooks.fields.device', 'Dispositivo')}
                  </Label>
                  <Select
                    value={form.device_id ?? ''}
                    onValueChange={(val) =>
                      setForm((f) => ({ ...f, device_id: val }))
                    }
                  >
                    <SelectTrigger className="bg-muted/20">
                      <SelectValue
                        placeholder={t(
                          'webhooks.fields.device_placeholder',
                          'Seleccionar dispositivo...'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0"
                            >
                              {d.type}
                            </Badge>
                            {d.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Events picker */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                  {t('webhooks.fields.events', 'Eventos a recibir')}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {eventPresets.map((event) => {
                    const current = form.events.split(',').filter((s) => s.trim())
                    const isActive = current.includes(event.value)
                    return (
                      <button
                        key={event.value}
                        type="button"
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left',
                          isActive
                            ? 'bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-400'
                            : 'bg-muted/10 border-muted-foreground/10 text-muted-foreground hover:border-violet-500/20'
                        )}
                        onClick={() => {
                          setForm((f) => {
                            const cur = f.events.split(',').filter((s) => s.trim())
                            const next = isActive
                              ? cur.filter((s) => s !== event.value)
                              : [...cur, event.value]
                            return { ...f, events: next.join(',') }
                          })
                        }}
                      >
                        {event.icon && <span>{event.icon}</span>}
                        <span>
                          {event.labelKey
                            ? t(event.labelKey, event.label)
                            : event.label}
                        </span>
                        {isActive && <Check className="h-3 w-3 ml-auto" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Advanced settings */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t('webhooks.fields.max_retries', 'Max reintentos')}
                  </Label>
                  <Input
                    type="number"
                    value={form.max_retries}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        max_retries: parseInt(e.target.value, 10) || 3,
                      }))
                    }
                    className="bg-muted/20"
                    min={0}
                    max={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t('webhooks.fields.timeout', 'Timeout (seg)')}
                  </Label>
                  <Input
                    type="number"
                    value={form.timeout_secs}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        timeout_secs: parseInt(e.target.value, 10) || 10,
                      }))
                    }
                    className="bg-muted/20"
                    min={1}
                    max={30}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {t('webhooks.fields.auto_disable', 'Auto-disable')}
                  </Label>
                  <Input
                    type="number"
                    value={form.auto_disable_threshold}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        auto_disable_threshold:
                          parseInt(e.target.value, 10) || 10,
                      }))
                    }
                    className="bg-muted/20"
                    min={3}
                    max={100}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                {t('webhooks.actions.cancel', 'Cancelar')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  !form.name ||
                  !form.url ||
                  (showDeviceSelector && !form.device_id)
                }
                className="gap-2 bg-violet-600 hover:bg-violet-700"
              >
                {isSubmitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t('webhooks.actions.create', 'Crear webhook')}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
