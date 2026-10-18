import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DataloadApi } from './api'
import type { DataloadOverrides, DataloadPlan, DataloadRun, DataloadSourceInput } from './types'
import { isTerminal } from './utils'

export const dataloadKeys = {
  all: ['dataload'] as const,
  profiles: ['dataload', 'profiles'] as const,
  runs: ['dataload', 'runs'] as const,
  run: (id: string) => ['dataload', 'run', id] as const,
  media: (runId?: string) => ['dataload', 'media', runId ?? 'all'] as const,
}

export function useDataloadProfiles(api: DataloadApi) {
  return useQuery({ queryKey: dataloadKeys.profiles, queryFn: () => api.listProfiles(), staleTime: 60_000 })
}

/** Run history, newest first. */
export function useDataloadRuns(api: DataloadApi, limit = 30) {
  return useQuery({ queryKey: [...dataloadKeys.runs, limit], queryFn: () => api.runs(limit), staleTime: 10_000 })
}

/** One run, polled every `pollMs` until it reaches a terminal state. */
export function useDataloadRun(api: DataloadApi, id: string | undefined, pollMs = 1500) {
  return useQuery({
    queryKey: dataloadKeys.run(id ?? ''),
    queryFn: () => api.run(id!),
    enabled: !!id,
    refetchInterval: (q) => (isTerminal(q.state.data?.state) ? false : pollMs),
  })
}

/** Plan stored with a run, for the diff of a past run. */
export function useDataloadRunPlan(api: DataloadApi, id: string | undefined) {
  return useQuery({ queryKey: ['dataload', 'run-plan', id ?? ''], queryFn: () => api.runPlan(id!), enabled: !!id, staleTime: 60_000 })
}

/** Media backup status (queue + manifest). Polls while `watch` is true (e.g. a run is in flight). */
export function useMediaBackupStatus(api: DataloadApi, opts: { runId?: string; watch?: boolean; pollMs?: number } = {}) {
  return useQuery({
    queryKey: dataloadKeys.media(opts.runId),
    queryFn: () => api.mediaStatus(opts.runId),
    refetchInterval: opts.watch ? (opts.pollMs ?? 3000) : false,
    staleTime: 5_000,
  })
}

/** Verify the whole manifest, requeue dead media, cancel a run. Every success refreshes the related queries. */
export function useDataloadActions(api: DataloadApi) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: dataloadKeys.all })
  return {
    cancel: useMutation({ mutationFn: (id: string) => api.cancel(id), onSuccess: refresh }),
    verifyMedia: useMutation({ mutationFn: () => api.mediaVerify(), onSuccess: refresh }),
    retryMedia: useMutation({ mutationFn: (runId?: string) => api.mediaRetry(runId), onSuccess: refresh }),
  }
}

export type LauncherPhase = 'idle' | 'planning' | 'planned' | 'starting' | 'running' | 'finished'

export interface LauncherOptions {
  pollMs?: number
  /** Called once when the run reaches a terminal state. */
  onFinished?: (run: DataloadRun) => void
  overrides?: DataloadOverrides
}

/**
 * State machine behind the launcher UI: pick source + profile -> dry-run -> review
 * the diff -> execute -> follow progress. Changing the source or profile drops a
 * stale plan; a run in flight can't be edited. It never stores the file.
 */
export function useDataloadLauncher(api: DataloadApi, opts: LauncherOptions = {}) {
  const qc = useQueryClient()
  const [profile, setProfileState] = useState('')
  const [source, setSourceState] = useState<DataloadSourceInput | undefined>()
  const [plan, setPlan] = useState<DataloadPlan | undefined>()
  const [previewRun, setPreviewRun] = useState<DataloadRun | undefined>()
  const [force, setForce] = useState(false)
  const [failOnInvalid, setFailOnInvalid] = useState(false)
  const [runId, setRunId] = useState<string | undefined>()
  const [startedRun, setStartedRun] = useState<DataloadRun | undefined>()
  const [error, setError] = useState<unknown>()

  const dry = useMutation({ mutationFn: (b: Parameters<DataloadApi['dryRun']>[0]) => api.dryRun(b) })
  const exec = useMutation({ mutationFn: (b: Parameters<DataloadApi['execute']>[0]) => api.execute(b) })
  const runQuery = useDataloadRun(api, runId, opts.pollMs)
  const run = runQuery.data ?? startedRun

  const phase: LauncherPhase = runId
    ? isTerminal(run?.state)
      ? 'finished'
      : exec.isPending
        ? 'starting'
        : 'running'
    : exec.isPending
      ? 'starting'
      : dry.isPending
        ? 'planning'
        : plan
          ? 'planned'
          : 'idle'
  const locked = phase === 'running' || phase === 'starting'

  const dropPlan = () => {
    setPlan(undefined)
    setPreviewRun(undefined)
    setError(undefined)
  }
  const setProfile = useCallback((name: string) => {
    if (locked) return
    setProfileState(name)
    dropPlan()
  }, [locked])
  const setSource = useCallback((s: DataloadSourceInput | undefined) => {
    if (locked) return
    setSourceState(s)
    dropPlan()
  }, [locked])

  const request = () => ({ profile, source: source!, ...(opts.overrides ? { overrides: opts.overrides } : {}) })
  const ready = !!profile && !!source

  const dryRun = async () => {
    if (!ready || locked) return undefined
    setError(undefined)
    try {
      const r = await dry.mutateAsync(request())
      setPlan(r.plan)
      setPreviewRun(r.run)
      return r
    } catch (e) {
      setError(e)
      throw e
    }
  }

  const execute = async () => {
    if (!ready || !plan || locked) return undefined
    setError(undefined)
    try {
      const r = await exec.mutateAsync({ ...request(), force, failOnInvalid })
      setStartedRun(r)
      setRunId(r.id)
      qc.invalidateQueries({ queryKey: dataloadKeys.runs })
      return r
    } catch (e) {
      setError(e)
      throw e
    }
  }

  const reset = () => {
    setSourceState(undefined)
    setPlan(undefined)
    setPreviewRun(undefined)
    setRunId(undefined)
    setStartedRun(undefined)
    setError(undefined)
    setForce(false)
    setFailOnInvalid(false)
    dry.reset()
    exec.reset()
  }

  const finished = useRef<string | undefined>(undefined)
  const onFinished = useRef(opts.onFinished)
  onFinished.current = opts.onFinished
  useEffect(() => {
    if (run && isTerminal(run.state) && finished.current !== run.id) {
      finished.current = run.id
      qc.invalidateQueries({ queryKey: dataloadKeys.all })
      onFinished.current?.(run)
    }
  }, [run, qc])

  return {
    phase,
    locked,
    profile,
    setProfile,
    source,
    setSource,
    plan,
    /** The dry-run's history entry (shows `replayOf` when the input was already applied). */
    previewRun,
    run,
    runId,
    force,
    setForce,
    failOnInvalid,
    setFailOnInvalid,
    ready,
    dryRun,
    execute,
    reset,
    error,
  }
}

export type DataloadLauncherState = ReturnType<typeof useDataloadLauncher>
