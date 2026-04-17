import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import pkg from 'react-use-websocket'
const useWebSocket = pkg.default || pkg
const ReadyState = pkg.ReadyState
import { useAuthStore } from '@/stores/auth-store'
import { useMetadataCache } from '@/stores/metadata-cache'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { playNotificationSound } from '@/lib/sound'

interface NotificationPayload {
    title: string
    body: string
    contact_name: string
    contact_phone?: string
    contact_avatar: string
    conversation_id: string
    device_id: string
    timestamp: string
    unread_count: number
    link?: string
}

interface WebSocketContextType {
    sendMessage: (message: any) => void
    lastMessage: MessageEvent<any> | null
    readyState: ReadyState
    isConnected: boolean
    totalUnread: number
    activeConversationId: string | null
    setActiveConversationId: (id: string | null) => void
    clearUnread: () => void
    markMessageAsSeen: (messageId: string) => void
    deviceStatuses: Record<string, 'active' | 'disconnected' | 'pending'>
    updateDeviceStatus: (deviceId: string, status: 'active' | 'disconnected' | 'pending') => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { auth } = useAuthStore()
    const token = auth.accessToken
    const [totalUnread, setTotalUnread] = useState(0)
    const navigate = useNavigate()

    // Track which conversation is currently being viewed
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

    // Track device connection statuses
    const [deviceStatuses, setDeviceStatuses] = useState<Record<string, 'active' | 'disconnected' | 'pending'>>({})

    const updateDeviceStatus = useCallback((deviceId: string, status: 'active' | 'disconnected' | 'pending') => {
        setDeviceStatuses(prev => ({ ...prev, [deviceId]: status }))
    }, [])

    // Track message IDs that have been seen (to prevent duplicate notifications)
    const seenMessageIds = useRef<Set<string>>(new Set())

    // Get current route to check if user is in chat view
    const location = useLocation()
    const isInChatView = location.pathname.includes('/chats') || location.pathname.includes('/conversations')

