// @vitest-environment happy-dom
//
// InstalledAddonsProvider: sin provider = desconocido (undefined), con provider
// responde por clave de addon y por capacidad.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
    InstalledAddonsProvider,
    useAddonInstalled,
    useCapabilityProvided,
    useInstalledAddons,
} from '../installed-addons-context'

afterEach(() => cleanup())

function Probe() {
    const fiscal = useAddonInstalled('fiscal_mexico')
    const issuer = useCapabilityProvided('fiscal.invoice_issuer')
    const all = useInstalledAddons()
    return (
        <span data-testid="probe">
            {String(fiscal)}|{String(issuer)}|{all ? [...all.addons].join(',') : 'null'}
        </span>
    )
}

describe('InstalledAddonsProvider', () => {
    it('sin provider devuelve undefined/null (nunca asume ausente)', () => {
        render(<Probe />)
        expect(screen.getByTestId('probe').textContent).toBe('undefined|undefined|null')
    })

    it('responde por addon y por capacidad', () => {
        render(
            <InstalledAddonsProvider addons={['customers', 'fiscal_mexico']} capabilities={['fiscal.invoice_issuer']}>
                <Probe />
            </InstalledAddonsProvider>,
        )
        expect(screen.getByTestId('probe').textContent).toBe('true|true|customers,fiscal_mexico')
    })

    it('addon no instalado = false', () => {
        render(
            <InstalledAddonsProvider addons={['customers']}>
                <Probe />
            </InstalledAddonsProvider>,
        )
        expect(screen.getByTestId('probe').textContent).toBe('false|false|customers')
    })
})
