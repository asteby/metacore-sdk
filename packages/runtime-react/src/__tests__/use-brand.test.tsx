// @vitest-environment happy-dom
//
// Contrato de la marca del cliente (BrandProvider + useBrand + BrandDocumentSync):
//   - Sin provider, la marca es vacía: nombre '' (nunca un nombre de producto fijo).
//   - BrandDocumentSync aplica document.title, favicon y las variables CSS.
//   - Con marca vacía no toca el título ni el favicon del host.
//   - LicenseGate sin la prop `branding` toma la marca del provider.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) ?? k,
    }),
}))

import {
    BrandDocumentSync,
    BrandProvider,
    EMPTY_BRAND,
    useBrand,
    BRAND_CSS_VARS,
} from '../brand'
import { LicenseGate, type LicenseState } from '../license'

function resetDocument() {
    document.head.innerHTML = '<link rel="icon" href="/static.svg">'
    document.title = 'host'
    document.documentElement.removeAttribute('style')
}

afterEach(() => {
    cleanup()
    resetDocument()
})

function BrandName() {
    const brand = useBrand()
    return <span data-testid="name">{`[${brand.name}]`}</span>
}

function iconHrefs(): string[] {
    return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map((l) =>
        l.getAttribute('href') ?? '',
    )
}

const blocked: LicenseState = {
    enforced: true,
    configured: false,
    valid: false,
    status: 'missing',
    entitlements: [],
    wildcard: false,
    stale: false,
    in_grace: false,
    days_remaining: 0,
}

describe('useBrand', () => {
    it('sin provider devuelve la marca vacía (nombre vacío, nunca un nombre fijo)', () => {
        render(<BrandName />)
        expect(screen.getByTestId('name').textContent).toBe('[]')
        expect(EMPTY_BRAND.name).toBe('')
        expect(EMPTY_BRAND.logo).toBe('')
    })

    it('expone la marca del provider y completa los campos ausentes', () => {
        let seen: ReturnType<typeof useBrand> | undefined
        function Probe() {
            seen = useBrand()
            return null
        }
        render(
            <BrandProvider value={{ name: '  Acme  ', locked: true, source: 'hub' }}>
                <Probe />
            </BrandProvider>,
        )
        expect(seen).toEqual({ ...EMPTY_BRAND, name: 'Acme', locked: true, source: 'hub' })
    })
})

describe('BrandDocumentSync', () => {
    it('aplica título y favicon (el favicon reemplaza los iconos estáticos)', () => {
        resetDocument()
        render(
            <BrandProvider value={{ name: 'Acme', logo: '/brand/logo.png', favicon: '/brand/favicon.svg' }}>
                <BrandDocumentSync />
            </BrandProvider>,
        )
        expect(document.title).toBe('Acme')
        expect(iconHrefs()).toEqual(['/brand/favicon.svg'])
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!
        expect(link.type).toBe('image/svg+xml')
    })

    it('usa el logo cuando no hay favicon', () => {
        resetDocument()
        render(<BrandProvider value={{ name: 'Acme', logo: '/brand/logo.png' }} syncDocument />)
        expect(iconHrefs()).toEqual(['/brand/logo.png'])
    })

    it('aplica los colores como variables CSS en <html>', () => {
        resetDocument()
        render(
            <BrandProvider value={{ primaryColor: '#123456', accentColor: '#abcdef' }} syncDocument />,
        )
        const style = document.documentElement.style
        expect(style.getPropertyValue(BRAND_CSS_VARS.primary)).toBe('#123456')
        expect(style.getPropertyValue(BRAND_CSS_VARS.accent)).toBe('#abcdef')
    })

    it('con marca vacía deja intactos el título y el favicon del host', () => {
        resetDocument()
        render(<BrandDocumentSync />)
        expect(document.title).toBe('host')
        expect(iconHrefs()).toEqual(['/static.svg'])
        expect(document.documentElement.style.getPropertyValue(BRAND_CSS_VARS.primary)).toBe('')
    })
})

describe('LicenseGate con BrandProvider', () => {
    it('sin la prop branding usa el nombre y el logo del provider', () => {
        render(
            <BrandProvider value={{ name: 'Acme', logo: '/brand/logo.png' }}>
                <LicenseGate state={blocked} onActivate={async () => {}}>
                    <div>app</div>
                </LicenseGate>
            </BrandProvider>,
        )
        const dialog = screen.getByRole('dialog')
        expect(dialog.textContent).toContain('Acme')
        expect(dialog.querySelector('img')?.getAttribute('src')).toBe('/brand/logo.png')
    })

    it('la prop branding gana sobre el provider', () => {
        render(
            <BrandProvider value={{ name: 'Acme' }}>
                <LicenseGate state={blocked} onActivate={async () => {}} branding={{ name: 'Propia' }}>
                    <div>app</div>
                </LicenseGate>
            </BrandProvider>,
        )
        const dialog = screen.getByRole('dialog')
        expect(dialog.textContent).toContain('Propia')
        expect(dialog.textContent).not.toContain('Acme')
    })

    it('sin provider ni prop cae al encabezado neutro', () => {
        render(
            <LicenseGate state={blocked} onActivate={async () => {}}>
                <div>app</div>
            </LicenseGate>,
        )
        const dialog = screen.getByRole('dialog')
        expect(dialog.textContent).toContain('Esta instancia')
        expect(dialog.querySelector('img')).toBeNull()
    })
})

describe('subpath /brand', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'brand')
    const sources = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8'))

    it('solo importa React (ligero para la primera pintura)', () => {
        const specs = sources.flatMap((code) =>
            [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!),
        )
        expect(specs.filter((s) => !s.startsWith('.') && s !== 'react')).toEqual([])
    })

    it('no contiene un nombre de producto fijo', () => {
        for (const code of sources) expect(code).not.toMatch(/['"]Ops['"]/)
    })
})
