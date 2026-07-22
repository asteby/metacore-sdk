// Locks the avatar-source resolution contract for avatar/search/creator/user
// cells across every real host shape:
//   - doctores: nested key + declared basePath + bare filename sibling
//   - ops: direct `avatar` value (creator) and nested `user.avatar` sibling
//     storing rooted paths
//   - link: host getImageUrl handles origins; rooted/absolute pass through
import { describe, it, expect } from 'vitest'
import { resolveAvatarSrc } from '../dynamic-columns'
import type { ColumnDefinition } from '../types'

const col = (over: Partial<ColumnDefinition>): ColumnDefinition => ({
    key: 'user.name',
    label: 'Usuario',
    type: 'text',
    sortable: true,
    filterable: true,
    ...over,
})

const API = 'https://api.example.com'

describe('resolveAvatarSrc', () => {
    it('prefixes apiBaseUrl + basePath onto a bare-filename sibling (nested key)', () => {
        const c = col({ key: 'user.avatar', basePath: '/storage/avatars/' })
        const row = { user: { avatar: '2.png', name: 'Javier' } }
        expect(resolveAvatarSrc(c, row, row.user.avatar, API)).toBe(
            'https://api.example.com/storage/avatars/2.png',
        )
    })

    it('reads basePath from styleConfig.base_path too', () => {
        const c = col({
            key: 'user.avatar',
            styleConfig: { base_path: '/storage/avatars/' },
        } as any)
        const row = { user: { avatar: '2.png' } }
        expect(resolveAvatarSrc(c, row, '2.png', API)).toBe(
            'https://api.example.com/storage/avatars/2.png',
        )
    })

    it('falls back to the sibling .photo field', () => {
        const c = col({ key: 'user.name', basePath: '/p/' })
        const row = { user: { name: 'Ana', photo: 'ana.jpg' } }
        expect(resolveAvatarSrc(c, row, 'Ana', API)).toBe('https://api.example.com/p/ana.jpg')
    })

    it('passes rooted sibling paths through untouched (host getImageUrl adds the origin)', () => {
        const c = col({ key: 'user.avatar' })
        const row = { user: { avatar: '/storage/avatars/x.png' } }
        expect(resolveAvatarSrc(c, row, row.user.avatar, API)).toBe('/storage/avatars/x.png')
    })

    it('passes absolute URLs through untouched', () => {
        const c = col({ key: 'user.avatar', basePath: '/storage/avatars/' })
        const row = { user: { avatar: 'https://cdn.example.com/a.png' } }
        expect(resolveAvatarSrc(c, row, row.user.avatar, API)).toBe(
            'https://cdn.example.com/a.png',
        )
    })

    it('prefixes a bare-filename direct value (non-nested creator column)', () => {
        const c = col({ key: 'avatar', basePath: '/storage/avatars/' })
        expect(resolveAvatarSrc(c, { avatar: '1.png' }, '1.png', API)).toBe(
            'https://api.example.com/storage/avatars/1.png',
        )
    })

    it('prefixes with apiBaseUrl alone when no basePath is declared', () => {
        const c = col({ key: 'avatar' })
        expect(resolveAvatarSrc(c, { avatar: '1.png' }, '1.png', API)).toBe(
            'https://api.example.com1.png',
        )
    })

    it('returns undefined when there is no sibling and no value', () => {
        const c = col({ key: 'user.avatar' })
        expect(resolveAvatarSrc(c, { user: {} }, null, API)).toBeUndefined()
        expect(resolveAvatarSrc(c, { user: {} }, '', API)).toBeUndefined()
    })
})
