import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X, Pencil, PlusCircle, Trash2, Maximize2 } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui'
import { getImageUrl } from '@asteby/metacore-starter-core'
import { ChatEmbedCard } from '../team-chat/components/chat-embed-card'
import type { ChatAttachment } from '../team-chat/data/types'
import { AGENT_CARD, AGENT_ENTER } from './agent-surfaces'

export type AbyProposal = {
  id: string
  action: 'create' | 'update' | 'delete' | string
  model: string
  model_title?: string
  record_id?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  data?: Record<string, unknown>
  status: string
  field_labels?: Record<string, string>
  line_items?: Record<string, unknown>[]
  embed?: ChatAttachment
}

const ACTION_META: Record<string, { label: string; Icon: typeof Pencil; tone: string }> = {
  create: { label: 'Crear', Icon: PlusCircle, tone: 'text-[var(--success,oklch(0.6_0.15_155))]' },
  update: { label: 'Editar', Icon: Pencil, tone: 'text-[var(--warning,oklch(0.68_0.16_70))]' },
  delete: { label: 'Eliminar', Icon: Trash2, tone: 'text-destructive' },
}

const FALLBACK_ES: Record<string, string> = {
  name: 'Nombre',
  title: 'Título',
  is_active: 'Activo',
  account_type: 'Tipo de cuenta',
  notes: 'Notas',
  email: 'Email',
  phone: 'Teléfono',
  quantity: 'Cantidad',
  price: 'Precio',
  unit_price: 'Precio unitario',
  total: 'Total',
  product_id: 'Producto',
  product: 'Producto',
  variant_id: 'Variante',
  variant: 'Variante',
  warehouse_id: 'Almacén',
  customer_id: 'Cliente',
  image: 'Imagen',
  image_url: 'Imagen',
  photo: 'Foto',
  description: 'Descripción',
  code: 'Código',
  sku: 'SKU',
  cost: 'Costo',
  sale_price: 'Precio de venta',
  unit_of_measure: 'Unidad de medida',
  product_type: 'Tipo de producto',
  features: 'Características',
  increment: 'Incrementar',
  decrement: 'Decrementar',
  delta: 'Delta',
}

const VALUE_ES: Record<string, string> = {
  increment: 'Incrementar',
  decrement: 'Decrementar',
  increase: 'Aumentar',
  decrease: 'Disminuir',
  add: 'Sumar',
  remove: 'Quitar',
  draft: 'Borrador',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
}

type StatusTone = 'success' | 'warning' | 'danger' | 'muted'

// Status → tone only; the words come from i18n (aby_results.status.*).
const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  applied: 'success',
  done: 'success',
  rejected: 'muted',
  failed: 'danger',
  error: 'danger',
}

/** Proposal status as a localized chip in the theme's status tone — never the raw token. */
export function ProposalStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const label = t(`aby_results.status.${status}`, {
    defaultValue: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : '—',
  })
  return (
    <Badge
      variant={STATUS_TONE[status] ?? 'muted'}
      className='h-5 rounded-full px-2 text-[10px] font-semibold'
    >
      {label}
    </Badge>
  )
}

