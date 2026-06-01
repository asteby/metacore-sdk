import { describe, it, expect } from 'vitest'
import { extractUploadedValue, uploadedDisplayName } from '../upload-field'
import { resolveWidget, getUploadConfig } from '../dynamic-form-schema'
import type { ActionFieldDef } from '../types'

describe('resolveWidget upload', () => {
    it('infiere upload desde type', () => {
        expect(resolveWidget({ key: 'f', label: 'F', type: 'upload' })).toBe('upload')
    })
    it('respeta widget explícito upload sobre cualquier type', () => {
        expect(resolveWidget({ key: 'f', label: 'F', type: 'string', widget: 'upload' })).toBe('upload')
    })
})

describe('getUploadConfig', () => {
    it('lee la forma camelCase autorada', () => {
        const field: ActionFieldDef = {
            key: 'logo', label: 'Logo', type: 'upload',
            accept: 'image/*', maxSize: 1024, storagePath: 'brand/',
        }
        expect(getUploadConfig(field)).toEqual({ accept: 'image/*', maxSize: 1024, storagePath: 'brand/' })
    })

    it('tolera la forma snake_case del kernel', () => {
        const field = {
            key: 'doc', label: 'Doc', type: 'upload',
            accept: '.pdf', max_size: 2048, storage_path: 'docs/',
        } as ActionFieldDef
        expect(getUploadConfig(field)).toEqual({ accept: '.pdf', maxSize: 2048, storagePath: 'docs/' })
    })

    it('descarta maxSize inválido / no positivo y campos vacíos', () => {
        expect(getUploadConfig({ key: 'f', label: 'F', type: 'upload', maxSize: 0 })).toEqual({
            accept: undefined, maxSize: undefined, storagePath: undefined,
        })
        expect(getUploadConfig({ key: 'f', label: 'F', type: 'upload', max_size: -5 } as ActionFieldDef).maxSize).toBeUndefined()
    })
})

describe('extractUploadedValue', () => {
    it('extrae del envelope {success,data:{file_url}}', () => {
        expect(extractUploadedValue({ success: true, data: { file_url: '/u/a.png' } })).toBe('/u/a.png')
    })
    it('soporta url / path / file_path / camelCase', () => {
        expect(extractUploadedValue({ data: { url: '/u/b' } })).toBe('/u/b')
        expect(extractUploadedValue({ data: { path: '/u/c' } })).toBe('/u/c')
        expect(extractUploadedValue({ data: { file_path: '/u/d' } })).toBe('/u/d')
        expect(extractUploadedValue({ data: { fileUrl: '/u/e' } })).toBe('/u/e')
    })
    it('soporta respuesta data como string plano', () => {
        expect(extractUploadedValue({ data: '/u/flat' })).toBe('/u/flat')
        expect(extractUploadedValue('/u/raw')).toBe('/u/raw')
    })
    it('devuelve "" cuando no hay nada usable', () => {
        expect(extractUploadedValue(null)).toBe('')
        expect(extractUploadedValue(undefined)).toBe('')
        expect(extractUploadedValue({ data: { foo: 'bar' } })).toBe('')
    })
})

describe('uploadedDisplayName', () => {
    it('toma el último segmento del path', () => {
        expect(uploadedDisplayName('/uploads/2026/a.png')).toBe('a.png')
        expect(uploadedDisplayName('a.png')).toBe('a.png')
    })
    it('descarta el querystring', () => {
        expect(uploadedDisplayName('/u/a.png?sig=xyz')).toBe('a.png')
    })
    it('devuelve "" para valores no-string o vacíos', () => {
        expect(uploadedDisplayName('')).toBe('')
        expect(uploadedDisplayName(null)).toBe('')
        expect(uploadedDisplayName(42)).toBe('')
    })
})
