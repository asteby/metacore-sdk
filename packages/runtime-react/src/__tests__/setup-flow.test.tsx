// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    return { useTranslation: () => ({ t, i18n: { language: 'es', exists: () => true } }) }
})

import { SetupFlow } from '../setup/setup-flow'
import type { SetupFlowClient, SetupFlowDef, SetupFlowState, SetupStepState } from '../setup/types'

const st = (key: string, status: SetupStepState['status'], extra: Partial<SetupStepState> = {}): SetupStepState => ({ key, status, ...extra })

const flow: SetupFlowDef = {
    key: 'mail',
    title: 'Configurar correo',
    steps: [
        {
            key: 'domain',
            kind: 'form',
            title: 'Dominio',
            fields: [
                { key: 'domain', label: 'Dominio de correo', required: true },
                { key: 'api_key', label: 'Llave API', type: 'secret', write_only: true, required: true },
                { key: 'mode', label: 'Modo', type: 'select', options: [{ value: 'managed', label: 'Gestionado' }, { value: 'relay', label: 'Relay' }] },
                { key: 'relay_host', label: 'Servidor relay', visible_when: { field: 'mode', equals: 'relay' } },
            ],
        },
        { key: 'dns', kind: 'records', title: 'Registros DNS', depends_on: ['domain'] },
        { key: 'send', kind: 'action', title: 'Enviar prueba', depends_on: ['dns'], action_label: 'Enviar correo de prueba' },
        { key: 'extras', kind: 'custom', title: 'Extras', optional: true, slot: 'mail.setup.extras' },
    ],
}

function makeClient(initial: SetupFlowState, over: Partial<SetupFlowClient> = {}) {
    const client = {
        getState: vi.fn().mockResolvedValue(initial),
        runStep: vi.fn().mockResolvedValue(undefined),
        skipStep: vi.fn().mockResolvedValue(undefined),
        ...over,
    } satisfies SetupFlowClient
    return client
}

beforeEach(() => {
    vi.useRealTimers()
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe('SetupFlow', () => {
    it('resumes at the first open step and blocks dependants', async () => {
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'warn', { records: [{ type: 'TXT', name: 'a.test', value: 'v=spf1', status: 'missing' }] })] })
        render(<SetupFlow flow={flow} client={client} />)
        // dns is the open step (domain is ok, dns is warn=satisfied → send is next)
        await screen.findByRole('heading', { name: 'Enviar prueba' })
        expect(screen.getByText('Enviar correo de prueba')).toBeTruthy()
        expect(client.getState).toHaveBeenCalledTimes(1)
    })

    it('shows a blocked step with what it waits for and jumps to it', async () => {
        const client = makeClient({ steps: [st('domain', 'pending')] })
        render(<SetupFlow flow={flow} client={client} />)
        await screen.findByRole('heading', { name: 'Dominio' })
        fireEvent.click(screen.getByText(/2\./)) // select "Registros DNS"
        expect(await screen.findByText('Antes completa: Dominio')).toBeTruthy()
        fireEvent.click(screen.getByText('Ir al paso'))
        expect(await screen.findByRole('heading', { name: 'Dominio' })).toBeTruthy()
    })

    it('runs an action step, merges the answer and shows diagnostics with a fix that runs an action', async () => {
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'pending')] })
        client.runStep.mockResolvedValueOnce(
            st('send', 'error', { diagnostics: [{ message: 'El servidor rechazó el mensaje', fix: { label: 'Reintentar con relay', action: 'use_relay' } }] }),
        )
        render(<SetupFlow flow={flow} client={client} />)
        fireEvent.click(await screen.findByText('Enviar correo de prueba'))
        expect(await screen.findByText('El servidor rechazó el mensaje')).toBeTruthy()
        expect(client.runStep).toHaveBeenCalledWith('send', undefined)
        client.runStep.mockResolvedValueOnce(st('send', 'ok'))
        fireEvent.click(screen.getByText('Reintentar con relay'))
        await waitFor(() => expect(client.runStep).toHaveBeenCalledWith('send', { action: 'use_relay' }))
    })

    it('a failed runStep restores the state and shows the server message', async () => {
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'pending')] })
        client.runStep.mockRejectedValueOnce({ response: { data: { message: 'SMTP caído' } } })
        render(<SetupFlow flow={flow} client={client} />)
        fireEvent.click(await screen.findByText('Enviar correo de prueba'))
        expect((await screen.findByRole('alert')).textContent).toBe('SMTP caído')
    })

    it('fix.step navigates inside the flow; fix.url goes through onNavigate and refuses javascript:', async () => {
        const onNavigate = vi.fn()
        const client = makeClient({
            steps: [
                st('domain', 'ok'),
                st('dns', 'ok'),
                st('send', 'error', {
                    diagnostics: [
                        { message: 'a', fix: { label: 'ir dns', step: 'dns' } },
                        { message: 'b', fix: { label: 'abrir docs', url: 'https://docs.test/x' } },
                        { message: 'c', fix: { label: 'malo', url: 'javascript:alert(1)' } },
                    ],
                }),
            ],
        })
        render(<SetupFlow flow={flow} client={client} onNavigate={onNavigate} />)
        await screen.findByRole('heading', { name: 'Enviar prueba' })
        fireEvent.click(screen.getByText('abrir docs'))
        expect(onNavigate).toHaveBeenCalledWith('https://docs.test/x')
        fireEvent.click(screen.getByText('malo'))
        expect(onNavigate).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByText('ir dns'))
        expect(await screen.findByRole('heading', { name: 'Registros DNS' })).toBeTruthy()
    })

    it('optional steps can be skipped', async () => {
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'ok')] })
        client.skipStep.mockResolvedValueOnce(st('extras', 'ok', { skipped: true }))
        render(<SetupFlow flow={flow} client={client} renderCustom={() => <div>pantalla extra</div>} />)
        await screen.findByRole('heading', { name: 'Extras' })
        expect(screen.getByText('pantalla extra')).toBeTruthy()
        fireEvent.click(screen.getByText('Omitir este paso'))
        await waitFor(() => expect(client.skipStep).toHaveBeenCalledWith('extras'))
        await waitFor(() => expect(screen.queryByText('Omitir este paso')).toBeNull())
    })

    it('custom steps fall back to the federated slot and say so when nothing is registered', async () => {
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'ok')] })
        render(<SetupFlow flow={flow} client={client} />)
        expect(await screen.findByText('Este paso no tiene una pantalla disponible.')).toBeTruthy()
    })

    it('reports completion once every required step is satisfied', async () => {
        const onComplete = vi.fn()
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'ok')] })
        render(<SetupFlow flow={flow} client={client} onComplete={onComplete} />)
        expect(await screen.findByText('La configuración está completa.')).toBeTruthy()
        expect(onComplete).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('progressbar', { name: 'Progreso de la configuración' }).getAttribute('aria-valuenow')).toBe('100')
    })

    it('load error offers retry', async () => {
        const client = makeClient({ steps: [] })
        client.getState.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ steps: [st('domain', 'pending')] })
        render(<SetupFlow flow={flow} client={client} />)
        expect((await screen.findByRole('alert')).textContent).toBe('boom')
        fireEvent.click(screen.getByText('Reintentar'))
        expect(await screen.findByRole('heading', { name: 'Dominio' })).toBeTruthy()
    })

    it('subscribe pushes new state', async () => {
        let push: (s: SetupFlowState) => void = () => {}
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'pending'), st('send', 'pending')] }, {
            subscribe: (cb) => {
                push = cb
                return () => {}
            },
        })
        render(<SetupFlow flow={flow} client={client} />)
        await screen.findByRole('heading', { name: 'Registros DNS' })
        act(() => push({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'pending')] }))
        await waitFor(() => expect(screen.getByText('Enviar correo de prueba')).toBeTruthy())
    })
})

