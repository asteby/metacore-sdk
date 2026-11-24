// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const host = vi.hoisted(() => ({
    language: 'es',
    overrides: {} as Record<string, string>,
}))

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string) => k,
        i18n: {
            language: host.language,
            isInitialized: true,
            exists: (k: string) => k in host.overrides,
            t: (k: string) => host.overrides[k] ?? k,
        },
    }),
}))

import { bundledTranslator, interpolateText, pickBundleLanguage, useBundledTranslation } from '../bundled-translation'
import { HostWidgetBoundary } from '../host-widget-boundary'

const BUNDLES = { es: { hola: 'Hola {name}', solo: 'Solo español' }, en: { hola: 'Hi {{name}}' } }

function Probe() {
    const { t } = useBundledTranslation(BUNDLES)
    return (
        <p>
            <span data-testid="hola">{t('hola', { name: 'Ana' })}</span>
            <span data-testid="solo">{t('solo')}</span>
            <span data-testid="raw">{t('nope')}</span>
        </p>
    )
}

describe('useBundledTranslation', () => {
    afterEach(cleanup)
    it('usa el idioma del host, no el del navegador', () => {
        host.language = 'es-MX'
        host.overrides = {}
        Object.defineProperty(window.navigator, 'language', { value: 'en-US', configurable: true })
        render(<Probe />)
        expect(screen.getByTestId('hola').textContent).toBe('Hola Ana')
    })

    it('en inglés cae al respaldo cuando falta la clave y respeta la sobrescritura del host', () => {
        host.language = 'en'
        host.overrides = { solo: 'Tenant text' }
        render(<Probe />)
        expect(screen.getByTestId('hola').textContent).toBe('Hi Ana')
        expect(screen.getByTestId('solo').textContent).toBe('Tenant text')
        expect(screen.getByTestId('raw').textContent).toBe('nope')
    })

    it('helpers puros', () => {
        expect(pickBundleLanguage(BUNDLES, 'en-GB')).toBe('en')
        expect(pickBundleLanguage(BUNDLES, 'fr')).toBe('es')
        expect(interpolateText('{a} y {{ b }} y {c}', { a: 1, b: 2 })).toBe('1 y 2 y {c}')
        expect(bundledTranslator(BUNDLES, 'en')('solo')).toBe('Solo español')
    })
})

function Boom(): never {
    throw new Error("Failed to execute 'removeChild' on 'Node'")
}

describe('HostWidgetBoundary', () => {
    it('contiene el error del widget con un aviso local', () => {
        host.language = 'es'
        host.overrides = {}
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        render(
            <div>
                <span>fuera</span>
                <HostWidgetBoundary name="products.market_picker">
                    <Boom />
                </HostWidgetBoundary>
            </div>,
        )
        expect(screen.getByText('fuera')).toBeTruthy()
        expect(screen.getByTestId('host-widget-error').getAttribute('data-widget')).toBe('products.market_picker')
        expect(screen.getByText('Este campo no se pudo mostrar')).toBeTruthy()
        spy.mockRestore()
    })
})
