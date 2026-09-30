// @vitest-environment happy-dom
//
// Mandatory reason (PER-4): the request is tried bare; a 422 errors.reason makes
// the hook ask once and retry with the reason; cancel = nothing ran.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, opts?: { defaultValue?: string; min?: number }) =>
            (opts?.defaultValue ?? k).replace('{{min}}', String(opts?.min ?? '')),
    }),
}))

import { reasonRequiredInfo, useReasonPrompt } from '../reason-prompt'

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

const refusal = (code: 'required' | 'min', min?: number) => ({
    response: { status: 422, data: { success: false, errors: { reason: [{ code, params: min ? { min } : undefined }] } } },
})

describe('reasonRequiredInfo', () => {
    it('reads required and min refusals', () => {
        expect(reasonRequiredInfo(refusal('required'))).toEqual({ min: 3, tooShort: false })
        expect(reasonRequiredInfo(refusal('min', 8))).toEqual({ min: 8, tooShort: true })
    })
    it('ignores every other error', () => {
        expect(reasonRequiredInfo(new Error('boom'))).toBeNull()
        expect(reasonRequiredInfo({ response: { data: { errors: { name: [{ code: 'required' }] } } } })).toBeNull()
        expect(reasonRequiredInfo({ response: { data: { errors: { reason: [{ code: 'other' }] } } } })).toBeNull()
        expect(reasonRequiredInfo(undefined)).toBeNull()
    })
})

let result: unknown = 'unset'
function Probe({ request }: { request: (r?: string) => Promise<string> }) {
    const { run, dialog } = useReasonPrompt()
    return (
        <>
            <button onClick={async () => { result = await run({ title: 'Eliminar', request }) }}>go</button>
            {dialog}
        </>
    )
}

describe('useReasonPrompt', () => {
    it('does not prompt when the server needs no reason', async () => {
        result = 'unset'
        const request = vi.fn().mockResolvedValue('ok')
        render(<Probe request={request} />)
        fireEvent.click(screen.getByText('go'))
        await waitFor(() => expect(result).toBe('ok'))
        expect(request).toHaveBeenCalledTimes(1)
        expect(request).toHaveBeenCalledWith(undefined)
        expect(screen.queryByLabelText('Motivo')).toBeNull()
    })

    it('asks once on a required refusal and retries with the trimmed reason', async () => {
        result = 'unset'
        const request = vi.fn().mockRejectedValueOnce(refusal('required')).mockResolvedValueOnce('done')
        render(<Probe request={request} />)
        fireEvent.click(screen.getByText('go'))
        const box = await screen.findByLabelText('Motivo')
        const confirm = screen.getByText('Continuar').closest('button') as HTMLButtonElement
        expect(confirm.disabled).toBe(true)
        fireEvent.change(box, { target: { value: '  captura duplicada  ' } })
        expect(confirm.disabled).toBe(false)
        fireEvent.click(confirm)
        await waitFor(() => expect(result).toBe('done'))
        expect(request).toHaveBeenNthCalledWith(2, 'captura duplicada')
    })

    it('stays open with the inline hint when the server wants a longer reason', async () => {
        result = 'unset'
        const request = vi
            .fn()
            .mockRejectedValueOnce(refusal('required'))
            .mockRejectedValueOnce(refusal('min', 10))
            .mockResolvedValueOnce('done')
        render(<Probe request={request} />)
        fireEvent.click(screen.getByText('go'))
        fireEvent.change(await screen.findByLabelText('Motivo'), { target: { value: 'abc' } })
        fireEvent.click(screen.getByText('Continuar'))
        await screen.findByText('Escribe al menos 10 caracteres.')
        fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'un motivo bastante largo' } })
        fireEvent.click(screen.getByText('Continuar'))
        await waitFor(() => expect(result).toBe('done'))
    })

    it('resolves undefined when the operator cancels', async () => {
        result = 'unset'
        const request = vi.fn().mockRejectedValueOnce(refusal('required'))
        render(<Probe request={request} />)
        fireEvent.click(screen.getByText('go'))
        await screen.findByLabelText('Motivo')
        fireEvent.click(screen.getByText('Cancelar'))
        await waitFor(() => expect(result).toBeUndefined())
        expect(request).toHaveBeenCalledTimes(1)
    })

    it('rethrows a non-reason error', async () => {
        const request = vi.fn().mockRejectedValue(new Error('network'))
        let caught: unknown
        function P2() {
            const { run, dialog } = useReasonPrompt()
            return (
                <>
                    <button onClick={() => run({ title: 'x', request }).catch((e) => { caught = e })}>go</button>
                    {dialog}
                </>
            )
        }
        render(<P2 />)
        fireEvent.click(screen.getByText('go'))
        await waitFor(() => expect((caught as Error)?.message).toBe('network'))
    })
})
