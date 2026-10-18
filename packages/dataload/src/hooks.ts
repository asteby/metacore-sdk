import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isPlanChanged, listAllReviews, profileRef, type DataloadApi } from './api'
import type {
  DataloadOverrides,
  DataloadPlan,
  DataloadProfile,
  DataloadRun,
  DataloadSourceInput,
  PlanPageQuery,
  ProfileKey,
  ProfileSummary,
  ReviewDecision,
  ReviewFilter,
} from './types'
import { DEFAULT_MAX_FILE_BYTES, SourceFileError, isTerminal, readSourceFile } from './utils'
import { DEFAULT_MAX_UPLOAD_BYTES, UploadError, uploadSourceFile, type ChunkedUploadOptions, type UploadProgress } from './upload'

export const dataloadKeys = {
  all: ['dataload'] as const,
  profiles: ['dataload', 'profiles'] as const,
  runs: ['dataload', 'runs'] as const,
  run: (id: string) => ['dataload', 'run', id] as const,
  runPlan: (id: string, q: PlanPageQuery = {}) => ['dataload', 'run-plan', id, q] as const,
  profileVersion: (ref: string) => ['dataload', 'profile-version', ref] as const,
  media: (runId?: string) => ['dataload', 'media', runId ?? 'all'] as const,
  reviews: ['dataload', 'reviews'] as const,
  reviewList: (f: ReviewFilter) => ['dataload', 'reviews', f] as const,
}

export function useDataloadProfiles(api: DataloadApi) {
  return useQuery({ queryKey: dataloadKeys.profiles, queryFn: () => api.listProfiles(), staleTime: 60_000 })
}

/** A version resolved for editing: the full profile it ends in and the overrides on top of it. */
export interface ResolvedVersion {
  /** Full profile at the bottom of the `base` chain. */
  profile: DataloadProfile
  /** Reference of that full profile (send it with edited overrides). */
  baseRef: string
  baseKey: ProfileKey
  /** Overrides of the selected version (undefined for a full profile). */
  overrides?: DataloadOverrides
}

