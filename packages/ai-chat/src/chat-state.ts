import type { ChatMessage, ChatProposal } from './types'

export interface ChatState {
  sessionId: string | null
  messages: ChatMessage[]
  loading: boolean
}

export type ChatAction =
  | { type: 'user'; message: ChatMessage }
  | { type: 'reply'; message: ChatMessage; sessionId: string }
  | { type: 'error'; message: ChatMessage }
  | { type: 'history'; sessionId: string; messages: ChatMessage[] }
  | { type: 'proposal'; id: string; status: NonNullable<ChatProposal['status']> }
  | { type: 'reset' }

export const initialChatState: ChatState = { sessionId: null, messages: [], loading: false }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'user':
      return { ...state, loading: true, messages: [...state.messages, action.message] }
    case 'reply':
      return {
        sessionId: action.sessionId || state.sessionId,
        loading: false,
        messages: [...state.messages, { ...action.message, fresh: true }],
      }
    case 'error':
      return { ...state, loading: false, messages: [...state.messages, { ...action.message, error: true }] }
    case 'history':
      return { sessionId: action.sessionId, loading: false, messages: action.messages }
    case 'proposal':
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.proposals?.some((p) => p.id === action.id)
            ? { ...m, proposals: m.proposals.map((p) => (p.id === action.id ? { ...p, status: action.status } : p)) }
            : m,
        ),
      }
    case 'reset':
      return initialChatState
  }
}
