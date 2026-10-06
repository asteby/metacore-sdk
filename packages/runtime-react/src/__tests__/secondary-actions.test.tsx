// @vitest-environment happy-dom
//
// Acciones secundarias de un registro (P2 UX Pitsline): una sola primaria
// destacada; compartir / imprimir / correo / chat van al «Más…» de la fila y al
// pie del documento; lo que aporta un addon (registerRecordAction) sólo aparece
// con su proveedor instalado y activo. Y la infraestructura de registro es una
// sola: lo que un addon registra por AddonAPI (modal, slot) llega a los mismos
// lectores que registerFederatedModal / <Slot>.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const I18N_T = (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k
const USE_TRANSLATION = { t: I18N_T, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({ useTranslation: () => USE_TRANSLATION }))

import { Registry, registerRecordAction, type ActionMetadata } from '@asteby/metacore-sdk'
import { InstalledAddonsProvider } from '../installed-addons-context'
import {
    classifyActionPriority,
    isActionProviderActive,
    resolveRecordActions,
    splitActionsByPriority,
} from '../record-actions'
import { RowActionsMenu } from '../row-actions-menu'
import { DocumentSecondaryBar } from '../document/secondary-bar'
import { resolveActions } from '../document/evaluate'
import type { DocumentSpec } from '../document/types'
import { Slot } from '../slot'
import { ActionModalDispatcher } from '../action-modal-dispatcher'

const disposers: Array<() => void> = []
afterEach(() => {
    cleanup()
    while (disposers.length) disposers.pop()!()
})

const ROW = { id: 'inv-1', folio: 'A-1' }
const ACTIONS = [
    { key: 'stamp', label: 'Timbrar', icon: 'Stamp', priority: 'primary' },
    { key: 'cancel', label: 'Cancelar', icon: 'X' },
    { key: 'send_cfdi_email', label: 'Enviar por correo', icon: 'Mail' },
    { key: 'reprint_cfdi', label: 'Reimprimir', icon: 'Printer' },
    { key: 'approve', label: 'Aprobar', icon: 'Check', priority: 'primary' },
]

function shareToChat() {
    const run = vi.fn()
    disposers.push(
        registerRecordAction(
            { id: 'team_chat.share', label: 'Enviar al chat', icon: 'MessageSquareShare', requires: { addon: 'link' }, run },
            'host',
        ),
    )
    return run
}

async function openMenu() {
    const trigger = screen.getByText('Abrir menú').closest('button')!
    await act(async () => {
        fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    })
}

describe('clasificación primaria / secundaria', () => {
    it('convención por segmento de clave; `priority` explícito manda', () => {
        expect(classifyActionPriority({ key: 'send_cfdi_email' })).toBe('secondary')
        expect(classifyActionPriority({ key: 'download_acuse' })).toBe('secondary')
        expect(classifyActionPriority({ key: 'send_whatsapp' })).toBe('secondary')
        expect(classifyActionPriority({ key: 'send' })).toBeUndefined() // enviar cotización = flujo principal
        expect(classifyActionPriority({ key: 'create_mailbox' })).toBeUndefined()
        expect(classifyActionPriority({ key: 'delete' })).toBeUndefined()
        expect(classifyActionPriority({ key: 'print_label', priority: 'primary' })).toBe('primary')
    })

    it('una sola primaria: la primera que la reclama; las demás quedan como principales', () => {
        const { primary, main, secondary } = splitActionsByPriority(ACTIONS)
        expect(primary?.key).toBe('stamp')
        expect(main.map((a) => a.key)).toEqual(['cancel', 'approve'])
        expect(secondary.map((a) => a.key)).toEqual(['send_cfdi_email', 'reprint_cfdi'])
    })

    it('acción por capacidad sin proveedor activo no se ofrece', () => {
        const a = { key: 'send_whatsapp', trigger: { type: 'capability', capability: 'messaging.whatsapp.send' } }
        expect(isActionProviderActive(a, null)).toBe(true)
        expect(isActionProviderActive(a, { addons: new Set(), capabilities: new Set() })).toBe(false)
        expect(isActionProviderActive(a, { addons: new Set(['link']), capabilities: new Set(['messaging.whatsapp.send']) })).toBe(true)
    })
})