/** Fetches a version and follows its `base` until a full profile (one level in practice). */
export function useResolvedVersion(api: DataloadApi, summary: ProfileSummary | undefined) {
  const ref = summary ? profileRef(summary) : ''
  return useQuery({
    queryKey: dataloadKeys.profileVersion(ref),
    enabled: !!summary,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ResolvedVersion> => {
      const top = await api.profileVersion(summary!)
      let cur = top
      let key: ProfileKey & { shared?: boolean } = { org: summary!.org, name: summary!.name, version: summary!.version, shared: summary!.shared }
      for (let i = 0; i < 5 && !cur.profile && cur.base; i++) {
        key = { ...cur.base, shared: !cur.base.org }
        cur = await api.profileVersion(key)
      }
      if (!cur.profile) throw new Error(`dataload: ${ref} no termina en un perfil completo`)
      return { profile: cur.profile, baseRef: profileRef(key), baseKey: { org: key.org ?? '', name: key.name, version: key.version }, ...(top.overrides ? { overrides: top.overrides } : {}) }
    },
  })
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

/** One page of the plan stored with a run (paginated on the server). */
export function useDataloadRunPlan(api: DataloadApi, id: string | undefined, query: PlanPageQuery = {}) {
  return useQuery({ queryKey: dataloadKeys.runPlan(id ?? '', query), queryFn: () => api.runPlan(id!, query), enabled: !!id, staleTime: 60_000 })
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

/** Rows held for a decision: every page (the server pages by cursor), up to `max`. */
export function useDataloadReviews(api: DataloadApi, filter: ReviewFilter = {}, max = 5000) {
  return useQuery({ queryKey: dataloadKeys.reviewList(filter), queryFn: async () => (await listAllReviews(api, filter, max)).items, staleTime: 5_000 })
}

/** Decide (approve / reject, one or many) and apply the approved rows. Both refresh the queue and the history. */
export function useReviewActions(api: DataloadApi) {
  const qc = useQueryClient()
  return {
    decide: useMutation({
      mutationFn: (ds: ReviewDecision[]) => api.decideReviews(ds),
      // A stale decision (409) also needs the fresh queue, so refresh either way.
      onSettled: () => qc.invalidateQueries({ queryKey: dataloadKeys.reviews }),
    }),
    applyApproved: useMutation({
      mutationFn: (entity: string) => api.applyApproved(entity),
      onSettled: () => qc.invalidateQueries({ queryKey: dataloadKeys.all }),
    }),
  }
}

export type SourcePhase = 'idle' | 'reading' | 'uploading' | 'ready' | 'failed' | 'aborted'

export interface SourceFileOptions {
  /** Up to this size the file is read and sent inline as text. Default 25 MB. */
  inlineMaxBytes?: number
  /** Bigger files are uploaded in parts when this is not false. Default true. */
  chunked?: boolean
  /** Ceiling of a chunked upload. Default 2 GB. */
  maxBytes?: number
  upload?: Omit<ChunkedUploadOptions, 'signal' | 'onProgress' | 'bundlePath' | 'resumeId' | 'maxBytes'>
}

/**
 * Turns a picked file into a source: inline text for small files, a chunked
 * upload (progress, retry from where it stopped, cancel) for big ones.
 */
export function useSourceFile(api: DataloadApi, opts: SourceFileOptions = {}) {
  const inlineMax = opts.inlineMaxBytes ?? DEFAULT_MAX_FILE_BYTES
  const chunked = opts.chunked !== false
  const maxBytes = chunked ? (opts.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES) : inlineMax
  const [phase, setPhase] = useState<SourcePhase>('idle')
  const [source, setSource] = useState<DataloadSourceInput | undefined>()
  const [progress, setProgress] = useState<UploadProgress | undefined>()
  const [error, setError] = useState<SourceFileError['code'] | UploadError['code'] | undefined>()
  const ctrl = useRef<AbortController | undefined>(undefined)
  const last = useRef<{ file: File; bundlePath?: string; resumeId?: string } | undefined>(undefined)
  const seq = useRef(0)
  const uploadOpts = useRef(opts.upload)
  uploadOpts.current = opts.upload

  const run = useCallback(
    async (file: File | undefined, bundlePath?: string, resumeId?: string): Promise<DataloadSourceInput | undefined> => {
      ctrl.current?.abort()
      const my = ++seq.current
      setError(undefined)
      setProgress(undefined)
      setSource(undefined)
      last.current = file ? { file, bundlePath, resumeId } : undefined
      if (!file) {
        setPhase('idle')
        return undefined
      }
      const fail = (code: NonNullable<typeof error>, uploadId?: string) => {
        if (my !== seq.current) return undefined
        if (uploadId && last.current) last.current.resumeId = uploadId
        setError(code)
        setPhase(code === 'aborted' ? 'aborted' : 'failed')
        return undefined
      }
      if (file.size <= inlineMax || !chunked) {
        setPhase('reading')
        try {
          const s = await readSourceFile(file, { maxBytes: inlineMax, bundlePath })
          if (my !== seq.current) return undefined
          setSource(s)
          setPhase('ready')
          return s
        } catch (e) {
          return fail(e instanceof SourceFileError ? e.code : 'unsupported')
        }
      }
      const c = new AbortController()
      ctrl.current = c
      setPhase('uploading')
      try {
        const s = await uploadSourceFile(api, file, {
          ...uploadOpts.current,
          maxBytes,
          bundlePath,
          resumeId,
          signal: c.signal,
          onProgress: (p) => my === seq.current && setProgress(p),
        })
        if (my !== seq.current) return undefined
        setSource(s)
        setPhase('ready')
        return s
      } catch (e) {
        return e instanceof UploadError ? fail(e.code, e.uploadId) : fail('failed')
      }
    },
    [api, inlineMax, chunked, maxBytes],
  )

  const cancel = useCallback(() => ctrl.current?.abort(), [])
  /** Retries the last failed upload; parts already on the server are not sent again. */
  const retry = useCallback(() => {
    const l = last.current
    return l ? run(l.file, l.bundlePath, l.resumeId) : Promise.resolve(undefined)
  }, [run])
  const clear = useCallback(() => void run(undefined), [run])

  useEffect(() => () => ctrl.current?.abort(), [])

  return { phase, source, progress, error, pick: run, cancel, retry, clear, inlineMaxBytes: inlineMax, maxBytes, chunked }
}

export type LauncherPhase = 'idle' | 'planning' | 'planned' | 'starting' | 'running' | 'finished'

export interface LauncherOptions {
  pollMs?: number
  /** Called once when the run reaches a terminal state. */
  onFinished?: (run: DataloadRun) => void
  /** Initial per-organization overrides; `setOverrides` changes them (and drops a stale plan). */
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
  const [overrides, setOverridesState] = useState<DataloadOverrides | undefined>(opts.overrides)
  // Edited overrides are the COMPLETE set: they go over the full base profile, not over a derived version's own overrides.
  const [overridesBase, setOverridesBase] = useState<string | undefined>()
  const [sourceId, setSourceId] = useState<string | undefined>()
  const [planChanged, setPlanChanged] = useState(false)
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
    setPlanChanged(false)
  }
  const initialOverrides = useRef(opts.overrides)
  initialOverrides.current = opts.overrides
  const setProfile = useCallback((name: string) => {
    if (locked) return
    // Overrides belong to a profile: switching profiles goes back to the host's (or the stored) ones.
    if (profile && profile !== name) {
      setOverridesState(initialOverrides.current)
      setOverridesBase(undefined)
    }
    setProfileState(name)
    dropPlan()
  }, [locked, profile])
  const setSource = useCallback((s: DataloadSourceInput | undefined) => {
    if (locked) return
    setSourceState(s)
    setSourceId(undefined)
    dropPlan()
  }, [locked])
  /** `baseRef`: the full profile the edited overrides go over (see `useResolvedVersion`). */
  const setOverrides = useCallback((o: DataloadOverrides | undefined, baseRef?: string) => {
    if (locked) return
    setOverridesState(o)
    setOverridesBase(baseRef)
    dropPlan()
  }, [locked])

  const request = () => ({ profile: overrides && overridesBase ? overridesBase : profile, source: source!, ...(overrides ? { overrides } : {}) })
  const ready = !!profile && !!source

  const dryRun = async () => {
    if (!ready || locked) return undefined
    setError(undefined)
    try {
      const r = await dry.mutateAsync(sourceId ? { ...request(), source: { id: sourceId } } : request())
      setPlan(r.plan)
      setPreviewRun(r.run)
      setPlanChanged(false)
      if (r.source) setSourceId(r.source)
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
      // Apply exactly what was simulated: the stored source (not sent again), the
      // registry version the dry-run resolved, and the reviewed plan hash (409 if it changed).
      const key = previewRun?.registry?.key
      const pinned = key && typeof request().profile === 'string' ? profileRef({ ...key, org: key.org ?? '' }) : request().profile
      const r = await exec.mutateAsync({
        ...request(),
        profile: pinned,
        ...(sourceId ? { source: { id: sourceId } } : {}),
        expectPlanHash: plan.planHash,
        force,
        failOnInvalid,
      })
      setStartedRun(r)
      setRunId(r.id)
      qc.invalidateQueries({ queryKey: dataloadKeys.runs })
      return r
    } catch (e) {
      if (isPlanChanged(e)) {
        // What would be applied is not what the person reviewed: drop the plan, simulate again.
        setPlan(undefined)
        setPreviewRun(undefined)
        setPlanChanged(true)
      }
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
    setSourceId(undefined)
    setPlanChanged(false)
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
    overrides,
    setOverrides,
    plan,
    /** The server rejected the apply because the plan changed since the dry-run: simulate again. */
    planChanged,
    /** Id of the stored source after the first dry-run (later calls send only this). */
    sourceId,
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
