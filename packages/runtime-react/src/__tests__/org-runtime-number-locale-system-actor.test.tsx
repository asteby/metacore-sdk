// @vitest-environment happy-dom
// OrgRuntimeProvider `numberLocales` (es → es-MX) and `systemActor`
// (presentable name/avatar for records the system created or changed).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('react-i18next', () => {
    const t = (k: string, o?: { defaultValue?: string; who?: string }) =>
        (o?.defaultValue ?? k).replace('{{who}}', o?.who ?? '')
    return { useTranslation: () => ({ t, i18n: { language: 'es' } }) }
})

import { OrgRuntimeProvider } from '../org-runtime-provider'
import { resolveNumberLocale, useNumberLocale, useSystemActor } from '../org-runtime-context'
import { isSystemActorColumn } from '../dynamic-columns'
import { AuditInfo, SYSTEM_ACTOR_ID } from '../audit-info'

afterEach(cleanup)

describe('resolveNumberLocale', () => {
    it('maps by full language, then base, case-insensitive', () => {
        expect(resolveNumberLocale('es', { es: 'es-MX' })).toBe('es-MX')
        expect(resolveNumberLocale('ES', { es: 'es-MX' })).toBe('es-MX')
        expect(resolveNumberLocale('es-AR', { es: 'es-MX' })).toBe('es-MX')
        expect(resolveNumberLocale('es-AR', { es: 'es-MX', 'es-ar': 'es-AR' })).toBe('es-AR')
    })

    it('leaves unmatched languages and missing config untouched', () => {
        expect(resolveNumberLocale('en', { es: 'es-MX' })).toBe('en')
        expect(resolveNumberLocale('es', undefined)).toBe('es')
        expect(resolveNumberLocale(undefined, { es: 'es-MX' })).toBeUndefined()
    })

    it('es-MX formats thousands the Mexican way (vs bare es)', () => {
        const mx = new Intl.NumberFormat(resolveNumberLocale('es', { es: 'es-MX' })).format(11461.5)
        expect(mx).toBe('11,461.5')
    })
})

describe('OrgRuntimeProvider contexts', () => {
    const wrap =
        (props: Record<string, unknown>) =>
        ({ children }: { children: ReactNode }) => <OrgRuntimeProvider {...props}>{children}</OrgRuntimeProvider>

    it('useNumberLocale reads numberLocales; defaults to the language', () => {
        expect(renderHook(() => useNumberLocale('es'), { wrapper: wrap({ numberLocales: { es: 'es-MX' } }) }).result.current).toBe('es-MX')
        expect(renderHook(() => useNumberLocale('es')).result.current).toBe('es')
    })

    it('useSystemActor reads systemActor; undefined outside a provider', () => {
        const actor = { name: 'Gobi', avatarUrl: '/brand/gobi.png' }
        expect(renderHook(() => useSystemActor(), { wrapper: wrap({ systemActor: actor }) }).result.current).toEqual(actor)
        expect(renderHook(() => useSystemActor()).result.current).toBeUndefined()
    })
})

describe('isSystemActorColumn', () => {
    it('creator and created_by.* are system columns; plain people are not', () => {
        expect(isSystemActorColumn('creator', 'owner', 'owner.name')).toBe(true)
        expect(isSystemActorColumn('avatar', 'created_by.avatar', 'created_by.name')).toBe(true)
        expect(isSystemActorColumn('user', 'assignee', 'assignee.name')).toBe(false)
    })
})

describe('<AuditInfo> with systemActor', () => {
    it('names the configured system actor instead of "Sistema"', () => {
        render(
            <OrgRuntimeProvider systemActor={{ name: 'Gobi' }}>
                <AuditInfo
                    record={{ created_at: '2026-01-01T10:00:00Z', created_by_id: SYSTEM_ACTOR_ID }}
                    audit={{ created_at: 'created_at', created_by: 'created_by_id' }}
                    timeZone="UTC"
                />
            </OrgRuntimeProvider>,
        )
        fireEvent.click(screen.getByRole('button'))
        expect(screen.getByText('Creado por Gobi')).toBeTruthy()
    })
})
