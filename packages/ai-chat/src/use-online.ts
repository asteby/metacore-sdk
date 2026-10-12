import { useEffect, useState } from 'react'

const read = () => (typeof navigator === 'undefined' || navigator.onLine === undefined ? true : navigator.onLine)

/** Tracks `navigator.onLine` via the online/offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(read)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    setOnline(read())
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