function labelFor(key: string, labels?: Record<string, string>) {
  const raw = labels?.[key]?.trim()
  if (raw && !raw.includes('.')) return raw
  if (FALLBACK_ES[key]) return FALLBACK_ES[key]
  // Sentence case, like the rest of the UI copy ("Tipo de cuenta", not
  // "Tipo De Cuenta").
  const words = key.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function FieldDiff({
  action,
  before,
  after,
  data,
  fieldLabels,
  compact = true,
}: {
  action: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  data?: Record<string, unknown>
  fieldLabels?: Record<string, string>
  /** Compact truncates cells; false shows full values (modal). */
  compact?: boolean
}) {
  const keys = new Set<string>()
  Object.keys(data || {}).forEach((k) => keys.add(k))
  Object.keys(after || {}).forEach((k) => keys.add(k))
  if (action === 'delete') Object.keys(before || {}).forEach((k) => keys.add(k))

  const skip = new Set([
    'id',
    'organization_id',
    'created_at',
    'updated_at',
    'deleted_at',
    'created_by_id',
    'items',
    'lines',
    'line_items',
    'order_items',
    'sales_order_items',
    'invoice_items',
    'details',
    'product_lines',
    'entries',
  ])
  const rows = [...keys].filter((k) => !skip.has(k)).slice(0, compact ? 24 : 80)

  if (!rows.length) return null

  const cell = compact ? 'truncate' : 'whitespace-pre-wrap break-words'

  return (
    <div
      className={cn(
        'mt-2 overflow-hidden rounded-lg border border-border/60 text-[11px]',
        compact && 'max-h-52 overflow-y-auto overscroll-contain',
      )}
    >
      <div className='grid grid-cols-[1fr_1fr_1fr] gap-0 bg-foreground/[0.04] px-2 py-1 font-medium text-muted-foreground'>
        <span>Campo</span>
        <span>Antes</span>
        <span>Después</span>
      </div>
      {rows.map((k) => {
        const b = before?.[k]
        const a = after?.[k] ?? data?.[k]
        const changed = action === 'create' || action === 'delete' || JSON.stringify(b) !== JSON.stringify(a)
        if (!changed && action === 'update') return null
        return (
          <div key={k} className='grid grid-cols-[1fr_1fr_1fr] gap-0 border-t border-border/40 px-2 py-1.5'>
            <span className={cn(cell, 'font-medium')}>{labelFor(k, fieldLabels)}</span>
            <ValueCell
              value={action === 'create' ? null : b}
              className={cn(cell, 'text-muted-foreground')}
              compact={compact}
            />
            <ValueCell
              value={action === 'delete' ? b : a}
              className={cn(cell, action === 'delete' && 'line-through text-muted-foreground')}
              compact={compact}
            />
          </div>
        )
      })}
    </div>
  )
}

function LineItemsPreview({
  items,
  fieldLabels,
  compact = true,
}: {
  items: Record<string, unknown>[]
  fieldLabels?: Record<string, string>
  compact?: boolean
}) {
  if (!items.length) return null
  const skip = new Set(['id', 'organization_id', 'created_at', 'updated_at', 'deleted_at'])
  const rawKeys = Object.keys(items[0] || {}).filter((k) => !skip.has(k))
  const cols = pickLineItemCols(rawKeys).slice(0, compact ? 5 : 12)
  if (!cols.length) return null
  const cell = compact ? 'truncate' : 'whitespace-pre-wrap break-words'
  const shown = compact ? items.slice(0, 12) : items
  return (
    <div className='mt-2 overflow-hidden rounded-lg border border-border/60 text-[11px]'>
      <div className='bg-foreground/[0.04] px-2 py-1 font-medium text-muted-foreground'>
        Ítems ({items.length})
      </div>
      <div
        className='grid gap-0 border-t border-border/40 bg-foreground/[0.025] px-2 py-1 font-medium text-muted-foreground'
        style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
      >
        {cols.map((c) => (
          <span key={c} className='truncate'>
            {labelFor(c, fieldLabels)}
          </span>
        ))}
      </div>
      {shown.map((row, i) => (
        <div
          key={i}
          className='grid gap-0 border-t border-border/40 px-2 py-1.5'
          style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}
        >
          {cols.map((c) => (
            <span key={c} className={cell}>
              {fmt(row[c])}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function looksLikeImageURL(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s) || s.startsWith('/storage/') || s.startsWith('/app/')) {
    if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(s) || s.includes('/storage/')) return s
  }
  return null
}

function pickLineItemCols(keys: string[]): string[] {
  const prefer = [
    'product_id',
    'product',
    'variant_id',
    'variant',
    'quantity',
    'delta',
    'type',
    'reason',
    'warehouse_id',
  ]
  const hasSibling = (k: string) => k.endsWith('_id') && keys.includes(k.slice(0, -3))
  const rest = keys.filter((k) => !prefer.includes(k) && !hasSibling(k))
  return [...prefer.filter((k) => keys.includes(k) && !hasSibling(k)), ...rest]
}

function fmt(v: unknown): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['label', 'name', 'title', 'sku', 'identifier', 'value']) {
      const nested = o[k]
      if (nested == null || nested === '') continue
      if (isBareUUID(nested)) continue
      return String(nested)
    }
    return JSON.stringify(v)
  }
  if (typeof v === 'string') {
    const mapped = VALUE_ES[v.toLowerCase()]
    if (mapped) return mapped
  }
  return String(v)
}

function isBareUUID(v: unknown): boolean {
  if (typeof v !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim(),
  )
}

function ValueCell({
  value,
  className,
  compact,
}: {
  value: unknown
  className?: string
  compact?: boolean
}) {
  const img = looksLikeImageURL(value)
  if (img) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <img
          src={getImageUrl(img)}
          alt=''
          className={cn(
            'rounded border object-cover',
            compact ? 'size-8' : 'size-14',
          )}
        />
        {!compact && (
          <span className='truncate text-[10px] text-muted-foreground'>{fmt(value)}</span>
        )}
      </span>
    )
  }
  return <span className={className}>{fmt(value)}</span>
}

