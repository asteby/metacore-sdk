// Host ports (inject HTTP, realtime, user, navigation, capabilities)
export * from './host'

// Agent workspace UI
export { AbyChatPane } from './workspace/aby-chat-pane'
export { AIChatWidget } from './workspace/ai-chat-widget'
export { AGENT_BAR } from './workspace/agent-surfaces'
export * from './workspace/agent-workspace-chrome'
export { Mascot } from './workspace/mascot'

// Team chat + calls
export { TeamChat } from './team-chat'
export { CallProvider, useCall } from './team-chat/call-provider'
export { ShareToChatHost, requestShareToChat } from './team-chat/share-to-chat-host'
export * from './team-chat/data/share-embed'
export * from './team-chat/data/types'
export { resolveUserAvatar, initials } from './team-chat/components/channel-avatar'

// Agent guidance, capabilities and page surfaces
export * from './lib/aby-guidance'
export * from './lib/aby-capability-registry'
export * from './lib/aby-dynamic-surfaces'
export * from './lib/aby-guide-builder'
export * from './lib/aby-immersive'
export * from './lib/aby-widget'
export * from './lib/chat-context'
export { playNotificationSound } from './lib/sound'
