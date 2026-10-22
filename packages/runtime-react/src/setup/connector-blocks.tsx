// Connector setup blocks: what a step of the "Configurar <addon>" wizard shows
// besides inputs. Declared by the addon manifest (kernel
// connectors[].form_layout.sections[].blocks), computed / run by the host, and
// rendered here the same for every addon:
//   • webhook_url  — the org's webhook URL, read-only, with Copy + links
//   • instructions — help text (expandable) + https links to the provider
//   • action       — a verification button with a live, structured result
// Plus the small building blocks the wizard reuses: HelpText (long help never
// gets cut: it expands) and CopyValue.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, ExternalLink, Loader2, Play, RotateCcw } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { useSetupT } from './messages'
import { copyText } from './records-table'
import { StepStatusBadge } from './step-status-badge'
import { STEP_TONE, TONE_BADGE } from './tone'
import { textOrFallback } from './connector-form-model'
import { safeHttpsUrl, type BlockResult, type ConnectorFormBlock } from './connector-blocks-model'

/** Resolves an addon i18n key (or literal); never paints a raw dotted key. */
function useAddonText() {
  const { t } = useTranslation()
  return useCallback(
    (key: string | undefined, fallback = '') => {
      if (!key) return fallback
      const out = t(key, { defaultValue: '' }) as string
      const resolved = textOrFallback(out, key, '')
      if (resolved) return resolved
      // A literal sentence (has spaces, no dots-only shape) is shown as is.
      return /\s/.test(key) || !key.includes('.') ? key : fallback
    },
    [t],
  )
}

// ─── HelpText ────────────────────────────────────────────────────────────────
/** Long help is clamped to 3 lines with a "Ver más" toggle: never cut for good. */
export function HelpText({
  text,
  id,
  className,
  clampAt = 160,
}: {
  text: string
  id?: string
  className?: string
  /** Characters above which the text starts collapsed. */
  clampAt?: number
}) {
  const st = useSetupT()
  const [open, setOpen] = useState(false)
  const autoId = useId()
  const bodyId = id ?? `${autoId}-help`
  if (!text) return null
  const long = text.length > clampAt
  return (
    <div className={cn('flex flex-col items-start gap-0.5', className)}>
      <p
        id={bodyId}
        className={cn(
          'text-xs leading-relaxed whitespace-pre-line break-words text-muted-foreground',
          long && !open && 'line-clamp-3',
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type='button'
          className='inline-flex min-h-11 items-center text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-6'
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? st('blocks.less') : st('blocks.more')}
        </button>
      ) : null}
    </div>
  )
}