export function AbyProposalCard({
  proposal,
  busy,
  onDecide,
  hideActions = false,
}: {
  proposal: AbyProposal
  busy?: boolean
  onDecide: (id: string, approve: boolean) => void
  /** When true, omit per-card Aceptar/Rechazar (used inside a plan group). */
  hideActions?: boolean
}) {
  const [open, setOpen] = useState(false)
  const meta = ACTION_META[proposal.action] || ACTION_META.update
  const Icon = meta.Icon
  const done = proposal.status !== 'pending'

  const embedAtt: ChatAttachment | undefined = proposal.embed
    ? {
        type: 'record',
        model: proposal.model,
        model_title: proposal.model_title,
        id: proposal.record_id || (proposal.embed as ChatAttachment).id,
        title: (proposal.embed as ChatAttachment).title || proposal.model_title,
        subtitle: `${meta.label} · ${proposal.model_title || proposal.model}`,
      }
    : {
        type: 'record',
        model: proposal.model,
        model_title: proposal.model_title,
        id: proposal.record_id,
        title: proposal.model_title || proposal.model,
        subtitle: meta.label,
      }

  const title = `${meta.label} · ${proposal.model_title || proposal.model}`

  return (
    <>
      <div className={cn('mt-2 w-full max-w-[22rem] p-2.5', AGENT_CARD, AGENT_ENTER)}>
        <div className='flex items-center gap-2 text-xs font-semibold'>
          <Icon className={cn('size-3.5', meta.tone)} />
          <span className='min-w-0 flex-1 truncate'>{title}</span>
          {done && <ProposalStatusBadge status={proposal.status} />}
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='h-6 w-6 shrink-0'
            title='Ver completo'
            onClick={() => setOpen(true)}
          >
            <Maximize2 className='size-3.5' />
          </Button>
        </div>

        <div className='mt-2'>
          <ChatEmbedCard att={embedAtt} />
        </div>

        <FieldDiff
          action={proposal.action}
          before={proposal.before}
          after={proposal.after}
          data={proposal.data}
          fieldLabels={proposal.field_labels}
          compact
        />

        {proposal.line_items && proposal.line_items.length > 0 && (
          <LineItemsPreview items={proposal.line_items} fieldLabels={proposal.field_labels} compact />
        )}

        <button
          type='button'
          className='mt-1.5 text-[10px] font-medium text-primary underline-offset-2 hover:underline'
          onClick={() => setOpen(true)}
        >
          Ver preview completa
        </button>

        {!done && !hideActions && (
          <div className='mt-2.5 flex gap-2'>
            <Button
              size='sm'
              className='h-7 flex-1 gap-1 text-xs'
              disabled={busy}
              onClick={() => onDecide(proposal.id, true)}
            >
              <Check className='size-3.5' /> Aceptar
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='h-7 flex-1 gap-1 text-xs'
              disabled={busy}
              onClick={() => onDecide(proposal.id, false)}
            >
              <X className='size-3.5' /> Rechazar
            </Button>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl'>
          <DialogHeader className='border-b px-4 py-3'>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <Icon className={cn('size-4', meta.tone)} />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3'>
            <ChatEmbedCard att={embedAtt} />
            <FieldDiff
              action={proposal.action}
              before={proposal.before}
              after={proposal.after}
              data={proposal.data}
              fieldLabels={proposal.field_labels}
              compact={false}
            />
            {proposal.line_items && proposal.line_items.length > 0 && (
              <LineItemsPreview
                items={proposal.line_items}
                fieldLabels={proposal.field_labels}
                compact={false}
              />
            )}
          </div>
          {!done && !hideActions && (
            <DialogFooter className='border-t px-4 py-3 sm:justify-stretch'>
              <div className='flex w-full gap-2'>
                <Button
                  className='flex-1 gap-1'
                  disabled={busy}
                  onClick={() => {
                    onDecide(proposal.id, true)
                    setOpen(false)
                  }}
                >
                  <Check className='size-4' /> Aceptar
                </Button>
                <Button
                  variant='outline'
                  className='flex-1 gap-1'
                  disabled={busy}
                  onClick={() => {
                    onDecide(proposal.id, false)
                    setOpen(false)
                  }}
                >
                  <X className='size-4' /> Rechazar
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function planRowLabel(p: AbyProposal): string {
  const emb = p.embed as ChatAttachment | undefined
  const fromEmbed = emb?.title || emb?.subtitle
  if (fromEmbed) return String(fromEmbed)
  const after = p.after || p.data || {}
  for (const k of ['name', 'title', 'sku', 'code'] as const) {
    const v = after[k]
    if (v != null && String(v).trim()) return String(v)
  }
  return p.model_title || p.model || 'Registro'
}

function planQtyHint(p: AbyProposal): string | null {
  const before = p.before?.quantity
  const after = p.after?.quantity ?? p.data?.quantity
  if (after == null && before == null) return null
  if (p.action === 'create') return `→ ${fmt(after)}`
  if (before != null && after != null && JSON.stringify(before) !== JSON.stringify(after)) {
    return `${fmt(before)} → ${fmt(after)}`
  }
  if (after != null) return `${fmt(after)}`
  return null
}

/** One status for a decided plan: all applied, all rejected, or mixed. */
function planStatus(proposals: AbyProposal[]): string {
  const first = proposals[0]?.status
  return proposals.every((p) => p.status === first) && first ? first : 'done'
}

/** Compact multi-proposal plan: one card, Accept/Reject all. */
export function AbyProposalPlan({
  proposals,
  busy,
  onDecideMany,
}: {
  proposals: AbyProposal[]
  busy?: boolean
  onDecideMany: (ids: string[], approve: boolean) => void
}) {
  const { t } = useTranslation()
  const pending = proposals.filter((p) => p.status === 'pending')
  const done = pending.length === 0
  const modelTitle =
    proposals[0]?.model_title ||
    proposals[0]?.model ||
    'registros'
  const ids = pending.map((p) => p.id)
  const shown = proposals.slice(0, 12)
  const extra = proposals.length - shown.length

  return (
    <div className={cn('mt-2 w-full max-w-[24rem] p-2.5', AGENT_CARD, AGENT_ENTER)}>
      <div className='flex items-center gap-2 text-xs font-semibold'>
        <span className='flex size-6 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--warning,oklch(0.68_0.16_70))_14%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--warning,oklch(0.68_0.16_70))_25%,transparent)]'>
          <Pencil className='size-3.5 text-[var(--warning,oklch(0.68_0.16_70))]' />
        </span>
        <span className='min-w-0 flex-1 truncate'>
          {t('aby_results.plan_title', { count: proposals.length })}
          <span className='font-normal text-muted-foreground'>
            {' '}
            {t('aby_results.plan_in', { model: modelTitle })}
          </span>
        </span>
        {done && <ProposalStatusBadge status={planStatus(proposals)} />}
      </div>

      <div className='mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-border/50 text-[11px]'>
        <div className='grid grid-cols-[1fr_auto] gap-0 bg-foreground/[0.04] px-2 py-1 font-medium text-muted-foreground'>
          <span>Registro</span>
          <span>Cambio</span>
        </div>
        {shown.map((p) => {
          const meta = ACTION_META[p.action] || ACTION_META.update
          const qty = planQtyHint(p)
          return (
            <div
              key={p.id}
              className='grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border/40 px-2 py-1.5 transition-colors hover:bg-foreground/[0.03]'
            >
              <span className='min-w-0 truncate font-medium'>
                <span className='text-muted-foreground'>{meta.label} · </span>
                {planRowLabel(p)}
              </span>
              <span className='shrink-0 tabular-nums text-muted-foreground'>
                {qty || (p.status !== 'pending' ? <ProposalStatusBadge status={p.status} /> : '—')}
              </span>
            </div>
          )
        })}
        {extra > 0 && (
          <div className='border-t border-border/40 px-2 py-1.5 text-muted-foreground'>
            +{extra} más…
          </div>
        )}
      </div>

      {!done && (
        <div className='mt-2.5 flex gap-2'>
          <Button
            size='sm'
            className='h-7 flex-1 gap-1 text-xs'
            disabled={busy || ids.length === 0}
            onClick={() => onDecideMany(ids, true)}
          >
            <Check className='size-3.5' /> Aceptar todo ({ids.length})
          </Button>
          <Button
            size='sm'
            variant='outline'
            className='h-7 flex-1 gap-1 text-xs'
            disabled={busy || ids.length === 0}
            onClick={() => onDecideMany(ids, false)}
          >
            <X className='size-3.5' /> Rechazar
          </Button>
        </div>
      )}
    </div>
  )
}
