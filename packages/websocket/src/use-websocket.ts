import { useRef, useState, useCallback, useEffect } from 'react'

export enum ReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

interface UseWebSocketOptions {
    shouldReconnect?: (event: CloseEvent) => boolean
    reconnectAttempts?: number
    reconnectInterval?: number
    onOpen?: (event: Event) => void
    onClose?: (event: CloseEvent) => void
    onError?: (event: Event) => void
}

interface UseWebSocketReturn {
    sendMessage: (message: string) => void
    lastMessage: MessageEvent | null
    readyState: ReadyState
}

export function useWebSocket(
    url: string | null,
    options: UseWebSocketOptions = {}
): UseWebSocketReturn {
    const {
        reconnectAttempts = 10,
        reconnectInterval = 3000,
    } = options

    const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null)
    const [readyState, setReadyState] = useState<ReadyState>(ReadyState.CLOSED)

    const wsRef = useRef<WebSocket | null>(null)
    const reconnectCount = useRef(0)
    const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
    const optionsRef = useRef(options)
    optionsRef.current = options
    const urlRef = useRef(url)
    urlRef.current = url

    const cleanup = useCallback(() => {
        clearTimeout(reconnectTimer.current)
        if (wsRef.current) {
            wsRef.current.onopen = null
            wsRef.current.onclose = null
            wsRef.current.onerror = null
            wsRef.current.onmessage = null
            wsRef.current.close()
            wsRef.current = null
        }
    }, [])

    const connect = useCallback(() => {
        const currentUrl = urlRef.current
        if (!currentUrl) return

        cleanup()
        setReadyState(ReadyState.CONNECTING)

        const ws = new WebSocket(currentUrl)
        wsRef.current = ws

        ws.onopen = (event) => {
            reconnectCount.current = 0
            setReadyState(ReadyState.OPEN)
            optionsRef.current.onOpen?.(event)
        }

        ws.onmessage = (event) => {
            setLastMessage(event)
        }

        ws.onerror = (event) => {
            optionsRef.current.onError?.(event)
        }

        ws.onclose = (event) => {
            setReadyState(ReadyState.CLOSED)
            optionsRef.current.onClose?.(event)

            if (
                optionsRef.current.shouldReconnect?.(event) &&
                reconnectCount.current < (optionsRef.current.reconnectAttempts ?? reconnectAttempts)
            ) {
                reconnectTimer.current = setTimeout(() => {
                    reconnectCount.current++
                    connect()
                }, optionsRef.current.reconnectInterval ?? reconnectInterval)
            }
        }
    }, [cleanup, reconnectAttempts, reconnectInterval])

    const sendMessage = useCallback((message: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(message)
        }
    }, [])

    useEffect(() => {
        if (url) {
            reconnectCount.current = 0
            connect()
        } else {
            cleanup()
            setReadyState(ReadyState.CLOSED)
        }
        return cleanup
    }, [url, connect, cleanup])

    return { sendMessage, lastMessage, readyState }
}
