import { describe, expect, it } from 'vitest'
import { resolveMissingActorLabel } from '../dynamic-columns'

describe('resolveMissingActorLabel', () => {
    it('creator cell → Sistema', () => {
        expect(resolveMissingActorLabel('creator', 'owner', 'owner.name')).toBe('Sistema')
    })

    it('host auto-inject created_by.avatar (type avatar) → Sistema', () => {
        expect(
            resolveMissingActorLabel('avatar', 'created_by.avatar', 'created_by.name'),
        ).toBe('Sistema')
    })

    it('created_by_id key → Sistema', () => {
        expect(resolveMissingActorLabel('avatar', 'created_by_id', undefined)).toBe('Sistema')
    })

    it('plain avatar/user/search stay N/A (unassigned)', () => {
        expect(resolveMissingActorLabel('avatar', 'photo', 'user.name')).toBe('N/A')
        expect(resolveMissingActorLabel('user', 'assignee', 'assignee.name')).toBe('N/A')
        expect(resolveMissingActorLabel('search', 'manager_id', 'manager.name')).toBe('N/A')
    })

    it('honors i18n when provided', () => {
        const t = (key: string, opts?: { defaultValue?: string }) =>
            key === 'common.system' ? 'System' : opts?.defaultValue ?? key
        expect(
            resolveMissingActorLabel('avatar', 'created_by.avatar', 'created_by.name', t),
        ).toBe('System')
    })
})
