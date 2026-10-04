// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const lang = { current: 'es' }
vi.mock('react-i18next', () => {
    const t = (k: string, o?: { defaultValue?: string; who?: string }) =>
        (o?.defaultValue ?? k).replace('{{who}}', o?.who ?? '')
    return { useTranslation: () => ({ t, i18n: { language: lang.current } }) }
})

import { AuditInfo, readAuditMeta, resolveAuditActor, SYSTEM_ACTOR_ID } from '../audit-info'

afterEach(() => {
    cleanup()
    lang.current = 'es'
})

const audit = {
    created_at: 'created_at',
    created_by: 'created_by_id',
    updated_at: 'updated_at',
    updated_by: 'updated_by_id',
    deleted_at: 'deleted_at',
    deleted_by: 'deleted_by_id',
}
const U1 = '11111111-2222-3333-4444-555555555555'

describe('readAuditMeta', () => {
    it('keeps known string keys and drops junk', () => {
        expect(readAuditMeta({ created_at: 'created_at', foo: 'x', updated_at: 3 })).toEqual({ created_at: 'created_at' })
        expect(readAuditMeta(undefined)).toBeUndefined()
        expect(readAuditMeta([])).toBeUndefined()
        expect(readAuditMeta({})).toBeUndefined()
    })
})

describe('resolveAuditActor', () => {
    const o = { systemLabel: 'Sistema' }
    it('system actor, expanded sibling, host resolver, short id, empty', () => {
        expect(resolveAuditActor({ c: SYSTEM_ACTOR_ID }, 'c', o)?.name).toBe('Sistema')
        expect(resolveAuditActor({ created_by_id: U1, created_by: { name: 'Ana' } }, 'created_by_id', o)?.name).toBe('Ana')
        expect(resolveAuditActor({ c: U1 }, 'c', { ...o, resolveActor: () => 'Luis' })?.name).toBe('Luis')
        expect(resolveAuditActor({ c: U1 }, 'c', o)).toEqual({ name: '11111111', resolved: false })
        expect(resolveAuditActor({ c: null }, 'c', o)).toBeNull()
        expect(resolveAuditActor({ c: '00000000-0000-0000-0000-000000000000' }, 'c', o)).toBeNull()
    })
})

describe('<AuditInfo>', () => {
    const record = {
        created_at: '2026-01-01T10:00:00Z',
        created_by_id: U1,
        created_by: { name: 'Ana' },
        updated_at: '2026-02-01T10:00:00Z',
        updated_by_id: SYSTEM_ACTOR_ID,
    }

    it('renders nothing without audit', () => {
        const { container } = render(<AuditInfo record={record} audit={undefined} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders nothing when the record has no audit values', () => {
        const { container } = render(<AuditInfo record={{ name: 'x' }} audit={audit} />)
        expect(container.innerHTML).toBe('')
    })

    it('shows created and modified (system actor) when expanded', () => {
        render(<AuditInfo record={record} audit={audit} timeZone="UTC" />)
        expect(screen.queryByText('Creado por Ana')).toBeNull() // collapsed
        fireEvent.click(screen.getByRole('button'))
        expect(screen.getByText('Creado por Ana')).toBeTruthy()
        expect(screen.getByText('Modificado por Sistema')).toBeTruthy()
        expect(document.querySelector('[data-audit-line="deleted"]')).toBeNull()
    })

    it('shows deleted line and english copy', () => {
        lang.current = 'en'
        render(
            <AuditInfo
                record={{ ...record, deleted_at: '2026-03-01T10:00:00Z', deleted_by_id: U1 }}
                audit={audit}
                defaultOpen
                resolveActor={() => 'Bob'}
            />,
        )
        expect(screen.getByText('Deleted by Bob')).toBeTruthy()
        expect(screen.getByText('Created by Bob')).toBeTruthy()
    })

    it('hides modified when it equals creation, falls back to date-only label without actor col', () => {
        render(
            <AuditInfo
                record={{ created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z' }}
                audit={{ created_at: 'created_at', updated_at: 'updated_at' }}
                defaultOpen
            />,
        )
        expect(screen.getByText('Creado')).toBeTruthy()
        expect(document.querySelector('[data-audit-line="updated"]')).toBeNull()
    })
})
