// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { isCameraScanSupported, RETAIL_BARCODE_FORMATS } from '../barcode-scanner'

describe('barcode-scanner primitive', () => {
    afterEach(() => {
        delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector
    })

    it('cubre los simbolismos de retail habituales', () => {
        expect(RETAIL_BARCODE_FORMATS).toContain('ean_13')
        expect(RETAIL_BARCODE_FORMATS).toContain('code_128')
        expect(RETAIL_BARCODE_FORMATS).toContain('qr_code')
    })

    it('isCameraScanSupported = false sin BarcodeDetector (jsdom)', () => {
        expect(isCameraScanSupported()).toBe(false)
    })

    it('isCameraScanSupported exige detector + getUserMedia', () => {
        ;(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector =
            function () {} as unknown
        // jsdom no expone mediaDevices.getUserMedia → sigue siendo false aun con
        // el detector presente.
        const hasGUM = !!navigator.mediaDevices?.getUserMedia
        expect(isCameraScanSupported()).toBe(hasGUM)
    })
})
