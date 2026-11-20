// createHostApiClient — the ONE HTTP client for federated addons (modals,
// pickers, pages). It wraps the host-injected HostApi (see createHostApi), so:
//   - baseURL, bearer token, org/branch/language headers, 401 handling and
//     refresh live in the HOST transport; the addon never reads localStorage;
//   - the kernel envelope `{success,data,meta}` is unwrapped here with
//     @asteby/metacore-lib/envelope (success:false throws ApiError);
//   - every failure is the single `ApiError` (status, code, details);
//   - a cancelled request rethrows an AbortError (use isAbortError()).
import { HostApiError } from '@asteby/metacore-sdk'
import type { HostApi, HostApiParams } from '@asteby/metacore-sdk'
import {
    ApiError,
    isAbortError,
    isEnvelope,
    unwrapEnvelope,
    unwrapList,
    type UnwrappedList,
} from '@asteby/metacore-lib/envelope'

export { ApiError, isAbortError }

export interface HostRequestConfig {
    params?: HostApiParams
    signal?: AbortSignal
}

/** Minimal axios-like surface (what DynamicSelectField & co. call). */
export interface AxiosLikeClient {
    get(url: string, config?: HostRequestConfig): Promise<{ data: unknown }>
    post(url: string, body?: unknown, config?: HostRequestConfig): Promise<{ data: unknown }>
    put(url: string, body?: unknown, config?: HostRequestConfig): Promise<{ data: unknown }>
    patch(url: string, body?: unknown, config?: HostRequestConfig): Promise<{ data: unknown }>
    delete(url: string, config?: HostRequestConfig): Promise<{ data: unknown }>
}

export interface HostApiClient {
    /** Unwrapped `data` of the envelope (bare bodies pass through). */
    get<T = unknown>(path: string, config?: HostRequestConfig): Promise<T>
    post<T = unknown>(path: string, body?: unknown, config?: HostRequestConfig): Promise<T>
    put<T = unknown>(path: string, body?: unknown, config?: HostRequestConfig): Promise<T>
    patch<T = unknown>(path: string, body?: unknown, config?: HostRequestConfig): Promise<T>
    delete<T = unknown>(path: string, config?: HostRequestConfig): Promise<T>
    /** List read: `items` + `total` (meta.total) + `meta`. Never null. */
    list<T = unknown>(path: string, config?: HostRequestConfig): Promise<UnwrappedList<T>>
    /** Binary read (PDF, image, CSV) as a Blob. */
    blob(path: string, config?: HostRequestConfig): Promise<Blob>
    /**
     * Multipart upload. Pass a ready FormData, or a File plus extra fields
     * (`{ folder }`); the file goes under `fileField` (default `"file"`).
     * The transport sets the multipart boundary; do not set Content-Type.
     */
    upload<T = unknown>(
        path: string,
        file: File | Blob | FormData,
        fields?: Record<string, string>,
        opts?: { fileField?: string; signal?: AbortSignal },
    ): Promise<T>
    /**
     * Axios-like adapter for runtime-react fields that expect `{ data }` with
     * the envelope still in place (`<ApiProvider client={client.axiosLike()}>`
     * for a federated remote mounted outside the host provider).
     */
    axiosLike(): AxiosLikeClient
}

function abortError(signal: AbortSignal): Error {
    const reason = signal.reason
    if (reason instanceof Error && isAbortError(reason)) return reason
    const e = new Error('The operation was aborted')
    e.name = 'AbortError'
    return e
}

function toApiError(e: unknown, signal?: AbortSignal): Error {
    if (isAbortError(e)) return e as Error
    if (signal?.aborted) return abortError(signal)
    if (e instanceof ApiError) return e
    if (e instanceof HostApiError) {
        return new ApiError(e.message, { status: e.status || undefined, code: e.code, details: e.data, cause: e })
    }
    if (e instanceof Error) return new ApiError(e.message, { cause: e })
    return new ApiError('request failed', { cause: e })
}

/** Build the client over the host-injected {@link HostApi}. */
export function createHostApiClient(api: HostApi): HostApiClient {
    const run = async <R,>(p: () => Promise<R>, signal?: AbortSignal): Promise<R> => {
        try {
            return await p()
        } catch (e) {
            throw toApiError(e, signal)
        }
    }
    const body = <T,>(p: () => Promise<unknown>, signal?: AbortSignal) =>
        run(async () => unwrapEnvelope<T>(await p()), signal)

    const client: HostApiClient = {
        get: (path, c) => body(() => api.get(path, c), c?.signal),
        post: (path, b, c) => body(() => api.post(path, b, c), c?.signal),
        put: (path, b, c) => body(() => api.put(path, b, c), c?.signal),
        patch: (path, b, c) => body(() => api.patch(path, b, c), c?.signal),
        delete: (path, c) => body(() => api.delete(path, c), c?.signal),
        list: (path, c) =>
            run(async () => unwrapList(await api.get(path, c)), c?.signal),
        blob: (path, c) =>
            run(() => api.get<Blob>(path, { ...c, responseType: 'blob' }), c?.signal),
        upload: (path, file, fields, opts) => {
            let form: FormData
            if (typeof FormData !== 'undefined' && file instanceof FormData) {
                form = file
            } else {
                form = new FormData()
                form.append(opts?.fileField ?? 'file', file as Blob)
                for (const [k, v] of Object.entries(fields ?? {})) form.append(k, v)
            }
            return body(() => api.post(path, form, opts?.signal ? { signal: opts.signal } : undefined), opts?.signal)
        },
        axiosLike: () => {
            // Envelope kept (the runtime-react fields unwrap it themselves),
            // but a `success:false` body still fails as ApiError.
            const raw = async (p: () => Promise<unknown>, signal?: AbortSignal) =>
                run(async () => {
                    const data = await p()
                    if (isEnvelope(data)) unwrapEnvelope(data)
                    return { data }
                }, signal)
            return {
                get: (u, c) => raw(() => api.get(u, c), c?.signal),
                post: (u, b, c) => raw(() => api.post(u, b, c), c?.signal),
                put: (u, b, c) => raw(() => api.put(u, b, c), c?.signal),
                patch: (u, b, c) => raw(() => api.patch(u, b, c), c?.signal),
                delete: (u, c) => raw(() => api.delete(u, c), c?.signal),
            }
        },
    }
    return client
}
