// useOrgDocumentTemplates — host primitive for the per-org overlay of addon
// printable documents (Ajustes → Organización → Plantillas).
//
// The addon still owns the default HTML in its bundle. The host persists an
// optional override per (org, addon, document key) and resolves
// `org overlay → addon default` at PDF render time, so a business can change
// tickets/PDFs without a new addon version.
//
//   GET    /api/settings/templates
//   GET    /api/settings/templates/:addon/:key
//   PUT    /api/settings/templates/:addon/:key   { html, paper? }
//   DELETE /api/settings/templates/:addon/:key
//   POST   /api/settings/templates/preview       → application/pdf
//
// ApiClient is a PEER via <ApiProvider> (same one usePrintDocument uses).
import { useCallback, useMemo } from 'react'
import {
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query'
import { useApi } from './api-context'

export interface OrgDocumentCatalogItem {
    addon_key: string
    addon_name: string
    document_key: string
    label: string
    model: string
    paper: string
    filename?: string
    customized: boolean
}

export interface OrgDocumentTemplateDetail extends OrgDocumentCatalogItem {
    html: string
    default_html: string
}

export function orgDocumentCatalogKey() {
    return ['org-document-templates'] as const
}

export function orgDocumentTemplateKey(addonKey: string, documentKey: string) {
    return ['org-document-templates', addonKey, documentKey] as const
}

function unwrapData<T>(res: { data?: unknown }): T {
    const body = (res as { data: any }).data
    const values = body?.success ? body.data : body
    return values as T
}

export function useOrgDocumentCatalog(opts?: { enabled?: boolean }) {
    const api = useApi()
    const query = useQuery<OrgDocumentCatalogItem[]>({
        queryKey: orgDocumentCatalogKey(),
        queryFn: async () => {
            const res = await api.get('/settings/templates')
            const data = unwrapData<OrgDocumentCatalogItem[] | null>(res)
            return Array.isArray(data) ? data : []
        },
        staleTime: 30_000,
        enabled: opts?.enabled ?? true,
    })
    return {
        items: query.data ?? [],
        isLoading: query.isLoading,
        error: query.error,
        refetch: () => {
            void query.refetch()
        },
    }
}

export function useOrgDocumentTemplate(
    addonKey: string,
    documentKey: string,
    opts?: { enabled?: boolean },
) {
    const api = useApi()
    const query = useQuery<OrgDocumentTemplateDetail>({
        queryKey: orgDocumentTemplateKey(addonKey, documentKey),
        queryFn: async () => {
            const res = await api.get(
                `/settings/templates/${encodeURIComponent(addonKey)}/${encodeURIComponent(documentKey)}`,
            )
            return unwrapData<OrgDocumentTemplateDetail>(res)
        },
        enabled:
            (opts?.enabled ?? true) && !!addonKey && !!documentKey,
    })
    return {
        template: query.data,
        isLoading: query.isLoading,
        error: query.error,
        refetch: () => {
            void query.refetch()
        },
    }
}

export function useSaveOrgDocumentTemplate() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation<
        OrgDocumentTemplateDetail,
        Error,
        { addonKey: string; documentKey: string; html: string; paper?: string }
    >({
        mutationFn: async ({ addonKey, documentKey, html, paper }) => {
            const res = await api.put(
                `/settings/templates/${encodeURIComponent(addonKey)}/${encodeURIComponent(documentKey)}`,
                { html, paper },
            )
            return unwrapData<OrgDocumentTemplateDetail>(res)
        },
        onSuccess: (_data, vars) => {
            void qc.invalidateQueries({ queryKey: orgDocumentCatalogKey() })
            void qc.invalidateQueries({
                queryKey: orgDocumentTemplateKey(vars.addonKey, vars.documentKey),
            })
        },
    })
}

export function useResetOrgDocumentTemplate() {
    const api = useApi()
    const qc = useQueryClient()
    return useMutation<
        OrgDocumentTemplateDetail,
        Error,
        { addonKey: string; documentKey: string }
    >({
        mutationFn: async ({ addonKey, documentKey }) => {
            const res = await api.delete(
                `/settings/templates/${encodeURIComponent(addonKey)}/${encodeURIComponent(documentKey)}`,
            )
            return unwrapData<OrgDocumentTemplateDetail>(res)
        },
        onSuccess: (_data, vars) => {
            void qc.invalidateQueries({ queryKey: orgDocumentCatalogKey() })
            void qc.invalidateQueries({
                queryKey: orgDocumentTemplateKey(vars.addonKey, vars.documentKey),
            })
        },
    })
}

/**
 * Renders a PDF preview of unsaved HTML against dummy record + org branding.
 * Returns a blob URL the caller should revoke.
 */
export function usePreviewOrgDocumentTemplate() {
    const api = useApi()
    return useCallback(
        async (args: {
            addonKey: string
            documentKey: string
            html: string
            paper?: string
        }): Promise<string> => {
            const res = await api.post(
                '/settings/templates/preview',
                {
                    addon_key: args.addonKey,
                    document_key: args.documentKey,
                    html: args.html,
                    paper: args.paper,
                },
                { responseType: 'blob' },
            )
            const blob =
                res.data instanceof Blob
                    ? res.data
                    : new Blob([res.data], { type: 'application/pdf' })
            return URL.createObjectURL(blob)
        },
        [api],
    )
}

export function groupDocumentCatalog(
    items: OrgDocumentCatalogItem[],
): { addonKey: string; addonName: string; documents: OrgDocumentCatalogItem[] }[] {
    const order: string[] = []
    const byAddon = new Map<string, OrgDocumentCatalogItem[]>()
    for (const item of items) {
        const list = byAddon.get(item.addon_key)
        if (list) {
            list.push(item)
        } else {
            order.push(item.addon_key)
            byAddon.set(item.addon_key, [item])
        }
    }
    return order.map((addonKey) => {
        const documents = byAddon.get(addonKey) ?? []
        return {
            addonKey,
            addonName: documents[0]?.addon_name || addonKey,
            documents,
        }
    })
}

export function useGroupedOrgDocumentCatalog(opts?: { enabled?: boolean }) {
    const catalog = useOrgDocumentCatalog(opts)
    const groups = useMemo(
        () => groupDocumentCatalog(catalog.items),
        [catalog.items],
    )
    return { ...catalog, groups }
}
