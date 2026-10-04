// @vitest-environment happy-dom
// «Descargar Factura CFDI» no daba señal alguna: ahora hay progreso, éxito y
// el motivo del servidor si falla (la promesa sigue rechazando).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

const toast = vi.hoisted(() => ({
    loading: vi.fn(() => 'tid'),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
}))
vi.mock('sonner', () => ({ toast }))

import { usePrintDocument, documentErrorMessage } from '../use-print-document'
import { ApiProvider, type ApiClient } from '../api-context'

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

const wrap = (client: ApiClient) => ({ children }: { children: ReactNode }) => <ApiProvider client={client}>{children}</ApiProvider>

describe('usePrintDocument feedback', () => {
    it('descarga: toast de progreso y de éxito', async () => {
        URL.createObjectURL = vi.fn(() => 'blob:x')
        const client = { get: vi.fn().mockResolvedValue({ data: new Blob(['x']), headers: {} }) } as unknown as ApiClient
        const { result } = renderHook(() => usePrintDocument(), { wrapper: wrap(client) })
        await result.current({ model: 'Invoice', id: '1', key: 'cfdi', mode: 'download' })
        expect(toast.loading).toHaveBeenCalled()
        expect(toast.success).toHaveBeenCalledWith('Documento descargado')
        expect(toast.dismiss).toHaveBeenCalled()
        expect(toast.error).not.toHaveBeenCalled()
    })

    it('fallo: muestra el motivo del servidor (cuerpo Blob) y rechaza', async () => {
        const body = new Blob([JSON.stringify({ message: 'La factura aún no está timbrada' })], { type: 'application/json' })
        const client = { get: vi.fn().mockRejectedValue({ response: { status: 409, data: body } }) } as unknown as ApiClient
        const { result } = renderHook(() => usePrintDocument(), { wrapper: wrap(client) })
        await expect(result.current({ model: 'Invoice', id: '1', key: 'cfdi', mode: 'download' })).rejects.toBeTruthy()
        expect(toast.error).toHaveBeenCalledWith('La factura aún no está timbrada')
    })

    it('feedback:false no muestra nada; error:false deja el error al llamador', async () => {
        const client = { get: vi.fn().mockRejectedValue({ response: { status: 500, data: null } }) } as unknown as ApiClient
        const { result } = renderHook(() => usePrintDocument(), { wrapper: wrap(client) })
        await expect(result.current({ model: 'I', id: '1', key: 'k', mode: 'open', feedback: false })).rejects.toBeTruthy()
        await expect(result.current({ model: 'I', id: '1', key: 'k', mode: 'open', feedback: { progress: true, error: false } })).rejects.toBeTruthy()
        expect(toast.error).not.toHaveBeenCalled()
    })

    it('documentErrorMessage cae a un mensaje genérico', async () => {
        expect(await documentErrorMessage(new Error('x'))).toMatch(/No se pudo generar/)
        expect(await documentErrorMessage({ response: { status: 404 } })).toMatch(/no está disponible/)
    })
})
