import { create } from 'zustand'

const BRANCH_STORAGE = 'current_branch'

export interface Branch {
  id: string
  name: string
  code: string
}

interface BranchState {
  currentBranch: Branch | null
  setCurrentBranch: (branch: Branch | null) => void
}

export const useBranchStore = create<BranchState>()((set) => {
  const stored = localStorage.getItem(BRANCH_STORAGE)
  const initial = stored ? JSON.parse(stored) : null

  return {
    currentBranch: initial,
    setCurrentBranch: (branch) => {
      if (branch) {
        localStorage.setItem(BRANCH_STORAGE, JSON.stringify(branch))
      } else {
        localStorage.removeItem(BRANCH_STORAGE)
      }
      set({ currentBranch: branch })
    },
  }
})
