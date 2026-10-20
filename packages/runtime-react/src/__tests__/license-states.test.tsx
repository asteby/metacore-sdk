// @vitest-environment happy-dom
//
// Estados de licencia, de punta a punta en el SDK (genérico: sin marca ni vertical):
//   vigente, por vencer, en gracia, vencida (solo lectura con exportación),
//   desactivada, hub caído (opera con lease), sin licencia, clonada.
// Cada estado se prueba con su texto EXACTO en español y en inglés, con el
// contacto del vendedor cuando la licencia lo trae, y el modal con encabezado y
// pie fijos (solo el cuerpo se desplaza).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'

let LANG = 'es'
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        i18n: { language: LANG },
        t: (k: string, opts?: Record<string, unknown>) => {
            let s = (opts?.defaultValue as string) ?? k
            for (const [key, v] of Object.entries(opts ?? {})) {
                if (key === 'defaultValue') continue
                s = s.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(v))
            }
            return s
        },
    }),
}))

afterEach(() => {
    cleanup()
    localStorage.clear()
    LANG = 'es'
})

import {
    LicenseGate,
    LicenseExpiryBanner,
    LicenseStatusBadge,
    LICENSE_MESSAGES,
    registerLicenseMessages,
    deriveLicenseView,
    isLicenseBlocking,
    isLicenseReadOnly,
    type LicenseState,
} from '../license'

function make(p: Partial<LicenseState>): LicenseState {
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
        ...p,
    }
}

const SELLER = { name: 'Distribuidora Norte', email: 'ventas@norte.mx', phone: '+52 55 0000 0000' }
const CHILD = <div>contenido protegido</div>
const noop = () => Promise.resolve()

describe('deriveLicenseView: una sola verdad para cada estado', () => {
    it('sin enforcement o sin estado no hay vista', () => {
        expect(deriveLicenseView(undefined)).toBeUndefined()
        expect(deriveLicenseView(make({ enforced: false, status: 'expired' }))).toBeUndefined()
    })

    const cases: Array<[string, Partial<LicenseState>, Record<string, unknown>]> = [
        ['vigente', { status: 'valid', valid: true, days_remaining: 200 }, { condition: 'valid', blocking: false, readOnly: false }],
        ['por vencer', { status: 'valid', valid: true, days_remaining: 9 }, { condition: 'expiring', blocking: false, readOnly: false }],
        ['en gracia', { status: 'grace', in_grace: true, days_remaining: 4 }, { condition: 'grace', blocking: false, readOnly: false }],
        ['vencida, política clásica', { status: 'expired' }, { condition: 'expired', blocking: true, readOnly: false }],
        ['vencida, solo lectura', { status: 'expired', on_expiry: 'read_only' }, { condition: 'expired', blocking: false, readOnly: true }],
        ['desactivada, sin plazo', { status: 'revoked' }, { condition: 'revoked', blocking: true, readOnly: false }],
        ['desactivada, con plazo de aviso', { status: 'revoked', in_grace: true }, { condition: 'revoked', blocking: false, readOnly: true }],
        ['hub caído con lease', { status: 'stale', stale: true, valid: true }, { condition: 'hub_unreachable', blocking: false, ownerOnly: true }],
        ['sin licencia', { status: 'missing' }, { condition: 'missing', blocking: true }],
        ['no válida', { status: 'invalid' }, { condition: 'invalid', blocking: true }],
    ]
    it.each(cases)('%s', (_n, partial, expected) => {
        expect(deriveLicenseView(make(partial))).toMatchObject(expected)
    })

    it('clonada se suma a cualquier estado y no bloquea', () => {
        const v = deriveLicenseView(make({ status: 'valid', valid: true, days_remaining: 100, notices: ['clone_suspected'] }))
        expect(v).toMatchObject({ condition: 'valid', cloned: true, blocking: false })
    })

    it('los helpers siguen al estado: solo lectura nunca bloquea; revocada sin plazo sí', () => {
        expect(isLicenseBlocking(make({ status: 'expired', on_expiry: 'read_only' }))).toBe(false)
        expect(isLicenseReadOnly(make({ status: 'expired', on_expiry: 'read_only' }))).toBe(true)
        expect(isLicenseBlocking(make({ status: 'revoked' }))).toBe(true)
        expect(isLicenseReadOnly(make({ status: 'valid', valid: true, on_expiry: 'read_only' }))).toBe(false)
    })
})

