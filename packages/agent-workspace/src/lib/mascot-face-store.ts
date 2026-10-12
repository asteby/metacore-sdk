import { create } from 'zustand'
import type { MascotState } from '../workspace/mascot'

/**
 * One face for every mascot on screen. Each chat pane publishes its own
 * state; the visible face is the most active one, so a hidden idle pane
 * cannot paint over a pane that is thinking.
 */
const rank: Record<MascotState, number> = {
  idle: 0,
  happy: 1,
  listening: 2,
  thinking: 3,
  processing: 4,
  speaking: 5,
  error: 6,
}

function pick(faces: Record<string, MascotState>): MascotState {
  let best: MascotState = 'idle'
  for (const state of Object.values(faces)) {
    if (rank[state] > rank[best]) best = state
  }
  return best
}

type MascotFaceStore = {
  state: MascotState
  faces: Record<string, MascotState>
  setFace: (id: string, state: MascotState) => void
  clearFace: (id: string) => void
}

export const useMascotFaceStore = create<MascotFaceStore>((set, get) => ({
  state: 'idle',
  faces: {},
  setFace: (id, state) => {
    if (get().faces[id] === state) return
    const faces = { ...get().faces, [id]: state }
    set({ faces, state: pick(faces) })
  },
  clearFace: (id) => {
    if (!(id in get().faces)) return
    const faces = { ...get().faces }
    delete faces[id]
    set({ faces, state: pick(faces) })
  },
}))
