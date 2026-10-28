// @vitest-environment happy-dom
// Provenance badges: human, agent (Asistente), system/integration with origin and
// "person with agent" with the authorizer, the proposal and the date.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

let language = 'es'
vi.mock('react-i18next', () => {
    const t = (k: string, o?: Record<string, string>) =>
        (o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => o?.[v] ?? '')
    return { useTranslation: () => ({ t, i18n: { language } }) }
})

import { OrgRuntimeProvider } from '../org-runtime-provider'
import {
    AuthorshipCell,
    classifyProvenance,
    hasSpecialAuthorship,
    isSystemCreated,
    notificationProvenance,
    parseProvenance,
    ProvenanceActorChip,
    ProvenanceBadge,
    readProvenance,
    type ProvenanceData,
} from '../provenance'
import { AuditInfo } from '../audit-info'

afterEach(() => {
    cleanup()
    language = 'es'
})

const agent = { name: 'Asistente', avatarUrl: '/images/assistant.svg' }
const wrap = (ui: ReactNode, extra: Record<string, unknown> = {}) =>
    render(
        <OrgRuntimeProvider agentActor={agent} timeZone="America/Mexico_City" {...extra}>
            {ui}
        </OrgRuntimeProvider>,
    )

const assisted: ProvenanceData = {
    actor_kind: 'agent',
    actor_name: 'Asistente',
    mode: 'assisted',
    authorized_by: 'u-1',
    authorized_by_name: 'Ana Pérez',
    authorized_at: '2026-10-12T16:30:00Z',
    via: 'chat',
    origin: 'Borrador aprobado en el chat',
    summary: 'Propuso crear la acción «Recorrido en Zona Norte»',
}

describe('provenance model', () => {
    it('classifies the four presentations', () => {
        expect(classifyProvenance({ actor_kind: 'human', mode: 'manual' })).toBe('human')
        expect(classifyProvenance(assisted)).toBe('assisted')
        expect(classifyProvenance({ actor_kind: 'agent', mode: 'automated', on_behalf_of: 'u-1' })).toBe('agent')
        expect(classifyProvenance({ actor_kind: 'agent', mode: 'automated', proposed: true })).toBe('agent')
        expect(classifyProvenance({ actor_kind: 'system', mode: 'automated' })).toBe('system')
        expect(classifyProvenance({ actor_kind: 'integration', mode: 'automated' })).toBe('system')
    })

    it('reads provenance from created_by, the row or JSON strings', () => {
        expect(readProvenance({ created_by: { name: 'Ana', provenance: assisted } })?.mode).toBe('assisted')
        expect(readProvenance({ provenance: JSON.stringify(assisted) })?.actor_kind).toBe('agent')
        expect(readProvenance({ provenance: { actor_kind: 'robot' } })).toBeUndefined()
        expect(parseProvenance('{bad')).toBeUndefined()
        expect(notificationProvenance({ metadata: JSON.stringify({ provenance: { actor_kind: 'agent' } }) })?.actor_kind).toBe('agent')
    })

    it('legacy system rows: null, nil and the kernel actor', () => {
        expect(isSystemCreated({ created_by_id: null })).toBe(true)
        expect(isSystemCreated({ created_by_id: '00000000-0000-0000-0000-000000000001' })).toBe(true)
        expect(isSystemCreated({ created_by_id: 'abc', created_by: { name: 'Ana' } })).toBe(false)
        expect(hasSpecialAuthorship({ created_by_id: 'abc', created_by: { name: 'Ana' } })).toBe(false)
        expect(hasSpecialAuthorship({ created_by: { name: 'Ana', provenance: assisted } })).toBe(true)
    })
})