    // WebSocket URL - use VITE_WS_URL or derive from VITE_API_URL
    const getWsUrl = () => {
        // If explicit WS URL is set, use it
        if (import.meta.env.VITE_WS_URL) {
            return import.meta.env.VITE_WS_URL
        }
        // Otherwise, derive from API URL
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
        // Convert http(s) to ws(s)
        return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '') + '/ws'
    }
    const WS_URL = getWsUrl()

    const { sendMessage, lastMessage, readyState } = useWebSocket(
        token ? `${WS_URL}?token=${token}` : null,
        {
            shouldReconnect: () => true,
            reconnectAttempts: 10,
            reconnectInterval: 3000,
            onOpen: () => console.log('🟢 WebSocket Connected'),
            onClose: () => console.log('🔴 WebSocket Disconnected'),
            onError: (e: Event) => console.error('WebSocket Error', e),
        }
    )

    const isConnected = readyState === ReadyState.OPEN

    const clearUnread = useCallback(() => {
        setTotalUnread(0)
    }, [])

    // Mark a message as seen (called by Chats component when it processes a message)
    const markMessageAsSeen = useCallback((messageId: string) => {
        seenMessageIds.current.add(messageId)
        // Limit the set size to prevent memory leaks
        if (seenMessageIds.current.size > 1000) {
            const arr = Array.from(seenMessageIds.current)
            seenMessageIds.current = new Set(arr.slice(-500))
        }
    }, [])

    // Manage Subscription to Active Conversation
    useEffect(() => {
        if (!isConnected) return

        if (activeConversationId) {
            console.log('📡 Subscribing to conversation:', activeConversationId)
            sendMessage(JSON.stringify({
                type: 'SUBSCRIBE',
                conversation_id: activeConversationId
            }))
        } else {
            console.log('📡 Unsubscribing from active conversation')
            sendMessage(JSON.stringify({
                type: 'UNSUBSCRIBE'
            }))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConversationId, isConnected]) // Remove sendMessage from dependencies

    // Clear active conversation when leaving chat view
    useEffect(() => {
        if (!isInChatView) {
            setActiveConversationId(null)
        }
    }, [isInChatView])

    // Keep track of processed messages
    const prevLastMessage = useRef<MessageEvent<any> | null>(null)

    // Helper function to handle notification click navigation
    const handleNotificationClick = useCallback((payload: NotificationPayload) => {
        if (payload.link) {
            if (payload.link.startsWith('http')) {
                window.open(payload.link, '_blank')
            } else {
                navigate({ to: payload.link })
            }
        } else if (payload.conversation_id) {
            navigate({ to: '/chats', search: { id: payload.conversation_id } })
        }
    }, [navigate])

    // Global Message and Notification Handling
    useEffect(() => {
        if (!lastMessage || lastMessage === prevLastMessage.current) return
        prevLastMessage.current = lastMessage

        try {
            const data = JSON.parse(lastMessage.data)
            console.log('📥 WebSocket message:', data)

            // Handle NOTIFICATION (Lightweight)
            if (data.type === 'NOTIFICATION') {
                const payload = data.payload as NotificationPayload

                // Even with smart subscription, we double check active conversation
                // But generally, the backend only sends NOTIFICATION to non-active chats
                if (activeConversationId === payload.conversation_id && isInChatView) {
                    // This shouldn't happen with correct backend logic, but just in case
                    return
                }

                setTotalUnread(prev => prev + 1)

                // Play sound
                playNotificationSound()

                // Browser notification if app is in background
                if (Notification.permission === 'granted' && document.hidden) {
                    const n = new Notification(payload.title, {
                        body: payload.body,
                        icon: payload.contact_avatar || '/logo.png',
                        tag: payload.conversation_id,
                    })
                    n.onclick = (e) => {
                        e.preventDefault()
                        window.focus()
                        n.close()
                        handleNotificationClick(payload)
                    }
                } else {
                    // Show toast if app is in foreground
                    // Show toast if app is in foreground
                    toast(
                        <div
                            className="flex flex-col gap-1 cursor-pointer w-full"
                            onClick={() => handleNotificationClick(payload)}
                        >
                            <p className="font-medium text-sm">{payload.title}</p>
                            <p className="text-muted-foreground text-sm">{payload.body}</p>
                        </div>,
                        {
                            duration: 5000,
                        }
                    )
                }
            }

            // Handle NEW_MESSAGE (Full message)
            if (data.type === 'NEW_MESSAGE') {
                const payload = data.payload
                const msg = payload.message
                const conv = payload.conversation

                // Ensure we don't notify if we happen to process this (though Chats component handles it mostly)
                // New logic: Chats component receives this and updates UI.
                // We track it as seen just in case.
                markMessageAsSeen(msg.id)

                // If by any chance we receive NEW_MESSAGE for a chat we are NOT viewing (race condition)
                // we should notify.

                const isViewing = activeConversationId === conv.id
                if (!isViewing) {
                    // Fallback notification logic (similar to NOTIFICATION)
                    // But backend should filter this out.
                }
            }

            if (data.type === 'STATUS_UPDATE') {
                const payload = data.payload
                console.log('📱 Device status update:', payload)
                if (payload.device_id && payload.status) {
                    updateDeviceStatus(payload.device_id, payload.status)
                }
            }

            // Handle addon install/uninstall/enable/disable → invalidate metadata cache
            if (data.type === 'addon_changed') {
                console.log('🔌 Addon changed:', data.payload)
                useMetadataCache.setState({ cache: {}, modalCache: {}, prefetched: false })
                useMetadataCache.getState().prefetchAll()
            }
        } catch (e) {
            console.warn('Could not parse WebSocket message:', e)
        }
    }, [lastMessage, isInChatView, activeConversationId, markMessageAsSeen, updateDeviceStatus])


    return (
        <WebSocketContext.Provider value={{
            sendMessage,
            lastMessage,
            readyState,
            isConnected,
            totalUnread,
            activeConversationId,
            setActiveConversationId,
            clearUnread,
            markMessageAsSeen,
            deviceStatuses,
            updateDeviceStatus
        }}>
            {children}
        </WebSocketContext.Provider>
    )
}

export function useWebSocketContext() {
    const context = useContext(WebSocketContext)
    if (context === undefined) {
        throw new Error('useWebSocketContext must be used within a WebSocketProvider')
    }
    return context
}