describe('resolveRecordActions (registro de acciones aportadas)', () => {
    const installed = (addons: string[], caps: string[] = []) => ({ addons: new Set(addons), capabilities: new Set(caps) })
    const row = (c: Parameters<typeof registerRecordAction>[0], owner?: string) => ({ contribution: c, owner })

    it('por addon, por capacidad o por dueño; modelos y expand', () => {
        const rows = [
            row({ id: 'a.chat', label: 'Chat', requires: { addon: 'link' }, run: () => {} }, 'host'),
            row({ id: 'b.wa', label: 'WhatsApp', requires: { capability: 'messaging.whatsapp.send' }, run: () => {} }, 'host'),
            row({ id: 'c.own', label: 'Propia', run: () => {} }, 'fiscal_mexico'),
            row({ id: 'd.only', label: 'Sólo facturas', models: ['Invoice'], run: () => {} }),
            row({ id: 'e.pdf', expand: () => [{ key: 'ticket', label: 'Ticket', run: () => {} }] }),
        ]
        const keys = (inst: ReturnType<typeof installed> | null, model = 'Sale') =>
            resolveRecordActions(rows, { model, record: ROW }, inst).map((r) => r.key)
        expect(keys(installed([]))).toEqual(['e.pdf:ticket'])
        expect(keys(installed(['link', 'fiscal_mexico'], ['messaging.whatsapp.send']))).toEqual(['a.chat', 'b.wa', 'c.own', 'e.pdf:ticket'])
        expect(keys(installed([]), 'customers.Invoice')).toEqual(['d.only', 'e.pdf:ticket'])
        // Sin InstalledAddonsProvider = desconocido: se muestra (el servidor revalida).
        expect(keys(null)).toEqual(['a.chat', 'b.wa', 'c.own', 'e.pdf:ticket'])
    })
})

describe('RowActionsMenu', () => {
    it('«Enviar al chat» aparece sólo con el addon proveedor instalado y activo', async () => {
        shareToChat()
        const { unmount } = render(
            <InstalledAddonsProvider addons={['fiscal_mexico']}>
                <RowActionsMenu actions={[]} row={ROW} model="Invoice" />
            </InstalledAddonsProvider>,
        )
        expect(screen.queryByText('Abrir menú')).toBeNull() // nada que ofrecer
        unmount()

        render(
            <InstalledAddonsProvider addons={['fiscal_mexico', 'link']}>
                <RowActionsMenu actions={[]} row={ROW} model="Invoice" />
            </InstalledAddonsProvider>,
        )
        await openMenu()
        expect(screen.getByText('Enviar al chat')).toBeTruthy()
    })

    it('primaria única destacada; las secundarias van bajo «Más…», no en el primer nivel', async () => {
        const run = shareToChat()
        render(
            <InstalledAddonsProvider addons={['link']}>
                <RowActionsMenu actions={ACTIONS} row={ROW} model="Invoice" />
            </InstalledAddonsProvider>,
        )
        await openMenu()
        const top = [...document.querySelectorAll('[role="menu"] > [role="menuitem"]')].map(
            (el) => el.getAttribute('data-action') ?? el.textContent,
        )
        expect(top).toEqual(['stamp', 'cancel', 'approve', 'Más…'])
        expect(document.querySelectorAll('[data-action].font-semibold')).toHaveLength(1)
        expect(document.querySelector('[data-action="stamp"]')?.className).toContain('font-semibold')
        expect(screen.queryByText('Enviar por correo')).toBeNull()
        expect(screen.queryByText('Enviar al chat')).toBeNull()

        const more = screen.getByText('Más…')
        await act(async () => {
            fireEvent.keyDown(more, { key: 'ArrowRight' })
        })
        expect(screen.getByText('Enviar por correo')).toBeTruthy()
        await act(async () => {
            fireEvent.click(screen.getByText('Enviar al chat'))
        })
        expect(run).toHaveBeenCalledWith({ model: 'Invoice', record: ROW })
    })
})

