// AddonPageHost — what the host mounts around a federated page (embedded or
// full screen) so the remote can use host services without importing host
// code and without ever touching credentials.
//
// Host side (ops FederatedPageHost, starter-core):
//
//   const chrome = useMemo(createPageChromeStore, [])
//   <AddonPageHost
//     host={hostContext}                         // org, user, branch, locale…
//     api={hostApi}                              // createHostApi(axios)
//     basePath="/a/shipping/control-tower"
//     location={{ pathname, search }}            // from the host router
//     navigate={(to, o) => router.navigate({ to, replace: o?.replace })}
//     chrome={chrome}                            // header reads it
//   >
//     <Page … />
//   </AddonPageHost>
//
//   // header: const { title, actions, focus, breadcrumbs } = usePageChromeState(chrome)
//
// Remote side (inside the page):
//
//   const api = useHostApi()
//   const { org, user, locale } = useHostContext()
//   const navigate = useAddonNavigate()      // relative to basePath
//   const [params, setParams] = useAddonSearchParams()
//   useBreadcrumbs([{ title: t('shipping.nav.group'), url: '/m/Shipment' }])
//   usePageChrome({ title: t('shipping.pages.control_tower'), focus: true })
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
    type ReactNode,
} from 'react'
import type {
    AddonHostContext,
    Breadcrumb,
    HostApi,
    PageChrome,
} from '@asteby/metacore-sdk'

// ---------------------------------------------------------------------------
// Chrome store: page → host header. A tiny external store so the header (above
// the page in the tree) re-renders without a provider re-render cascade.
// ---------------------------------------------------------------------------

export interface PageChromeState extends PageChrome {
    breadcrumbs: Breadcrumb[]
}

export interface PageChromeStore {
    get(): PageChromeState
    subscribe(listener: () => void): () => void
    /** Merge a partial update (page side). */
    set(patch: Partial<PageChromeState>): void
    /** Back to empty (page unmounted). */
    reset(): void
}

const EMPTY_CHROME: PageChromeState = Object.freeze({ breadcrumbs: [] }) as PageChromeState

export function createPageChromeStore(initial?: Partial<PageChromeState>): PageChromeStore {
    let state: PageChromeState = { ...EMPTY_CHROME, ...initial }
    const listeners = new Set<() => void>()
    const emit = () => listeners.forEach((l) => l())
    return {
        get: () => state,
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        set(patch) {
            state = { ...state, ...patch }
            emit()
        },
        reset() {
            state = { ...EMPTY_CHROME, ...initial }
            emit()
        },
    }
}