describe('<ProvenanceBadge>', () => {
    it('person with agent: label, overlay avatar and accessible description', () => {
        const { container } = wrap(<ProvenanceBadge provenance={assisted} />)
        expect(screen.getByText('Ana Pérez con Asistente')).toBeTruthy()
        expect(screen.getByText('Borrador aprobado en el chat')).toBeTruthy()
        const trigger = container.querySelector('[data-provenance="assisted"]') as HTMLElement
        expect(trigger.tabIndex).toBe(0)
        const desc = document.getElementById(trigger.getAttribute('aria-describedby') as string)
        expect(desc?.textContent).toContain('Autorizó: Ana Pérez')
        expect(desc?.textContent).toContain('Asistente propuso: Propuso crear la acción')
        expect(desc?.textContent).toMatch(/12 oct 2026/)
        expect(container.querySelector('[data-provenance-overlay] img[src="/images/assistant.svg"]')).toBeTruthy()
    })

    it('agent alone uses the app agent and its origin; pending proposals say so', () => {
        const { rerender } = wrap(<ProvenanceBadge provenance={{ actor_kind: 'agent', mode: 'automated', origin: 'Briefing automático' }} />)
        expect(screen.getByText('Asistente')).toBeTruthy()
        expect(screen.getByText('Briefing automático')).toBeTruthy()
        rerender(
            <OrgRuntimeProvider agentActor={agent}>
                <ProvenanceBadge provenance={{ actor_kind: 'agent', mode: 'automated', proposed: true, via: 'chat' }} />
            </OrgRuntimeProvider>,
        )
        expect(screen.getByText('Propuesta pendiente')).toBeTruthy()
    })

    it('system and integration show their origin, never the agent', () => {
        const { container } = wrap(
            <>
                <ProvenanceBadge provenance={{ actor_kind: 'system', mode: 'automated', via: 'seed' }} />
                <ProvenanceBadge provenance={{ actor_kind: 'integration', actor_name: 'data-sync', mode: 'automated', origin: 'Plano de datos' }} />
            </>,
        )
        expect(screen.getByText('Sistema')).toBeTruthy()
        expect(screen.getByText('Datos iniciales')).toBeTruthy()
        expect(screen.getByText('data-sync')).toBeTruthy()
        expect(screen.getByText('Plano de datos')).toBeTruthy()
        expect(container.querySelectorAll('[data-provenance="system"]').length).toBe(2)
        expect(screen.queryByText('Asistente')).toBeNull()
    })

    it('human alone', () => {
        wrap(<ProvenanceBadge provenance={{ actor_kind: 'human', mode: 'manual', actor_person_name: 'Luis Gómez' }} />)
        expect(screen.getByText('Luis Gómez')).toBeTruthy()
    })

    it('English copy', () => {
        language = 'en'
        wrap(<ProvenanceBadge provenance={assisted} />)
        expect(screen.getByText('Ana Pérez with Asistente')).toBeTruthy()
    })

    it('without agentActor falls back to the stored agent name', () => {
        render(<ProvenanceBadge provenance={{ ...assisted, actor_name: 'Llantonio' }} />)
        expect(screen.getByText('Ana Pérez con Llantonio')).toBeTruthy()
    })
})

describe('<AuthorshipCell>', () => {
    it('legacy system row gets the host origin', () => {
        const origin = vi.fn(() => 'Importación de investigación pública')
        wrap(<AuthorshipCell row={{ id: 'r', created_by_id: null }} model="findings" />, { provenanceOrigin: origin, systemActor: { name: 'Sistema' } })
        expect(origin).toHaveBeenCalledWith('findings', { id: 'r', created_by_id: null })
        expect(screen.getByText('Importación de investigación pública')).toBeTruthy()
    })

    it('stored provenance wins over the legacy rule', () => {
        wrap(<AuthorshipCell row={{ created_by_id: 'u-1', created_by: { name: 'Ana Pérez', provenance: assisted } }} />)
        expect(screen.getByText('Ana Pérez con Asistente')).toBeTruthy()
    })

    it('a plain person renders the person', () => {
        wrap(<AuthorshipCell row={{ created_by_id: 'u-2', created_by: { name: 'Luis' } }} variant="inline" />)
        expect(screen.getByText('Luis')).toBeTruthy()
    })
})

describe('history and audit', () => {
    it('ProvenanceActorChip names the actor with the full sentence for screen readers', () => {
        wrap(<ProvenanceActorChip provenance={assisted} />)
        expect(screen.getByText('Ana Pérez con Asistente')).toBeTruthy()
        expect(screen.getByText(/Autorizó: Ana Pérez/)).toBeTruthy()
    })

    it('AuditInfo "Creado por" uses the provenance label', () => {
        wrap(
            <AuditInfo
                defaultOpen
                record={{ created_at: '2026-10-12T16:30:00Z', created_by_id: 'u-1', created_by: { name: 'Ana Pérez', provenance: assisted } }}
                audit={{ created_at: 'created_at', created_by: 'created_by_id' }}
            />,
        )
        expect(screen.getByText('Creado por Ana Pérez con Asistente')).toBeTruthy()
    })
})

describe('dynamic table created_by column', () => {
    it('renders the provenance badge by default', async () => {
        const { defaultGetDynamicColumns } = await import('../dynamic-columns')
        const cols = defaultGetDynamicColumns(
            {
                title: 'Acciones',
                endpoint: '/data/actions',
                columns: [{ key: 'created_by.avatar', label: 'Creado por', type: 'avatar', tooltip: 'created_by.name' }],
                actions: [],
                perPageOptions: [10],
                defaultPerPage: 10,
                searchPlaceholder: '',
                enableCRUDActions: false,
                hasActions: false,
            } as never,
            () => {},
            (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k,
            'es',
            new Map(),
        )
        const col = cols.find((c) => (c as { accessorKey?: string }).accessorKey === 'created_by.avatar' || c.id === 'created_by.avatar')
        expect(col).toBeTruthy()
        const original = { id: 'r1', created_by_id: 'u-1', created_by: { name: 'Ana Pérez', provenance: assisted } }
        const cell = (col!.cell as (ctx: unknown) => ReactNode)({
            row: { original, getValue: () => undefined },
            getValue: () => undefined,
            column: { id: 'created_by.avatar' },
        })
        wrap(<>{cell}</>)
        expect(screen.getByText('Ana Pérez con Asistente')).toBeTruthy()
    })
})
