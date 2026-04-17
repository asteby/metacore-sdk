
import { useState } from 'react'

export function useAppBadge() {
    const [counter, setCounter] = useState(0)

    const setBadge = (count: number) => {
        setCounter(count)
        if ('setAppBadge' in navigator) {
            if (count > 0) {
                navigator.setAppBadge(count).catch((e) => {
                    console.error('Error setting app badge:', e)
                })
            } else {
                navigator.clearAppBadge().catch((e) => {
                    console.error('Error clearing app badge:', e)
                })
            }
        }
    }

    const clearBadge = () => {
        setCounter(0)
        if ('clearAppBadge' in navigator) {
            navigator.clearAppBadge().catch((e) => {
                console.error('Error clearing app badge:', e)
            })
        }
    }

    return {
        badgeCount: counter,
        setBadge,
        clearBadge
    }
}