describe('banner: texto exacto por estado (es)', () => {
    const txt = (s: Partial<LicenseState>, props: Record<string, unknown> = {}) => {
        const { container } = render(<LicenseExpiryBanner state={make(s)} {...props} />)
        return Array.from(container.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? '')
    }

    it('por vencer', () => {
        expect(txt({ status: 'valid', valid: true, days_remaining: 7 })[0]).toContain('Tu licencia vence en 7 días.')
    })
    it('por vencer mañana y hoy', () => {
        expect(txt({ status: 'valid', valid: true, days_remaining: 1 })[0]).toContain('Tu licencia vence mañana.')
        cleanup()
        expect(txt({ status: 'valid', valid: true, days_remaining: 0 })[0]).toContain('Tu licencia vence hoy.')
    })
    it('vigente no muestra nada', () => {
        expect(txt({ status: 'valid', valid: true, days_remaining: 120 })).toEqual([])
    })
    it('en gracia con fecha', () => {
        expect(txt({ status: 'grace', in_grace: true, days_remaining: 5, expires_at: '2026-10-01T00:00:00Z' })[0]).toContain(
            'Tu licencia venció el 1 de octubre de 2026. Tienes 5 días para renovarla antes de que se bloqueen los cambios.',
        )
    })
    it('vencida en solo lectura, con exportación y contacto del vendedor', () => {
        const onExport = vi.fn()
        const [m] = txt(
            { status: 'expired', on_expiry: 'read_only', expires_at: '2026-10-01T00:00:00Z', seller: SELLER },
            { onExport },
        )
        expect(m).toContain(
            'Tu licencia venció el 1 de octubre de 2026. Tu información sigue disponible para consultar y exportar; renueva para volver a registrar cambios.',
        )
        expect(m).toContain('Contacto: Distribuidora Norte · ventas@norte.mx · +52 55 0000 0000')
        fireEvent.click(screen.getByText('Exportar mis datos'))
        expect(onExport).toHaveBeenCalled()
        // En solo lectura el aviso es fijo.
        expect(screen.queryByTitle('Descartar')).toBeNull()
    })
    it('el botón de exportar solo aparece en solo lectura', () => {
        txt({ status: 'grace', in_grace: true, days_remaining: 3 }, { onExport: () => {} })
        expect(screen.queryByText('Exportar mis datos')).toBeNull()
    })
    it('desactivada con plazo nombra al vendedor', () => {
        const [m] = txt({ status: 'revoked', in_grace: true, grace_until: '2026-10-23T00:00:00Z', seller: SELLER })
        expect(m).toContain(
            'Distribuidora Norte desactivó esta licencia. Tu información sigue disponible para consultar y exportar hasta el 23 de octubre de 2026.',
        )
    })
    it('desactivada sin vendedor dice "Tu proveedor"', () => {
        const [m] = txt({ status: 'revoked', in_grace: true })
        expect(m).toContain('Tu proveedor desactivó esta licencia. Tu información sigue disponible para consultar y exportar.')
    })
    it('hub caído: el dueño lo ve; los demás usuarios no', () => {
        const stale = { status: 'stale', stale: true, valid: true, last_checked_at: '2026-10-10T08:00:00Z' } as const
        expect(txt(stale, { isOwner: true })[0]).toContain('No pudimos contactar al servidor de licencias desde el 10 de octubre de 2026. Seguimos funcionando.')
        cleanup()
        expect(txt(stale, { isOwner: false })).toEqual([])
        cleanup()
        // Sin informar el rol, tampoco se muestra (default seguro).
        expect(txt(stale)).toEqual([])
    })
    it('clonada: solo el dueño, con el nombre del vendedor', () => {
        const s = { status: 'valid', valid: true, days_remaining: 300, notices: ['clone_suspected'], seller: SELLER } as const
        expect(txt(s, { isOwner: true })[0]).toContain('Detectamos esta licencia activa en otro servidor. Si no fue a propósito, avisa a Distribuidora Norte.')
        cleanup()
        expect(txt(s, { isOwner: false })).toEqual([])
        cleanup()
        expect(txt({ ...s, seller: undefined }, { isOwner: true })[0]).toContain('avisa a tu proveedor.')
    })
    it('clonada y por vencer se muestran juntas', () => {
        const rows = txt({ status: 'valid', valid: true, days_remaining: 5, notices: ['clone_suspected'] }, { isOwner: true })
        expect(rows).toHaveLength(2)
    })
    it('descartar un aviso menor no oculta la fila de clonado, que no se descarta', () => {
        const st = { status: 'valid', valid: true, days_remaining: 5, notices: ['clone_suspected'] } as const
        const { container } = render(<LicenseExpiryBanner state={make(st)} isOwner />)
        fireEvent.click(screen.getByTitle('Descartar')) // solo hay un botón: el de la fila principal
        const rows = Array.from(container.querySelectorAll('[role="alert"]')).map((n) => n.textContent ?? '')
        expect(rows).toHaveLength(1)
        expect(rows[0]).toContain('otro servidor')
        expect(screen.queryByTitle('Descartar')).toBeNull()
    })
})

