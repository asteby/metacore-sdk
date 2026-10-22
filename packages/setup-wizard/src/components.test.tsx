// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DnsRecordRow } from './dns-record-row'
import { DomainSetupWizard, type DomainRecordSpec, type RecordCheck } from './domain-setup-wizard'
import { LiveStatusBadge } from './live-status-badge'
import { SetupWizardProvider } from './i18n'
import { StepWizard } from './step-wizard'
import { createLocalWizardPersistence } from './wizard-state'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('LiveStatusBadge', () => {
  it('localizes and exposes status', () => {
    render(
      <SetupWizardProvider locale="en">
        <LiveStatusBadge status="wrong_value" />
      </SetupWizardProvider>,
    )
    expect(screen.getByRole('status').textContent).toBe('Different value')
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('wrong_value')
  })
})

describe('DnsRecordRow', () => {
  const rec = { type: 'TXT', name: '_dmarc.acme.com', value: 'v=DMARC1; p=none' }
  it('shows type/name/value, copies and shows diagnostic with found value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ul><DnsRecordRow record={rec} status="wrong_value" found="v=DMARC1; p=reject" diagnostic="El valor no coincide" purpose="DMARC" /></ul>)
    expect(screen.getByText('TXT')).toBeTruthy()
    expect(screen.getByText('El valor no coincide')).toBeTruthy()
    expect(screen.getByText('v=DMARC1; p=reject')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Valor' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('v=DMARC1; p=none'))
    expect(await screen.findByText('Copiado')).toBeTruthy()
  })
  it('reports copy failure instead of lying', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true })
    render(<ul><DnsRecordRow record={rec} status="missing" /></ul>)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Nombre' }))
    expect(await screen.findByText('No se pudo copiar')).toBeTruthy()
  })
})

describe('StepWizard', () => {
  it('runs a step, advances, and shows error diagnostics with retry', async () => {
    let calls = 0
    const onComplete = vi.fn()
    render(
      <StepWizard
        onComplete={onComplete}
        steps={[
          { id: 'a', title: 'Conectar', run: async () => (++calls === 1 ? { status: 'error', diagnostic: 'Token inválido' } : { status: 'ok' }) },
          { id: 'b', title: 'Listo' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Token inválido')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Listo' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  })
  it('thrown errors become diagnostics', async () => {
    render(<StepWizard steps={[{ id: 'a', title: 'X', run: async () => { throw new Error('boom') } }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
  })
  it('polls pending results until ok and stops', async () => {
    const run = vi.fn().mockResolvedValueOnce({ status: 'pending', diagnostic: 'propagando' }).mockResolvedValueOnce({ status: 'pending' }).mockResolvedValue({ status: 'ok' })
    render(<StepWizard steps={[{ id: 'a', title: 'Verificar', run, poll: { interval: 5, maxAttempts: 10 } }, { id: 'b', title: 'Fin' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Fin' })).toBeTruthy())
    expect(run).toHaveBeenCalledTimes(3)
  })
  it('gives up after maxAttempts with the exhausted message', async () => {
    render(<StepWizard steps={[{ id: 'a', title: 'V', run: async () => ({ status: 'pending' as const }), poll: { interval: 1, maxAttempts: 2, exhaustedMessage: 'Se agotó el tiempo' } }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Se agotó el tiempo')
  })
  it('resumes from persisted progress and auto-runs the current step', async () => {
    const persistence = createLocalWizardPersistence('t:')
    persistence.save('k', { current: 1, steps: { a: { status: 'ok', attempts: 0 }, b: { status: 'running', attempts: 3 } } })
    const runB = vi.fn().mockResolvedValue({ status: 'ok' })
    render(<StepWizard persistKey="k" persistence={persistence} steps={[{ id: 'a', title: 'Uno', run: vi.fn() }, { id: 'b', title: 'Dos', autoRun: true, run: runB }]} />)
    await waitFor(() => expect(runB).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('heading', { name: 'Dos' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')[0]!.textContent).toContain('Completado')
  })
})

describe('DomainSetupWizard', () => {
  const records: DomainRecordSpec[] = [
    { id: 'mx', type: 'MX', name: 'acme.com', value: 'mail.asteby.com', priority: 10, purpose: 'MX' },
    { id: 'spf', type: 'TXT', name: 'acme.com', value: 'v=spf1 -all', purpose: 'SPF' },
    { id: 'bimi', type: 'TXT', name: 'default._bimi.acme.com', value: 'v=BIMI1', purpose: 'BIMI', required: false },
  ]
  it('verifies live per record until all required are ok, then completes', async () => {
    const answers: Array<Record<string, RecordCheck>> = [
      { mx: { status: 'ok' }, spf: { status: 'missing', diagnostic: 'No hay registro TXT' } },
      { mx: { status: 'ok' }, spf: { status: 'propagating' } },
      { mx: { status: 'ok' }, spf: { status: 'ok' } },
    ]
    let i = 0
    const checkRecords = vi.fn(async () => answers[Math.min(i++, 2)]!)
    const onComplete = vi.fn()
    render(<DomainSetupWizard domain="acme.com" records={records} checkRecords={checkRecords} pollInterval={5} onComplete={onComplete} />)
    expect(await screen.findByText('No hay registro TXT')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dominio verificado' })).toBeTruthy())
    expect(checkRecords).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })
  it('applies an automatic method before verifying and surfaces its failure', async () => {
    const onApply = vi.fn().mockRejectedValueOnce(new Error('Token sin permiso DNS:Edit')).mockResolvedValue(undefined)
    const checkRecords = vi.fn(async () => ({ mx: { status: 'ok' as const }, spf: { status: 'ok' as const } }))
    render(<DomainSetupWizard domain="acme.com" records={records} checkRecords={checkRecords} pollInterval={5} methods={[{ id: 'cf', title: 'Cloudflare', onApply }]} />)
    fireEvent.click(screen.getByLabelText(/Cloudflare/))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Token sin permiso DNS:Edit')
    expect(checkRecords).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dominio verificado' })).toBeTruthy())
    expect(onApply).toHaveBeenCalledTimes(2)
  })
})
