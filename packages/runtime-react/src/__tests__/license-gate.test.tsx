// @vitest-environment happy-dom
//
// Contrato del blindaje de licencia (LicenseGate + banner + helpers):
//   - Sin enforcement o estado operable → children, sin candado.
//   - stale/grace → children + banner degradado (grace descartable, expired no).
//   - enforcement && missing/invalid/expired → modal bloqueante con activación.
//   - trial vencido → copy "tu prueba terminó".
//   - onActivate: éxito desbloquea (el host refresca), error muestra el mensaje.
//
// Gotcha conocido (reference_radix_select_happydom_reset): nada de Radix Select
// aquí — el gate usa un <Input> plano y el texto visible es el gate de los asserts.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, opts?: Record<string, unknown>) => {
            let s = (opts?.defaultValue as string) ?? _k
            // interpolación mínima {{x}} para los mensajes del banner.
            for (const [k, v] of Object.entries(opts ?? {})) {
                if (k === 'defaultValue') continue
                s = s.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v))
            }
            return s
        },
    }),
}))

afterEach(() => {
    cleanup()
    localStorage.clear()
})

import {
    LicenseGate,
    LicenseExpiryBanner,
    LicenseStatusBadge,
    isLicenseBlocking,
    isLicenseOperable,
    isPresetEntitled,
    isTrialExpired,
    type LicenseState,
} from '../license'

function make(partial: Partial<LicenseState>): LicenseState {
    return {
        enforced: true,
        configured: true,
        valid: false,
        status: 'missing',
        entitlements: [],
        wildcard: false,
        stale: false,
        in_grace: false,
        days_remaining: 0,
        ...partial,
    }
}

const CHILD = <div>contenido protegido</div>

describe('helpers de estado', () => {
    it('operable/blocking espejan al backend', () => {
        expect(isLicenseOperable(make({ status: 'valid', valid: true }))).toBe(true)
        expect(isLicenseOperable(make({ status: 'grace', in_grace: true }))).toBe(true)
        expect(isLicenseOperable(make({ status: 'missing' }))).toBe(false)
        expect(isLicenseBlocking(make({ status: 'expired' }))).toBe(true)
        // Sin enforcement nunca bloquea, aunque el status sea feo.
        expect(isLicenseBlocking(make({ enforced: false, status: 'expired' }))).toBe(false)
        // undefined (aún cargando) → fail-open.
        expect(isLicenseBlocking(undefined)).toBe(false)
    })

    it('entitlement respeta wildcard y lista explícita', () => {
        expect(isPresetEntitled(make({ wildcard: true }), 'pitsline')).toBe(true)
        expect(isPresetEntitled(make({ entitlements: ['pitsline'] }), 'pitsline')).toBe(true)
        expect(isPresetEntitled(make({ entitlements: ['otro'] }), 'pitsline')).toBe(false)
        expect(isPresetEntitled(make({ enforced: false }), 'lo-que-sea')).toBe(true)
    })

    it('trial vencido se detecta', () => {
        expect(isTrialExpired(make({ plan: 'trial', status: 'expired' }))).toBe(true)
        expect(isTrialExpired(make({ plan: 'pro', status: 'expired' }))).toBe(false)
    })
})