describe('banner: inglés', () => {
    it('textos exactos en inglés', () => {
        LANG = 'en-US'
        const { container } = render(
            <LicenseExpiryBanner
                state={make({ status: 'expired', on_expiry: 'read_only', expires_at: '2026-10-01T00:00:00Z', seller: SELLER })}
                onExport={() => {}}
            />,
        )
        const m = container.textContent ?? ''
        expect(m).toContain('Your license expired on October 1, 2026. Your data is still available to view and export; renew to record changes again.')
        expect(m).toContain('Contact: Distribuidora Norte · ventas@norte.mx · +52 55 0000 0000')
        expect(screen.getByText('Export my data')).toBeTruthy()
        cleanup()
        const g = render(<LicenseExpiryBanner state={make({ status: 'grace', in_grace: true, days_remaining: 5, expires_at: '2026-10-01T00:00:00Z' })} />)
        expect(g.container.textContent).toContain('Your license expired on October 1, 2026. You have 5 days to renew it before changes are blocked.')
    })
})

describe('gate: modal con encabezado y pie fijos', () => {
    it('vencida con solo lectura abre la app, no el modal', () => {
        render(
            <LicenseGate state={make({ status: 'expired', on_expiry: 'read_only' })} onActivate={noop} onExport={() => {}}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.getByText('contenido protegido')).toBeTruthy()
        expect(screen.getByText('Exportar mis datos')).toBeTruthy()
    })

    it('vencida sin solo lectura (instancias sin enlace de activación) sigue bloqueando como antes', () => {
        render(
            <LicenseGate state={make({ status: 'expired' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByRole('dialog')).toBeTruthy()
        expect(screen.getByText('Tu licencia venció')).toBeTruthy()
    })

    it('desactivada sin plazo: modal con título, texto y contacto del vendedor', () => {
        render(
            <LicenseGate state={make({ status: 'revoked', seller: SELLER })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        const dlg = screen.getByRole('dialog')
        expect(within(dlg).getByText('Licencia desactivada')).toBeTruthy()
        expect(within(dlg).getByText('Distribuidora Norte desactivó la licencia de esta instancia.')).toBeTruthy()
        expect(dlg.querySelector('[data-license-part="seller"]')?.textContent).toContain('ventas@norte.mx')
    })

    it('sin licencia: textos en inglés', () => {
        LANG = 'en'
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={noop}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByText('Activate your license')).toBeTruthy()
        expect(screen.getByText("This instance doesn't have an active license yet.")).toBeTruthy()
        expect(screen.getByText('Activate license')).toBeTruthy()
    })

    it('encabezado y pie fijos; solo el cuerpo se desplaza; el botón activa el formulario', async () => {
        const onActivate = vi.fn().mockResolvedValue(undefined)
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={onActivate}>
                {CHILD}
            </LicenseGate>,
        )
        const dlg = screen.getByRole('dialog')
        const header = dlg.querySelector('[data-license-part="header"]') as HTMLElement
        const body = dlg.querySelector('[data-license-part="body"]') as HTMLElement
        const footer = dlg.querySelector('[data-license-part="footer"]') as HTMLElement
        expect(header && body && footer).toBeTruthy()
        expect(header.className).toContain('shrink-0')
        expect(footer.className).toContain('shrink-0')
        expect(body.className).toContain('overflow-y-auto')
        expect(body.className).toContain('min-h-0')
        // El contenedor limita su alto: sin eso el cuerpo no podría desplazarse.
        expect(header.parentElement!.className).toContain('max-h-[')
        expect(header.parentElement!.className).toContain('flex-col')
        // El botón vive en el pie (fuera del cuerpo que se desplaza) y envía el formulario.
        const btn = within(footer).getByText('Activar licencia').closest('button')!
        expect(body.contains(btn)).toBe(false)
        expect(btn.getAttribute('form')).toBe('license-gate-form')
        fireEvent.change(screen.getByLabelText('Clave o token de licencia'), { target: { value: ' lic_x ' } })
        fireEvent.click(btn)
        await waitFor(() => expect(onActivate).toHaveBeenCalledWith('lic_x'))
    })

    it('con enlaces de activación cambia la etiqueta del campo', () => {
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={noop} acceptsActivationLink>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.getByLabelText('Enlace, código o clave de licencia')).toBeTruthy()
    })

    it('un error con código del hub muestra el texto localizado de ese caso', async () => {
        const err = Object.assign(new Error('license rejected: 409'), { code: 'activation_used' })
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={vi.fn().mockRejectedValue(err)} acceptsActivationLink>
                {CHILD}
            </LicenseGate>,
        )
        fireEvent.change(screen.getByLabelText('Enlace, código o clave de licencia'), { target: { value: 'acs_x' } })
        fireEvent.click(screen.getByText('Activar licencia'))
        await waitFor(() =>
            expect(screen.getByText('Este enlace ya se usó en otro servidor. Pide uno nuevo a tu proveedor.')).toBeTruthy(),
        )
    })

    it('un error sin código muestra el mensaje del backend', async () => {
        render(
            <LicenseGate state={make({ status: 'missing' })} onActivate={vi.fn().mockRejectedValue(new Error('boom'))}>
                {CHILD}
            </LicenseGate>,
        )
        fireEvent.change(screen.getByLabelText('Clave o token de licencia'), { target: { value: 'x' } })
        fireEvent.click(screen.getByText('Activar licencia'))
        await waitFor(() => expect(screen.getByText('boom')).toBeTruthy())
    })

    it('vencida con exportación ofrece el botón en el pie del modal', () => {
        const onExport = vi.fn()
        render(
            <LicenseGate state={make({ status: 'expired' })} onActivate={noop} onExport={onExport}>
                {CHILD}
            </LicenseGate>,
        )
        const footer = screen.getByRole('dialog').querySelector('[data-license-part="footer"]') as HTMLElement
        fireEvent.click(within(footer).getByText('Exportar mis datos'))
        expect(onExport).toHaveBeenCalled()
    })

    it('hub caído no estorba a un usuario que no es el dueño', () => {
        render(
            <LicenseGate state={make({ status: 'stale', stale: true, valid: true })} onActivate={noop} isOwner={false}>
                {CHILD}
            </LicenseGate>,
        )
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.queryByRole('dialog')).toBeNull()
    })
})

