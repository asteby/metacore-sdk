// Newer Node ships an experimental `localStorage` global that is undefined
// without --localstorage-file and shadows happy-dom's. Restore a working one.
const store = (): Storage => {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof (globalThis as any)[name]?.getItem !== 'function') {
    Object.defineProperty(globalThis, name, { value: store(), configurable: true })
  }
}