// ─── CopyValue ───────────────────────────────────────────────────────────────
/** A read-only value (wraps, never truncates) with a 44px Copy button. */
export function CopyValue({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  const st = useSetupT()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const onCopy = async () => {
    const ok = await copyText(value)
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-stretch gap-2'>
        <output
          aria-label={label}
          className={cn(
            'min-w-0 flex-1 rounded-md border bg-muted/50 px-3 py-2.5 text-sm break-all select-all',
            mono && 'font-mono text-[13px]',
          )}
        >
          {value}
        </output>
        <Button
          type='button'
          variant='outline'
          className='h-auto min-h-11 shrink-0 gap-1.5 px-3'
          onClick={onCopy}
          aria-label={st('blocks.copy_label', { what: label })}
        >
          {state === 'copied' ? <Check aria-hidden='true' className='h-4 w-4' /> : <Copy aria-hidden='true' className='h-4 w-4' />}
          <span className='hidden sm:inline'>{state === 'copied' ? st('records.copied') : st('records.copy')}</span>
        </Button>
      </div>
      <p className='sr-only' role='status' aria-live='polite'>
        {state === 'copied' ? st('records.copied') : state === 'failed' ? st('records.copy_failed') : ''}
      </p>
      {state === 'failed' ? <p className='text-xs text-destructive'>{st('records.copy_failed')}</p> : null}
    </div>
  )
}

function BlockLinks({ links }: { links?: ConnectorFormBlock['links'] }) {
  const tx = useAddonText()
  const safe = (links ?? []).map((l) => ({ ...l, href: safeHttpsUrl(l.url) })).filter((l) => !!l.href)
  if (safe.length === 0) return null
  return (
    <ul className='flex flex-wrap gap-x-4 gap-y-1'>
      {safe.map((l) => (
        <li key={l.href!}>
          <a
            href={l.href!}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-2 hover:underline sm:min-h-8'
          >
            <ExternalLink aria-hidden='true' className='h-3.5 w-3.5' />
            {tx(l.label, l.href!)}
          </a>
        </li>
      ))}
    </ul>
  )
}

function BlockFrame({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2 rounded-lg border border-border/70 bg-card p-3', className)}>
      {title ? <h4 className='text-sm font-medium'>{title}</h4> : null}
      {children}
    </section>
  )
}

// ─── webhook_url ─────────────────────────────────────────────────────────────
export function WebhookUrlBlock({ block }: { block: ConnectorFormBlock }) {
  const st = useSetupT()
  const tx = useAddonText()
  const title = tx(block.title, st('blocks.webhook_title'))
  const value = typeof block.value === 'string' ? block.value.trim() : ''
  return (
    <BlockFrame title={title}>
      {value ? (
        <CopyValue value={value} label={title} />
      ) : (
        <p className='text-sm text-muted-foreground' role='note'>
          {st('blocks.webhook_unavailable')}
        </p>
      )}
      <HelpText text={tx(block.description, st('blocks.webhook_help'))} />
      <BlockLinks links={block.links} />
    </BlockFrame>
  )
}

// ─── instructions ────────────────────────────────────────────────────────────
export function InstructionsBlock({ block }: { block: ConnectorFormBlock }) {
  const tx = useAddonText()
  return (
    <BlockFrame title={tx(block.title)} className='bg-muted/30'>
      <HelpText text={tx(block.description)} clampAt={240} />
      <BlockLinks links={block.links} />
    </BlockFrame>
  )
}

// ─── action ──────────────────────────────────────────────────────────────────
export interface ActionBlockProps {
  block: ConnectorFormBlock
  /** Runs the action; resolves to the normalized result (never throws). */
  run: () => Promise<BlockResult>
  result?: BlockResult
  onResult?: (r: BlockResult) => void
  disabled?: boolean
  /** Shown under the button (e.g. "Se guardarán tus cambios antes de probar"). */
  note?: string
}

export function ActionBlock({ block, run, result, onResult, disabled, note }: ActionBlockProps) {
  const st = useSetupT()
  const tx = useAddonText()
  const [busy, setBusy] = useState(false)
  const [local, setLocal] = useState<BlockResult | undefined>(undefined)
  const shown = result ?? local
  const label = tx(block.label, st('blocks.run'))
  const onRun = async () => {
    setBusy(true)
    try {
      const r = await run()
      setLocal(r)
      onResult?.(r)
    } finally {
      setBusy(false)
    }
  }
  const failed = shown && (shown.status === 'error' || shown.status === 'blocked')
  return (
    <BlockFrame title={tx(block.title)}>
      <HelpText text={tx(block.description)} />
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          type='button'
          variant={failed ? 'outline' : 'secondary'}
          className='h-auto min-h-11 gap-2 whitespace-normal text-left'
          onClick={onRun}
          disabled={busy || disabled}
          aria-describedby={note ? `${block.key}-note` : undefined}
        >
          {busy ? (
            <Loader2 aria-hidden='true' className='h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none' />
          ) : shown ? (
            <RotateCcw aria-hidden='true' className='h-4 w-4 shrink-0' />
          ) : (
            <Play aria-hidden='true' className='h-4 w-4 shrink-0' />
          )}
          {busy ? st('blocks.running') : shown ? st('blocks.retry_with', { label }) : label}
        </Button>
        {note ? (
          <span id={`${block.key}-note`} className='text-xs text-muted-foreground'>
            {note}
          </span>
        ) : null}
      </div>
      {/* Live region: always mounted so screen readers announce the outcome. */}
      <div role='status' aria-live='polite' aria-atomic='true' className='empty:hidden'>
        {shown ? <BlockResultView result={shown} /> : null}
      </div>
    </BlockFrame>
  )
}

export function BlockResultView({ result }: { result: BlockResult }) {
  const st = useSetupT()
  const tone = STEP_TONE[result.status] ?? 'neutral'
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border px-3 py-2', TONE_BADGE[tone])} data-result-status={result.status}>
      <div className='flex flex-wrap items-center gap-2'>
        <StepStatusBadge status={result.status} label={st(`blocks.result.${result.status}`)} />
        {result.message ? <span className='text-sm break-words text-foreground'>{result.message}</span> : null}
      </div>
      {result.details.length > 0 ? (
        <dl className='flex flex-col gap-2'>
          {result.details.map((d, i) => {
            const label = d.label || d.key || ''
            const href = d.kind === 'url' ? safeHttpsUrl(d.value) : null
            return (
              <div key={d.key ?? i} className='flex flex-col gap-1'>
                <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
                <dd className='text-sm text-foreground'>
                  {d.kind === 'id' ? (
                    <CopyValue value={d.value} label={label || st('blocks.value')} />
                  ) : href ? (
                    <a
                      href={href}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex min-h-11 items-center gap-1.5 break-all font-medium text-primary underline-offset-2 hover:underline sm:min-h-8'
                    >
                      <ExternalLink aria-hidden='true' className='h-3.5 w-3.5 shrink-0' />
                      {st('blocks.open_link')}
                    </a>
                  ) : (
                    <span className='break-words'>{d.value}</span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      ) : null}
    </div>
  )
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────
export interface ConnectorBlocksProps {
  blocks: ConnectorFormBlock[]
  /** Runs an action block by key. */
  runAction: (block: ConnectorFormBlock) => Promise<BlockResult>
  results?: Record<string, BlockResult | undefined>
  onResult?: (key: string, r: BlockResult) => void
  /** Disables actions (e.g. the viewer may not run them). */
  actionsDisabled?: boolean
  actionNote?: string
}

/** Renders a step's blocks in declared order; unknown kinds are skipped. */
export function ConnectorBlocks({ blocks, runAction, results, onResult, actionsDisabled, actionNote }: ConnectorBlocksProps) {
  if (blocks.length === 0) return null
  return (
    <div className='flex flex-col gap-3'>
      {blocks.map((b) => {
        switch (b.kind) {
          case 'webhook_url':
            return <WebhookUrlBlock key={b.key} block={b} />
          case 'instructions':
            return <InstructionsBlock key={b.key} block={b} />
          case 'action':
            return (
              <ActionBlock
                key={b.key}
                block={b}
                run={() => runAction(b)}
                result={results?.[b.key]}
                onResult={(r) => onResult?.(b.key, r)}
                disabled={actionsDisabled}
                note={actionNote}
              />
            )
          default:
            return null
        }
      })}
    </div>
  )
}