describe('copy: sin eco de instrucciones', () => {
    const ECHO = /\b(pega|pegar|pegue|ingresa|introduce|paste|enter your|type your)\b/i

    it('ningún texto de estado (título, descripción, aviso) manda a pegar o escribir algo', () => {
        const stateKeys = (m: Record<string, string>) =>
            Object.entries(m).filter(([k]) => /\.(description|title)|_description|_title|banner\./.test(k) && !/placeholder|label|activate/.test(k))
        for (const lang of ['es', 'en'] as const) {
            for (const [k, v] of stateKeys(LICENSE_MESSAGES[lang])) {
                expect(v, `${lang} ${k}`).not.toMatch(ECHO)
                if (/description|banner\./.test(k)) expect(v, `${lang} ${k}`).not.toContain('lic_')
            }
        }
    })

    it('es y en tienen exactamente las mismas claves', () => {
        expect(Object.keys(LICENSE_MESSAGES.en).sort()).toEqual(Object.keys(LICENSE_MESSAGES.es).sort())
    })

    it('cada texto con variable usa las mismas variables en es y en en', () => {
        const vars = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((x) => x.replace(/\s/g, '')).sort()
        for (const k of Object.keys(LICENSE_MESSAGES.es)) {
            expect(vars(LICENSE_MESSAGES.en[k]), k).toEqual(vars(LICENSE_MESSAGES.es[k]))
        }
    })
})

describe('insignia y registro i18n', () => {
    it('la insignia de desactivada existe en es y en', () => {
        render(<LicenseStatusBadge status="revoked" />)
        expect(screen.getByText('Desactivada')).toBeTruthy()
        cleanup()
        LANG = 'en'
        render(<LicenseStatusBadge status="revoked" />)
        expect(screen.getByText('Deactivated')).toBeTruthy()
    })

    it('registerLicenseMessages siembra es/en sin pisar lo que el host ya definió', () => {
        const calls: Array<[string, string, Record<string, unknown>, boolean | undefined, boolean | undefined]> = []
        registerLicenseMessages({
            addResourceBundle: (lng, ns, res, deep, overwrite) => {
                calls.push([lng, ns, res as Record<string, unknown>, deep, overwrite])
            },
        })
        expect(calls.map((c) => c[0]).sort()).toEqual(['en', 'es'])
        for (const c of calls) expect(c[4]).toBe(false) // overwrite=false: el host manda
        const es = calls.find((c) => c[0] === 'es')![2] as { license: { gate: { title: string } } }
        expect(es.license.gate.title).toBe('Activa tu licencia')
        expect(() => registerLicenseMessages(undefined)).not.toThrow()
    })
})
