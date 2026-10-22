// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const lang = { current: 'es' }
vi.mock('react-i18next', () => {
    const t = (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k
    return { useTranslation: () => ({ t, i18n: { language: lang.current, exists: () => true } }) }
})

import { StepStatusBadge } from '../setup/step-status-badge'
import { RecordsTable, copyText } from '../setup/records-table'
import { HealthCard } from '../setup/health-card'

afterEach(() => {
    cleanup()
    lang.current = 'es'
    vi.restoreAllMocks()
})

describe('StepStatusBadge', () => {
    it.each([
        ['pending', 'Pendiente'],
        ['running', 'En curso'],
        ['ok', 'Listo'],
        ['warn', 'Con avisos'],
        ['error', 'Con error'],
        ['blocked', 'Bloqueado'],
    ] as const)('%s renders a text label (not colour alone)', (status, text) => {
        render(<StepStatusBadge status={status} />)
        expect(screen.getByText(text)).toBeTruthy()
    })
    it('speaks English when the language is en', () => {
        lang.current = 'en-US'
        render(<StepStatusBadge status='blocked' />)
        expect(screen.getByText('Blocked')).toBeTruthy()
    })
    it('compact keeps the label for screen readers only', () => {
        render(<StepStatusBadge status='ok' compact />)
        expect(screen.getByText('Listo').className).toContain('sr-only')
    })
})

describe('copyText', () => {
    it('uses the Clipboard API when available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        expect(await copyText('abc')).toBe(true)
        expect(writeText).toHaveBeenCalledWith('abc')
    })
    it('falls back to execCommand when the Clipboard API rejects', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
        const exec = vi.fn().mockReturnValue(true)
        ;(document as any).execCommand = exec
        expect(await copyText('abc')).toBe(true)
        expect(exec).toHaveBeenCalledWith('copy')
        expect(document.querySelector('textarea')).toBeNull() // cleaned up
    })
    it('reports failure when nothing works', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
        ;(document as any).execCommand = vi.fn().mockReturnValue(false)
        expect(await copyText('abc')).toBe(false)
    })
})

describe('RecordsTable', () => {
    const records = [
        { type: 'TXT', name: '_dmarc.acme.test', value: 'v=DMARC1; p=none', status: 'ok' as const },
        { type: 'MX', name: 'acme.test', value: 'mx.acme.test', status: 'wrong_value' as const, found: 'old.mx.test', diagnostic: { message: 'El MX apunta a otro servidor', fix: { label: 'Corregir', action: 'apply_dns' } } },
        { type: 'TXT', name: 'acme.test', value: 'v=spf1 -all', status: 'propagating' as const, diagnostic: 'Puede tardar unos minutos' },
    ]
    it('shows type, name, value, status and diagnostics per row', () => {
        render(<RecordsTable records={records} caption='DNS' />)
        expect(screen.getByRole('table')).toBeTruthy()
        expect(screen.getByText('_dmarc.acme.test')).toBeTruthy()
        expect(screen.getByText('Correcto')).toBeTruthy()
        expect(screen.getByText('Valor distinto')).toBeTruthy()
        expect(screen.getByText('Propagando')).toBeTruthy()
        expect(screen.getByText('Encontrado: old.mx.test')).toBeTruthy()
        expect(screen.getByText('El MX apunta a otro servidor')).toBeTruthy()
        expect(screen.getByText('Puede tardar unos minutos')).toBeTruthy()
    })
    it('copies a value and confirms it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        render(<RecordsTable records={records} />)
        fireEvent.click(screen.getAllByLabelText('Copiar valor')[0])
        await waitFor(() => expect(screen.getByText('Copiado')).toBeTruthy())
        expect(writeText).toHaveBeenCalledWith('v=DMARC1; p=none')
    })
    it('tells the person when copy fails', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
        ;(document as any).execCommand = vi.fn().mockReturnValue(false)
        render(<RecordsTable records={records} />)
        fireEvent.click(screen.getAllByLabelText('Copiar nombre')[0])
        await waitFor(() => expect(screen.getByText(/No se pudo copiar/)).toBeTruthy())
    })
    it('row fix calls onFix with the fix and the record', () => {
        const onFix = vi.fn()
        render(<RecordsTable records={records} onFix={onFix} />)
        fireEvent.click(screen.getByText('Corregir'))
        expect(onFix).toHaveBeenCalledWith({ label: 'Corregir', action: 'apply_dns' }, records[1])
    })
    it('empty list shows a message and recheck fires', () => {
        const onRecheck = vi.fn()
        const { rerender } = render(<RecordsTable records={[]} />)
        expect(screen.getByText('No hay registros por mostrar.')).toBeTruthy()
        rerender(<RecordsTable records={records} onRecheck={onRecheck} />)
        fireEvent.click(screen.getByText('Verificar ahora'))
        expect(onRecheck).toHaveBeenCalled()
    })
})

describe('HealthCard', () => {
    it('renders status, metrics with tone and issues with fix', () => {
        const onFix = vi.fn()
        const onContinue = vi.fn()
        render(
            <HealthCard
                title='Correo'
                status='warn'
                summary='Falta un registro'
                progress={{ done: 2, total: 4 }}
                metrics={[
                    { key: 'q', label: 'En cola', value: 12, tone: 'warn' },
                    { key: 's', label: 'Entregados', value: '98', unit: '%', tone: 'good' },
                ]}
                issues={[{ severity: 'error', message: 'DKIM no publicado', fix: { label: 'Ver registros', step: 'dns' } }]}
                onFix={onFix}
                onContinue={onContinue}
            />,
        )
        expect(screen.getByText('Requiere atención')).toBeTruthy()
        expect(screen.getByText('2 de 4 pasos')).toBeTruthy()
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50')
        expect(screen.getByText('12').closest('[data-metric-tone]')?.getAttribute('data-metric-tone')).toBe('warn')
        fireEvent.click(screen.getByText('Ver registros'))
        expect(onFix).toHaveBeenCalledWith({ label: 'Ver registros', step: 'dns' }, expect.objectContaining({ message: 'DKIM no publicado' }))
        fireEvent.click(screen.getByText('Continuar configuración'))
        expect(onContinue).toHaveBeenCalled()
    })
    it('says there are no issues when the list is empty and unknown status degrades', () => {
        render(<HealthCard status={'weird' as any} issues={[]} />)
        expect(screen.getByText('Sin datos')).toBeTruthy()
        expect(screen.getByText('Sin avisos.')).toBeTruthy()
    })
})
