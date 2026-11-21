// @vitest-environment happy-dom
//
// needs.device (RFC 0005): dentro de un injerto, BarcodeScanner solo pide la cámara si la Part
// declaró `camera`. Fuera de Loom (código del host) no cambia nada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { BarcodeScanner } from '../barcode-scanner'
import { clearLoom, registerGraft, registerPart, Seam, useDeviceAllowed, type GraftProps, type SeamContract } from '../loom'

const contract: SeamContract = { id: 'demo.seam', version: '1.0.0', lenses: {} }
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
    getUserMedia = vi.fn(async () => {
        throw new Error('sin cámara en pruebas')
    })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    ;(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
        detect() {
            return Promise.resolve([])
        }
    }
})
afterEach(() => {
    cleanup()
    clearLoom()
})

function Scanner(_: GraftProps) {
    return <BarcodeScanner open onClose={() => {}} onDetected={() => {}} />
}
function Probe(_: GraftProps) {
    return <span>{useDeviceAllowed('camera') ? 'camara si' : 'camara no'}</span>
}

describe('needs.device', () => {
    it('fuera de un injerto todo está permitido', () => {
        function Host() {
            return <span>{useDeviceAllowed('microphone') ? 'si' : 'no'}</span>
        }
        render(<Host />)
        expect(screen.getByText('si')).toBeTruthy()
    })

    it('una Part sin camera no puede abrir la cámara del BarcodeScanner', async () => {
        registerPart({ id: 'x.p', component: Scanner })
        registerGraft({ id: 'x.g', seam: 'demo.seam', part: 'x.p' })
        render(<Seam contract={contract} lenses={{}} />)
        expect(await screen.findByText(/no declaró uso de la cámara/, undefined, { timeout: 10000 })).toBeTruthy()
        expect(getUserMedia).not.toHaveBeenCalled()
    })

    it('con device: camera la pide (y el permiso lo decide el navegador)', async () => {
        registerPart({ id: 'x.p', component: Scanner, device: ['camera'] })
        registerGraft({ id: 'x.g', seam: 'demo.seam', part: 'x.p' })
        render(<Seam contract={contract} lenses={{}} />)
        await waitFor(() => expect(getUserMedia).toHaveBeenCalled(), { timeout: 10000 })
    })

    it('el injerto ve solo lo declarado', async () => {
        registerGraft({ id: 'y.g', seam: 'demo.seam', component: Probe, device: ['microphone'] })
        render(<Seam contract={contract} lenses={{}} />)
        expect(await screen.findByText('camara no', undefined, { timeout: 10000 })).toBeTruthy()
    })
})