describe('SetupFlow polling', () => {
    it('polls with backoff while a step runs and stops when it settles', async () => {
        vi.useFakeTimers()
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'running')] })
        client.getState
            .mockResolvedValueOnce({ steps: [st('domain', 'ok'), st('dns', 'running')] })
            .mockResolvedValueOnce({ steps: [st('domain', 'ok'), st('dns', 'running')] })
            .mockResolvedValue({ steps: [st('domain', 'ok'), st('dns', 'ok'), st('send', 'pending')] })
        render(<SetupFlow flow={flow} client={client} />)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(client.getState).toHaveBeenCalledTimes(1)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1900)
        })
        expect(client.getState).toHaveBeenCalledTimes(1) // 1st delay is 2000ms
        await act(async () => {
            await vi.advanceTimersByTimeAsync(200)
        })
        expect(client.getState).toHaveBeenCalledTimes(2)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3100) // 2nd delay is 3200ms → not yet
        })
        expect(client.getState).toHaveBeenCalledTimes(2)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(200)
        })
        expect(client.getState).toHaveBeenCalledTimes(3)
        // settled → no more polling
        await act(async () => {
            await vi.advanceTimersByTimeAsync(120000)
        })
        expect(client.getState).toHaveBeenCalledTimes(3)
    })

    it('retry_after_s from the server sets the next poll', async () => {
        vi.useFakeTimers()
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'running', { retry_after_s: 45 })] })
        render(<SetupFlow flow={flow} client={client} />)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(44000)
        })
        expect(client.getState).toHaveBeenCalledTimes(1)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1500)
        })
        expect(client.getState).toHaveBeenCalledTimes(2)
    })

    it('stops polling after maxPollAttempts and offers a manual refresh', async () => {
        vi.useFakeTimers()
        const client = makeClient({ steps: [st('domain', 'ok'), st('dns', 'running')] })
        render(<SetupFlow flow={flow} client={client} maxPollAttempts={2} />)
        for (let i = 0; i < 8; i++) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10000)
            })
        }
        expect(client.getState).toHaveBeenCalledTimes(3) // mount + 2 polls
        expect(screen.getByText(/Dejamos de revisar solo/)).toBeTruthy()
        fireEvent.click(screen.getByText('Revisar ahora'))
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(client.getState).toHaveBeenCalledTimes(4)
    })
})

