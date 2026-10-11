// One face for every mascot on screen. A copilot can render in several places
// at once (chat pane, floating widget, team-chat list, header avatar). Each
// chat surface publishes its own state; the face every avatar shows is the
// most active one, so a hidden idle pane can't paint "idle" over a pane that
// is thinking. Framework-free store + two React hooks (no extra dependency).
import { useEffect, useId, useSyncExternalStore } from 'react'
import type { MascotState } from './mascot'

// Higher wins. `error` outranks everything so a failure is never hidden.
const RANK: Record<MascotState, number> = {
  idle: 0,
  happy: 1,
  listening: 2,
  thinking: 3,
  processing: 4,
  speaking: 5,
  error: 6,
}

/** The most active state among `faces` (`idle` when empty). */
export function pickMascotFace(faces: Record<string, MascotState>): MascotState {
  let best: MascotState = 'idle'
  for (const state of Object.values(faces)) {
    if (RANK[state] > RANK[best]) best = state
  }
  return best
}

export interface MascotFaceStore {
  /** The face to render right now. */
  getState: () => MascotState
  subscribe: (listener: () => void) => () => void
  /** Publish `state` for the publisher `id`. No-op when unchanged. */
  setFace: (id: string, state: MascotState) => void
  /** Withdraw the publisher `id` (unmount). No-op when unknown. */
  clearFace: (id: string) => void
}

export function createMascotFaceStore(): MascotFaceStore {
  let faces: Record<string, MascotState> = {}
  let state: MascotState = 'idle'
  const listeners = new Set<() => void>()
  const commit = (next: Record<string, MascotState>) => {
    faces = next
    const picked = pickMascotFace(faces)
    if (picked === state) return
    state = picked
    listeners.forEach((l) => l())
  }
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setFace: (id, next) => {
      if (faces[id] === next) return
      commit({ ...faces, [id]: next })
    },
    clearFace: (id) => {
      if (!(id in faces)) return
      const rest = { ...faces }
      delete rest[id]
      commit(rest)
    },
  }
}

/** App-wide store shared by `useMascotFace` / `usePublishMascotFace`. */
export const mascotFaceStore: MascotFaceStore = createMascotFaceStore()

/** The face every mascot should show (the most active published one). */
export function useMascotFace(store: MascotFaceStore = mascotFaceStore): MascotState {
  return useSyncExternalStore(store.subscribe, store.getState, () => 'idle')
}

/**
 * Publishes this component's face for as long as it is mounted, and returns
 * the shared (most active) face to render.
 */
export function usePublishMascotFace(
  state: MascotState,
  store: MascotFaceStore = mascotFaceStore,
): MascotState {
  const id = useId()
  useEffect(() => {
    store.setFace(id, state)
  }, [store, id, state])
  useEffect(() => () => store.clearFace(id), [store, id])
  return useMascotFace(store)
}