/** Host side: subscribe the header to what the page declared. */
export function usePageChromeState(store: PageChromeStore): PageChromeState {
    return useSyncExternalStore(store.subscribe, store.get, store.get)
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface AddonNavigateOptions {
    replace?: boolean
}

/** Location of the host router, as plain strings (router-agnostic). */
export interface AddonPageLocation {
    pathname: string
    search: string
}

export interface AddonPageHostValue {
    host: AddonHostContext
    api: HostApi
    basePath: string
    location: AddonPageLocation
    navigate: (to: string, opts?: AddonNavigateOptions) => void
    chrome?: PageChromeStore
}

const AddonPageHostContext = createContext<AddonPageHostValue | null>(null)

export interface AddonPageHostProps extends Omit<AddonPageHostValue, 'basePath'> {
    basePath: string
    children: ReactNode
}

export function AddonPageHost({
    host,
    api,
    basePath,
    location,
    navigate,
    chrome,
    children,
}: AddonPageHostProps) {
    const base = normalizeBase(basePath)
    const value = useMemo<AddonPageHostValue>(
        () => ({ host, api, basePath: base, location, navigate, chrome }),
        [host, api, base, location, navigate, chrome],
    )
    // The chrome belongs to the page: clear it when the page goes away so the
    // next screen does not inherit a stale title or header buttons.
    useEffect(() => () => chrome?.reset(), [chrome])
    return <AddonPageHostContext.Provider value={value}>{children}</AddonPageHostContext.Provider>
}

function usePageHost(hook: string): AddonPageHostValue {
    const ctx = useContext(AddonPageHostContext)
    if (!ctx) {
        throw new Error(
            `${hook}() must run inside <AddonPageHost>. Hosts mount it around every federated page; ` +
                'in tests use renderWithHost() from @asteby/metacore-runtime-react/testing.',
        )
    }
    return ctx
}

/** True when rendered inside a host page (lets shared components degrade). */
export function useIsInAddonPage(): boolean {
    return useContext(AddonPageHostContext) !== null
}

// ---------------------------------------------------------------------------
// Remote-facing hooks
// ---------------------------------------------------------------------------

/** Org, user, branch, locale, installed addons and realtime of the host. */
export function useHostContext(): AddonHostContext {
    return usePageHost('useHostContext').host
}

/** Authenticated API client provided by the host (never exposes the token). */
export function useHostApi(): HostApi {
    return usePageHost('useHostApi').api
}

function normalizeBase(base: string): string {
    const b = `/${base.replace(/^\/+|\/+$/g, '')}`
    return b === '/' ? '' : b
}

/**
 * Resolve `to` inside the page. Plain paths are base-relative:
 * `"shipments/42"` and `"/shipments/42"` both land on `<base>/shipments/42`.
 * `"./x"` and `"../x"` resolve against the current sub-path (like URLs), and
 * `".."` never climbs above the base. `""` / `"?q=1"` keep the current path.
 * A `?query` / `#hash` is kept.
 */
export function resolveAddonPath(basePath: string, currentSubpath: string, to: string): string {
    const base = normalizeBase(basePath)
    const m = /^([^?#]*)(.*)$/.exec(to)
    const pathPart = m ? m[1] : to
    const suffix = m ? m[2] : ''
    const current = currentSubpath.split('/').filter(Boolean)
    let segs: string[]
    if (pathPart === '') {
        segs = current
    } else if (pathPart.startsWith('./') || pathPart.startsWith('../') || pathPart === '.' || pathPart === '..') {
        // Relative to the current "directory" (drop the last segment, like URLs).
        segs = current.slice(0, -1)
    } else {
        segs = []
    }
    for (const seg of pathPart.split('/')) {
        if (!seg || seg === '.') continue
        if (seg === '..') segs.pop()
        else segs.push(seg)
    }
    const rest = segs.join('/')
    return `${base}${rest ? `/${rest}` : ''}${suffix}` || '/'
}

/** Path below the page base (`"shipments/42"`), from the host location. */
export function addonSubpath(basePath: string, pathname: string): string {
    const base = normalizeBase(basePath)
    if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
        return pathname.slice(base.length).replace(/^\/+/, '')
    }
    return ''
}

/**
 * Navigate inside the page. The host router does the work (no
 * `window.location`), so history, guards and the shell stay intact.
 * `navigate(-1)` goes back.
 */
export function useAddonNavigate(): (to: string | number, opts?: AddonNavigateOptions) => void {
    const { basePath, location, navigate } = usePageHost('useAddonNavigate')
    const sub = addonSubpath(basePath, location.pathname)
    return useCallback(
        (to: string | number, opts?: AddonNavigateOptions) => {
            if (typeof to === 'number') {
                if (typeof window !== 'undefined') window.history.go(to)
                return
            }
            navigate(resolveAddonPath(basePath, sub, to), opts)
        },
        [basePath, sub, navigate],
    )
}

/** Location relative to the page: `{ path: "shipments/42", search: "?x=1" }`. */
export function useAddonLocation(): { path: string; search: string } {
    const { basePath, location } = usePageHost('useAddonLocation')
    return useMemo(
        () => ({ path: addonSubpath(basePath, location.pathname), search: location.search }),
        [basePath, location.pathname, location.search],
    )
}

/** Search params of the page URL, with a setter that goes through the host router. */
export function useAddonSearchParams(): [
    URLSearchParams,
    (next: URLSearchParams | Record<string, string>, opts?: AddonNavigateOptions) => void,
] {
    const { basePath, location, navigate } = usePageHost('useAddonSearchParams')
    const params = useMemo(() => new URLSearchParams(location.search), [location.search])
    const set = useCallback(
        (next: URLSearchParams | Record<string, string>, opts?: AddonNavigateOptions) => {
            const qs = (next instanceof URLSearchParams ? next : new URLSearchParams(next)).toString()
            const sub = addonSubpath(basePath, location.pathname)
            navigate(`${normalizeBase(basePath)}${sub ? `/${sub}` : ''}${qs ? `?${qs}` : ''}`, {
                replace: opts?.replace ?? true,
            })
        },
        [basePath, location.pathname, navigate],
    )
    return [params, set]
}

function sameCrumbs(a: Breadcrumb[], b: Breadcrumb[]): boolean {
    return a.length === b.length && a.every((c, i) => c.title === b[i].title && c.url === b[i].url)
}

/**
 * Declare the page's breadcrumbs (shown by the host header before the page
 * title). Cleared on unmount. No-op on hosts without a chrome store.
 */
export function useBreadcrumbs(crumbs: Breadcrumb[]): void {
    const { chrome } = usePageHost('useBreadcrumbs')
    const last = useRef<Breadcrumb[] | null>(null)
    useEffect(() => {
        if (!chrome) return
        if (last.current && sameCrumbs(last.current, crumbs)) return
        last.current = crumbs
        chrome.set({ breadcrumbs: crumbs })
    })
    useEffect(
        () => () => {
            last.current = null
            chrome?.set({ breadcrumbs: [] })
        },
        [chrome],
    )
}

/**
 * Declare title, subtitle, header actions and focus mode. Values update on
 * every render that changes them; everything is cleared on unmount.
 */
export function usePageChrome(chrome: PageChrome): void {
    const { chrome: store } = usePageHost('usePageChrome')
    const { title, subtitle, actions, focus } = chrome
    // Action handlers are usually inline closures: keep the latest in a ref so
    // the store only changes when what the header SHOWS changes.
    const handlers = useRef(new Map<string, () => void>())
    handlers.current = new Map((actions ?? []).map((a) => [a.key, a.onSelect]))
    const actionsSig = JSON.stringify(
        (actions ?? []).map(({ onSelect: _onSelect, ...rest }) => rest),
    )
    useEffect(() => {
        if (!store) return
        const stable = (actions ?? []).map((a) => ({
            ...a,
            onSelect: () => handlers.current.get(a.key)?.(),
        }))
        store.set({ title, subtitle, actions: stable, focus })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, title, subtitle, actionsSig, focus])
    useEffect(
        () => () => store?.set({ title: undefined, subtitle: undefined, actions: undefined, focus: undefined }),
        [store],
    )
}
