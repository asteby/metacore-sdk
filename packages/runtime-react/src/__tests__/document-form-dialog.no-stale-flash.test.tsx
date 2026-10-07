// @vitest-environment happy-dom
// QA Pitsline r6: «al abrir una Nota de crédito se ve un instante el modal viejo»
// antes del DocumentEditor. El host reutiliza el diálogo montado (misma ruta
// /m/$model para Facturas → Notas de crédito, o formularios que cambian de la
// caché a la metadata viva mientras está cerrado) y el primer render al abrir
// pintaba el wizard con el tipo de la apertura anterior: el reinicio vivía en un
// efecto, que corre DESPUÉS de que ese frame ya se pintó.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const i18n = { language: 'es' }
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    const value = { t, i18n }
    return { useTranslation: () => value }
})
// Dialog sin portal ni Presence: cada commit de React llega tal cual al DOM. Con
// el portal de Radix el primer commit al abrir queda vacío y, en act(), el efecto
// de reinicio alcanza a correr antes del siguiente; en el navegador ese reinicio
// va en otra prioridad y el frame intermedio sí se pinta.
vi.mock('@asteby/metacore-ui/primitives', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    const React = await import('react')
    return {
        ...actual,
        Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
            open ? React.createElement(React.Fragment, null, children) : null,
        DialogContent: ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
            const attrs: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(rest)) if (k.startsWith('data-')) attrs[k] = v
            return React.createElement('div', { role: 'dialog', ...attrs }, children)
        },
        DialogHeader: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
        DialogFooter: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
        DialogTitle: ({ children }: { children?: React.ReactNode }) => React.createElement('h2', null, children),
        DialogDescription: ({ children }: { children?: React.ReactNode }) => React.createElement('p', null, children),
    }
})

import { DocumentFormDialog } from '../document-form-dialog'
import { ApiProvider, type ApiClient } from '../api-context'
import type { DocumentFormsManifest } from '../types'

afterEach(cleanup)

const client = {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
} as unknown as ApiClient

// Formularios genéricos con layout editor (cualquier document_form, no sólo fiscal).
const formsA: DocumentFormsManifest = {
    types: [
        {
            key: 'doc_a',
            label: 'Documento A',
            layout: 'editor',
            fields: [{ key: 'party', label: 'Contraparte', type: 'text' }],
        },
    ],
}
const formsB: DocumentFormsManifest = {
    types: [
        {
            key: 'doc_b',
            label: 'Documento B',
            layout: 'editor',
            submit_action: 'create_doc_b',
            fields: [{ key: 'origin', label: 'Origen', type: 'text' }],
        },
    ],
}
const formsAB: DocumentFormsManifest = { types: [...formsA.types, ...formsB.types] }

/** Registra si el wizard llegó a montarse en el DOM, aunque sea un frame. */
function watchLegacyDialog(forbiddenText?: string) {
    let seen = false
    let sawText = false
    const hasText = (v: string | null | undefined) => !!forbiddenText && !!v && v.includes(forbiddenText)
    const hit = (n: Node) =>
        n instanceof Element &&
        (n.matches('[data-slot="document-form-dialog"]') || !!n.querySelector('[data-slot="document-form-dialog"]'))
    const check = () => {
        if (document.querySelector('[data-slot="document-form-dialog"]')) seen = true
    }
    // React reutiliza el mismo nodo del Dialog entre ramas y sólo cambia
    // `data-slot`: se mira también el valor anterior del atributo.
    const scan = (records: MutationRecord[]) => {
        for (const r of records) {
            if (r.type === 'attributes' && r.oldValue === 'document-form-dialog') seen = true
            if (r.type === 'characterData' && hasText(r.oldValue)) sawText = true
            r.addedNodes.forEach((n) => {
                if (hit(n)) seen = true
                if (hasText(n.textContent)) sawText = true
            })
        }
    }
    const obs = new MutationObserver(scan)
    obs.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['data-slot'],
        characterData: true,
        characterDataOldValue: true,
    })
    return {
        check,
        seen: () => {
            scan(obs.takeRecords())
            obs.disconnect()
            return seen
        },
        sawText: () => sawText,
    }
}

function dialog(props: { open: boolean; forms: DocumentFormsManifest; initialType?: string }) {
    return (
        <ApiProvider client={client}>
            <DocumentFormDialog
                open={props.open}
                onOpenChange={() => {}}
                model="docs"
                endpoint="/data/docs/me"
                forms={props.forms}
                initialType={props.initialType}
            />
        </ApiProvider>
    )
}

describe('DocumentFormDialog no pinta el wizard antes del DocumentEditor', () => {
    it('reutilizado con otros formularios (otra vista del mismo host): abre directo el editor', () => {
        const { rerender } = render(dialog({ open: false, forms: formsA }))
        rerender(dialog({ open: false, forms: formsB }))
        const watch = watchLegacyDialog()
        rerender(dialog({ open: true, forms: formsB, initialType: 'doc_b' }))
        watch.check()
        expect(watch.seen()).toBe(false)
        expect(document.querySelector('[data-slot="document-editor"]')).toBeTruthy()
    })

    it('«Crear» sin tipo inicial en la vista nueva: tampoco hay frame del wizard', () => {
        const { rerender } = render(dialog({ open: false, forms: formsA }))
        rerender(dialog({ open: false, forms: formsB }))
        const watch = watchLegacyDialog()
        rerender(dialog({ open: true, forms: formsB }))
        watch.check()
        expect(watch.seen()).toBe(false)
        expect(document.querySelector('[data-slot="document-editor"]')).toBeTruthy()
    })

    it('reabierto con otro initialType: el primer frame ya es el editor del tipo pedido', () => {
        const { rerender } = render(dialog({ open: true, forms: formsAB, initialType: 'doc_a' }))
        rerender(dialog({ open: false, forms: formsAB, initialType: 'doc_a' }))
        const watch = watchLegacyDialog('Documento A')
        rerender(dialog({ open: true, forms: formsAB, initialType: 'doc_b' }))
        watch.check()
        expect(watch.seen()).toBe(false)
        // Ni un frame del editor del tipo de la apertura anterior.
        expect(watch.sawText()).toBe(false)
        expect(document.querySelector('[data-slot="document-editor"]')).toBeTruthy()
    })
})