describe('SetupFlow form step', () => {
    it('validates required fields, never sends an empty secret and runs the step with values', async () => {
        const client = makeClient({ steps: [st('domain', 'pending')] })
        render(<SetupFlow flow={flow} client={client} />)
        fireEvent.click(await screen.findByText('Guardar y continuar'))
        expect((await screen.findByText(/Faltan campos obligatorios: Dominio de correo, Llave API/)).getAttribute('role')).toBe('alert')
        expect(client.runStep).not.toHaveBeenCalled()
        fireEvent.change(screen.getByLabelText(/Dominio de correo/), { target: { value: 'acme.test' } })
        fireEvent.change(screen.getByLabelText(/Llave API/), { target: { value: 'sk_live_abc' } })
        expect((screen.getByLabelText(/Llave API/) as HTMLInputElement).type).toBe('password')
        fireEvent.click(screen.getByText('Guardar y continuar'))
        await waitFor(() => expect(client.runStep).toHaveBeenCalled())
        const [key, input] = client.runStep.mock.calls[0]
        expect(key).toBe('domain')
        expect(input.values).toMatchObject({ domain: 'acme.test', api_key: 'sk_live_abc', mode: 'managed' })
    })

    it('a stored write_only secret counts as filled and is not sent when empty', async () => {
        const client = makeClient({ steps: [st('domain', 'pending', { values: { domain: 'acme.test' }, stored_keys: ['api_key'] })] })
        render(<SetupFlow flow={flow} client={client} />)
        fireEvent.click(await screen.findByText('Guardar y continuar'))
        await waitFor(() => expect(client.runStep).toHaveBeenCalled())
        const values = client.runStep.mock.calls[0][1].values
        expect(values.domain).toBe('acme.test')
        expect('api_key' in values).toBe(false)
        expect((screen.getByLabelText(/Llave API/) as HTMLInputElement).placeholder).toBe('••••••••')
    })

    it('visible_when hides a field until its predicate holds', async () => {
        const client = makeClient({ steps: [st('domain', 'pending')] })
        render(<SetupFlow flow={flow} client={client} />)
        await screen.findByText('Guardar y continuar')
        expect(screen.queryByLabelText('Servidor relay')).toBeNull()
    })

    it('autosaves a draft (debounced) and shows the saved state', async () => {
        const saveStep = vi.fn().mockResolvedValue(undefined)
        const client = makeClient({ steps: [st('domain', 'pending')] }, { saveStep })
        render(<SetupFlow flow={flow} client={client} />)
        const input = await screen.findByLabelText(/Dominio de correo/)
        vi.useFakeTimers()
        fireEvent.change(input, { target: { value: 'acme.test' } })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(900)
        })
        expect(saveStep).toHaveBeenCalledWith('domain', { domain: 'acme.test' })
        expect(screen.getByText('Guardado automáticamente')).toBeTruthy()
    })

    it('autosave failure is visible', async () => {
        const saveStep = vi.fn().mockRejectedValue(new Error('x'))
        const client = makeClient({ steps: [st('domain', 'pending')] }, { saveStep })
        render(<SetupFlow flow={flow} client={client} />)
        const input = await screen.findByLabelText(/Dominio de correo/)
        vi.useFakeTimers()
        fireEvent.change(input, { target: { value: 'a' } })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(900)
        })
        expect(screen.getByText('No se pudo guardar automáticamente.')).toBeTruthy()
    })

    it('form_layout mode=steps reuses the wizard chrome with Next/Back', async () => {
        const steppedFlow: SetupFlowDef = {
            key: 'f',
            steps: [
                {
                    key: 'form',
                    kind: 'form',
                    title: 'Datos',
                    form_layout: { mode: 'steps', sections: [{ key: 's1', title: 'Cuenta' }, { key: 's2', title: 'Avanzado' }] },
                    fields: [
                        { key: 'a', label: 'Campo A', section: 's1' },
                        { key: 'b', label: 'Campo B', section: 's2' },
                    ],
                },
            ],
        }
        const client = makeClient({ steps: [st('form', 'pending')] })
        render(<SetupFlow flow={steppedFlow} client={client} />)
        expect(await screen.findByLabelText('Campo A')).toBeTruthy()
        expect(screen.queryByLabelText('Campo B')).toBeNull()
        fireEvent.click(screen.getByText('Siguiente'))
        expect(await screen.findByLabelText('Campo B')).toBeTruthy()
        fireEvent.click(screen.getByText('Atrás'))
        expect(await screen.findByLabelText('Campo A')).toBeTruthy()
    })
})