describe('documento: secundarias en el pie', () => {
    const spec: DocumentSpec = {
        model: 'invoices',
        title: '{{folio}}',
        statuses: [],
        actions: [
            { key: 'register_payment', label: 'Registrar pago' },
            { key: 'send', label: 'Enviar por correo', modelAction: 'send_cfdi_email' },
            { key: 'download_pdf', label: 'Descargar PDF', openUrl: '{{pdf}}' },
            { key: 'credit_note', label: 'Nota de crédito' },
            { key: 'share_link', label: 'Enlace', priority: 'secondary' },
        ],
        layouts: [],
        defaultLayout: {
            primary: 'register_payment',
            secondary: ['send', 'download_pdf', 'credit_note'],
            more: ['share_link'],
        },
        tabs: [],
    }

    it('resolveActions saca compartir/correo/PDF de la cabecera al pie', () => {
        const layout = resolveActions(spec, { record: ROW, sources: {}, derived: {} })
        expect(layout.primary?.def.key).toBe('register_payment')
        expect(layout.secondary.map((a) => a.def.key)).toEqual(['credit_note'])
        expect(layout.more).toEqual([])
        expect(layout.footer.map((a) => a.def.key)).toEqual(['send', 'download_pdf', 'share_link'])
    })

    it('la primaria de un layout nunca se va al pie aunque sea una descarga', () => {
        const layout = resolveActions(
            { ...spec, defaultLayout: { primary: 'download_pdf', secondary: ['send'] } },
            { record: ROW, sources: {}, derived: {} },
        )
        expect(layout.primary?.def.key).toBe('download_pdf')
        expect(layout.footer.map((a) => a.def.key)).toEqual(['send'])
    })

    it('DocumentSecondaryBar junta las del documento y las aportadas, filtradas por proveedor', () => {
        shareToChat()
        const items = [{ key: 'download_pdf', label: 'Descargar PDF', icon: 'FileDown', run: () => {} }]
        const { rerender } = render(
            <InstalledAddonsProvider addons={[]}>
                <DocumentSecondaryBar items={items} model="Invoice" record={ROW} />
            </InstalledAddonsProvider>,
        )
        const bar = () => document.querySelector('[data-document-secondary]')!
        expect([...bar().querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'))).toEqual(['download_pdf'])

        rerender(
            <InstalledAddonsProvider addons={['link']}>
                <DocumentSecondaryBar items={items} model="Invoice" record={ROW} />
            </InstalledAddonsProvider>,
        )
        expect([...bar().querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'))).toEqual([
            'download_pdf',
            'team_chat.share',
        ])
    })

    it('sin nada secundario no pinta el pie', () => {
        render(<DocumentSecondaryBar items={[]} model="Invoice" record={ROW} />)
        expect(document.querySelector('[data-document-secondary]')).toBeNull()
    })
})

describe('registro único: AddonAPI → lectores de runtime-react', () => {
    it('api.registry.registerSlot se pinta en <Slot> y se oculta si su addon no está instalado', () => {
        const reg = new Registry()
        const Widget = () => <span>widget de returns</span>
        reg.scope('returns').registerSlot({ name: 'invoice.footer', component: Widget })
        disposers.push(() => void reg.unbind('returns'))
        const { rerender } = render(
            <InstalledAddonsProvider addons={['returns']}>
                <Slot name="invoice.footer" />
            </InstalledAddonsProvider>,
        )
        expect(screen.getByText('widget de returns')).toBeTruthy()
        rerender(
            <InstalledAddonsProvider addons={[]}>
                <Slot name="invoice.footer" />
            </InstalledAddonsProvider>,
        )
        expect(screen.queryByText('widget de returns')).toBeNull()
    })

    it('api.registry.registerModal resuelve `action.modal` por slug en el dispatcher', () => {
        const reg = new Registry()
        const Modal = (p: { recordId: string; close: () => void }) => <div>modal {p.recordId}</div>
        reg.scope('fiscal_mexico').registerModal({ slug: 'fiscal_mexico.import_cfdi', component: Modal as never })
        disposers.push(() => void reg.unbind('fiscal_mexico'))
        const action: ActionMetadata = { key: 'import_cfdi', label: 'Importar', icon: 'Upload', modal: 'fiscal_mexico.import_cfdi' }
        render(
            <InstalledAddonsProvider addons={['fiscal_mexico']}>
                <ActionModalDispatcher open onOpenChange={() => {}} action={action} model="SupplierInvoice" record={{ id: 9 }} onSuccess={() => {}} />
            </InstalledAddonsProvider>,
        )
        expect(screen.getByText('modal 9')).toBeTruthy()
        expect(screen.queryByTestId('federated-action-loading')).toBeNull()
    })
})
