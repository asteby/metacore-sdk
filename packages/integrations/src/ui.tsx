import * as React from 'react'
import type { TFunction } from './i18n'

/** Shared class tokens (shadcn-style names; the host's Tailwind resolves them). */
export const cx = {
  input: 'w-full rounded-md border bg-background px-3 py-2 text-sm',
  button: 'inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50',
  primary: 'inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50',
  card: 'rounded-lg border p-4',
  muted: 'text-sm text-muted-foreground',
  label: 'mb-1 block text-sm font-medium',
  error: 'text-sm text-destructive',
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (ids: { id: string; describedBy?: string }) => React.ReactNode
}) {
  const id = React.useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div>
      <label htmlFor={id} className={cx.label}>
        {label}
      </label>
      {children({ id, describedBy: hintId })}
      {hint ? (
        <p id={hintId} className={cx.muted}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function ErrorNote({ error, t }: { error: unknown; t: TFunction }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  return (
    <p role="alert" className={cx.error}>
      {t('common.error', { message })}
    </p>
  )
}

export interface AsyncState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => void
}

/** Minimal loader: runs `fn` on mount and on reload; ignores stale results. */
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []): AsyncState<T> {
  const [state, setState] = React.useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true })
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (error) => live && setState({ error, loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data: state.data, error: state.error, loading: state.loading, reload: () => setTick((n) => n + 1) }
}