describe('LicenseGate', () => {
    const noop = () => Promise.resolve()

    it('renderiza children sin candado cuando la licencia es válida', () => {
        render(
            <LicenseGate state={make({ status: 'valid', valid: true })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByText('contenido protegido')).toBeTruthy()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('sin enforcement es transparente', () => {
        render(
            <LicenseGate state={make({ enforced: false, status: 'missing' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByText('contenido protegido')).toBeTruthy()
        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('bloquea con modal cuando falta la licencia', () => {
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByRole('dialog')).toBeTruthy()
        expect(screen.getByText('Activa tu licencia')).toBeTruthy()
        // children siguen montados detrás del overlay (no reload).
        expect(screen.getByText('contenido protegido')).toBeTruthy()
    })

    it('trial vencido muestra el copy de prueba terminada', () => {
        render(
            <LicenseGate state={make({ status: 'expired', plan: 'trial' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByText('Tu prueba gratuita terminó')).toBeTruthy()
    })

    it('activación exitosa llama onActivate con el código pegado', async () => {
        const onActivate = vi.fn().mockResolvedValue(undefined)
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={onActivate}>
                {CHILD}
            </LicenseGate>,
        )
        fireEvent.change(screen.getByLabelText('Clave o token de licencia'), {
            target: { value: '  lic_abc123  ' },
        })
        fireEvent.click(screen.getByText('Activar licencia'))
        await waitFor(() => expect(onActivate).toHaveBeenCalledWith('lic_abc123'))
    })

    it('muestra el mensaje de error del backend al fallar', async () => {
        const onActivate = vi.fn().mockRejectedValue(new Error('Token no corresponde a esta instancia'))
        render(
            <LicenseGate state={make({ status: 'invalid' })} onActivate={onActivate}>
                {CHILD}
            </LicenseGate>,
        )
        fireEvent.change(screen.getByLabelText('Clave o token de licencia'), {
            target: { value: 'lic_bad' },
        })
        fireEvent.click(screen.getByText('Activar licencia'))
        await waitFor(() =>
            expect(screen.getByText('Token no corresponde a esta instancia')).toBeTruthy(),
        )
    })

    it('el botón activar está deshabilitado sin código', () => {
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        const btn = screen.getByText('Activar licencia').closest('button')!
        expect(btn.disabled).toBe(true)
    })

    it('sin canActivate oculta el form y muestra el mensaje read-only por defecto', () => {
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={noop} canActivate={false}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByRole('dialog')).toBeTruthy()
        expect(screen.queryByLabelText('Clave o token de licencia')).toBeNull()
        expect(screen.queryByText('Activar licencia')).toBeNull()
        expect(
            screen.getByText('Contacta al administrador de la plataforma para activar la licencia.'),
        ).toBeTruthy()
    })

    it('sin canActivate respeta el readOnlyMessage custom, incl. trial vencido', () => {
        render(
            <LicenseGate
                state={make({ status: 'expired', plan: 'trial' })}
                onActivate={noop}
                canActivate={false}
                readOnlyMessage="Pídele a Ana que active la licencia."
            >
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByText('Tu prueba gratuita terminó')).toBeTruthy()
        expect(screen.queryByLabelText('Clave o token de licencia')).toBeNull()
        expect(screen.getByText('Pídele a Ana que active la licencia.')).toBeTruthy()
    })

    it('canActivate true (default) mantiene el form de activación', () => {
        render(
            <LicenseGate state={make({ status: 'invalid' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByLabelText('Clave o token de licencia')).toBeTruthy()
        expect(screen.getByText('Activar licencia')).toBeTruthy()
    })

    it('grace degrada con banner en vez de bloquear', () => {
        render(
            <LicenseGate
                state={make({ status: 'grace', in_grace: true, days_remaining: 5, grace_until: '2026-08-01' })}
                onActivate={noop}
            >
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getByText('contenido protegido')).toBeTruthy()
        expect(screen.getByRole('alert')).toBeTruthy()
    })
})

describe('LicenseExpiryBanner', () => {
    it('silencioso sin enforcement', () => {
        const { container } = render(
            <LicenseExpiryBanner state={make({ enforced: false, status: 'expired' })} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('expired no es descartable (no hay botón cerrar)', () => {
        render(<LicenseExpiryBanner state={make({ status: 'expired' })} />)
        expect(screen.getByRole('alert')).toBeTruthy()
        expect(screen.queryByTitle('Descartar')).toBeNull()
    })

    it('grace es descartable y persiste el descarte', () => {
        const { rerender } = render(
            <LicenseExpiryBanner state={make({ status: 'grace', in_grace: true, days_remaining: 3 })} />,
        )
        fireEvent.click(screen.getByTitle('Descartar'))
        expect(screen.queryByRole('alert')).toBeNull()
        // Re-render: sigue descartado por el TTL en localStorage.
        rerender(
            <LicenseExpiryBanner state={make({ status: 'grace', in_grace: true, days_remaining: 3 })} />,
        )
        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('aviso de renovación próxima cuando quedan pocos días', () => {
        render(
            <LicenseExpiryBanner state={make({ status: 'valid', valid: true, days_remaining: 7 })} />,
        )
        expect(screen.getByText('Tu licencia vence en 7 días.')).toBeTruthy()
    })

    it('botón gestionar solo cuando el host pasa onManage', () => {
        const onManage = vi.fn()
        render(
            <LicenseExpiryBanner
                state={make({ status: 'expired' })}
                onManage={onManage}
            />,
        )
        fireEvent.click(screen.getByText('Gestionar licencia'))
        expect(onManage).toHaveBeenCalled()
    })
})

describe('LicenseStatusBadge', () => {
    it('traduce cada status a etiqueta legible', () => {
        const { rerender } = render(<LicenseStatusBadge status="valid" />)
        expect(screen.getByText('Activa')).toBeTruthy()
        rerender(<LicenseStatusBadge status="expired" />)
        expect(screen.getByText('Vencida')).toBeTruthy()
        rerender(<LicenseStatusBadge status="stale" />)
        expect(screen.getByText('Sin verificar')).toBeTruthy()
    })
})
