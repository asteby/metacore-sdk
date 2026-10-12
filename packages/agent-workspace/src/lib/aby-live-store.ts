import { create } from 'zustand'

export type AbyLivePhase = 'idle' | 'listening' | 'thinking' | 'speaking'

export type AbyPendingProposal = {
  /** Primary id (first pending) — kept for PiP title / legacy. */
  id: string
  /** All pending proposal ids in the thread (batch accept/reject). */
  ids: string[]
  title: string
  deciding?: boolean
}

type DecideHandler = (proposalIds: string[], approve: boolean) => void

type AbyLiveState = {
  active: boolean
  phase: AbyLivePhase
  hint: string
  /** What Aby is saying (TTS) or the live transcript being heard. */
  utterance: string
  /** Recent thought / tool steps for the PiP trail. */
  thoughts: string[]
  /** User muted their mic (live stays on; Aby can still speak). */
  micMuted: boolean
  /** Latest pending proposal — Document PiP / orb can decide without restoring chat. */
  pendingProposal: AbyPendingProposal | null
  setActive: (active: boolean) => void
  setPhase: (phase: AbyLivePhase, hint?: string) => void
  setUtterance: (utterance: string) => void
  setThoughts: (thoughts: string[]) => void
  setMicMuted: (muted: boolean) => void
  toggleMicMuted: () => void
  setPendingProposal: (proposal: AbyPendingProposal | null) => void
  setDecideHandler: (handler: DecideHandler | null) => void
  decidePending: (approve: boolean) => void
  reset: () => void
}

let decideHandler: DecideHandler | null = null

/** Shared live-mode status so the floating PiP orb can mirror Aby outside the panel. */
export const useAbyLiveStore = create<AbyLiveState>((set, get) => ({
  active: false,
  phase: 'idle',
  hint: '',
  utterance: '',
  thoughts: [],
  micMuted: false,
  pendingProposal: null,
  setActive: (active) =>
    set((s) => ({
      active,
      phase: active ? s.phase : 'idle',
      hint: active ? s.hint : '',
      utterance: active ? s.utterance : '',
      thoughts: active ? s.thoughts : [],
      micMuted: active ? s.micMuted : false,
      pendingProposal: active ? s.pendingProposal : null,
    })),
  setPhase: (phase, hint) => set({ phase, hint: hint ?? '' }),
  setUtterance: (utterance) => set({ utterance }),
  setThoughts: (thoughts) => set({ thoughts: thoughts.slice(-4) }),
  setMicMuted: (micMuted) => set({ micMuted }),
  toggleMicMuted: () => set((s) => ({ micMuted: !s.micMuted })),
  setPendingProposal: (pendingProposal) => set({ pendingProposal }),
  setDecideHandler: (handler) => {
    decideHandler = handler
  },
  decidePending: (approve) => {
    const p = get().pendingProposal
    const ids = p?.ids?.length ? p.ids : p?.id ? [p.id] : []
    if (!ids.length || p?.deciding || !decideHandler) return
    decideHandler(ids, approve)
  },
  reset: () =>
    set({
      active: false,
      phase: 'idle',
      hint: '',
      utterance: '',
      thoughts: [],
      micMuted: false,
      pendingProposal: null,
    }),
}))
