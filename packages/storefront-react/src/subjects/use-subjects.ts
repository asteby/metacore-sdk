/**
 * Data hook of «My items» for stores that render on the client (the loader/action pair of `subjects/server` is the way on
 * a server-rendered store). It talks to the client of the `StorefrontProvider` (or `client`), which must carry the buyer's
 * session (`withCustomerToken`). It never throws: a failure is `status: 'error'` and `reload()` is the retry; a store that
 * declares no kind is `status: 'unavailable'` and the section should not render.
 */
import type { StorefrontClient, Subject, SubjectInput, SubjectKind, SubjectPatch } from '@asteby/storefront'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalStorefront } from '../context.js'

export type UseSubjectsStatus = 'loading' | 'ready' | 'error' | 'unavailable'

export type UseSubjects = {
  status: UseSubjectsStatus
  kinds: SubjectKind[]
  subjects: Subject[]
  error: Error | null
  reload: () => void
  create: (input: SubjectInput) => Promise<Subject>
  update: (id: string, patch: SubjectPatch) => Promise<Subject>
  remove: (id: string) => Promise<void>
  makeDefault: (id: string) => Promise<Subject>
}

export function useSubjects(client?: StorefrontClient | null): UseSubjects {
  const ctx = useOptionalStorefront()
  const sf = client ?? ctx?.client ?? null
  const [state, setState] = useState<{ status: UseSubjectsStatus; kinds: SubjectKind[]; subjects: Subject[]; error: Error | null }>({ status: 'loading', kinds: [], subjects: [], error: null })
  const alive = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    alive.current?.abort()
    if (!sf) {
      setState({ status: 'loading', kinds: [], subjects: [], error: null })
      return
    }
    const ctl = new AbortController()
    alive.current = ctl
    const opt = { signal: ctl.signal }
    setState((s) => (s.status === 'ready' ? s : { status: 'loading', kinds: [], subjects: [], error: null }))
    sf.content.subjectKinds(opt).then(
      async (kinds) => {
        if (ctl.signal.aborted) return
        if (kinds.length === 0) return setState({ status: 'unavailable', kinds: [], subjects: [], error: null })
        try {
          const subjects = await sf.customer.subjects.list(undefined, opt)
          if (!ctl.signal.aborted) setState({ status: 'ready', kinds, subjects, error: null })
        } catch (e) {
          if (!ctl.signal.aborted) setState({ status: 'error', kinds, subjects: [], error: e instanceof Error ? e : new Error('Request failed') })
        }
      },
      (e) => !ctl.signal.aborted && setState({ status: 'error', kinds: [], subjects: [], error: e instanceof Error ? e : new Error('Request failed') }),
    )
  }, [sf])

  useEffect(() => {
    load()
    return () => alive.current?.abort()
  }, [load])

  const need = () => {
    if (!sf) throw new Error('useSubjects: no storefront client')
    return sf
  }
  const create = useCallback(async (input: SubjectInput) => {
    const saved = await need().customer.subjects.create(input)
    load()
    return saved
  }, [sf, load]) // eslint-disable-line react-hooks/exhaustive-deps
  const update = useCallback(async (id: string, patch: SubjectPatch) => {
    const saved = await need().customer.subjects.update(id, patch)
    load()
    return saved
  }, [sf, load]) // eslint-disable-line react-hooks/exhaustive-deps
  const remove = useCallback(async (id: string) => {
    await need().customer.subjects.delete(id)
    load()
  }, [sf, load]) // eslint-disable-line react-hooks/exhaustive-deps
  const makeDefault = useCallback((id: string) => update(id, { is_default: true }), [update])

  return { ...state, reload: load, create, update, remove, makeDefault }
}
