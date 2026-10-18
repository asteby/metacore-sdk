// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { DataloadLauncher } from './dataload-launcher'
import { MediaBackupPanel } from './media-backup-panel'
import { DATALOAD_MESSAGES_EN_US, DATALOAD_MESSAGES_ES_MX } from './messages'
import { media, plan, run } from './fixtures'
import { fakeApi, wrap } from './test-utils'

afterEach(cleanup)

const pick = (label: RegExp, name: string, content: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement
  const f = new File([content], name, { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [f] } })
}

describe('DataloadLauncher', () => {
  it('walks pick -> dry-run -> diff -> apply -> finished', async () => {
    const api = fakeApi()
    const onFinished = vi.fn()
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<DataloadLauncher api={api} notify={notify} onFinished={onFinished} />)

    const dryBtn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    expect(dryBtn.disabled).toBe(true)

    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Perfil'), { target: { value: 'catalogo' } })
    pick(/Archivo/, 'catalogo.csv', 'sku,name\nSKU-1,Uno')
    await waitFor(() => expect(dryBtn.disabled).toBe(false))

    fireEvent.click(dryBtn)
    await waitFor(() => expect(api.dryRun).toHaveBeenCalled())
    expect(api.dryRun).toHaveBeenCalledWith({ profile: 'catalogo', source: { format: 'csv', name: 'catalogo.csv', content: 'sku,name\nSKU-1,Uno' } })

    // Default filter shows only the rows with changes; the field diff is visible.
    await screen.findByText('SKU-2')
    expect(screen.getByText('SKU-1')).toBeTruthy()
    expect(screen.queryByText('SKU-3')).toBeNull()
    expect(screen.getByText('DOS')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inválidas' }))
    expect(screen.getByText(/no es un número/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/No aplicar nada si alguna fila es inválida/))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar carga' }))
    await waitFor(() => expect(api.execute).toHaveBeenCalled())
    expect(api.execute).toHaveBeenCalledWith(expect.objectContaining({ profile: 'catalogo', force: false, failOnInvalid: true }))

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1))
    expect(onFinished.mock.calls[0]?.[0].state).toBe('succeeded')
    expect(screen.getByRole('progressbar', { name: 'Avance de la carga' })).toBeTruthy()
    expect(notify.success).toHaveBeenCalledWith('Carga iniciada')
  })

  it('rejects unsupported files without calling the API', async () => {
    const api = fakeApi()
    wrap(<DataloadLauncher api={api} showMedia={false} showHistory={false} />)
    pick(/Archivo/, 'catalogo.xlsx', 'x')
    await screen.findByText(/Formato no soportado/)
    expect(api.dryRun).not.toHaveBeenCalled()
  })

  it('shows the dry-run error from the server', async () => {
    const api = fakeApi({ dryRun: vi.fn(async () => { throw { response: { data: { message: 'perfil inválido' } } } }) })
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<DataloadLauncher api={api} notify={notify} defaultProfile='catalogo' showMedia={false} showHistory={false} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    pick(/Archivo/, 'a.csv', 'sku\n1')
    const btn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await screen.findByText('perfil inválido', { selector: 'p' })
    expect(notify.error).toHaveBeenCalledWith('perfil inválido')
  })

  it('does not offer to apply a plan without valid rows', async () => {
    const api = fakeApi({ dryRun: vi.fn(async () => ({ plan: { ...plan, counts: { invalid: 2 }, rows: [] }, run: run({ mode: 'dry_run' }) })) })
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' showMedia={false} showHistory={false} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    pick(/Archivo/, 'a.csv', 'sku\n1')
    const btn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await screen.findByText('No hay filas válidas para aplicar.')
    expect((screen.getByRole('button', { name: 'Aplicar carga' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

async function toPlan(api: ReturnType<typeof fakeApi>, label = 'Simular carga', fileLabel = /Archivo/) {
  await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
  pick(fileLabel, 'a.csv', 'sku\n1')
  const btn = screen.getByRole('button', { name: label }) as HTMLButtonElement
  await waitFor(() => expect(btn.disabled).toBe(false))
  fireEvent.click(btn)
  await waitFor(() => expect(api.dryRun).toHaveBeenCalled())
}

describe('DataloadLauncher: review rows, permissions, i18n, big files', () => {
  it('shows rows held for review with their reason and outcome', async () => {
    const api = fakeApi()
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' showMedia={false} showHistory={false} showReviews={false} />)
    await toPlan(api)
    await screen.findByText('1 filas esperan una decisión y no se cargarán solas.')
    fireEvent.click(screen.getByRole('button', { name: 'Por revisar' }))
    expect(screen.getByText('value_suspect')).toBeTruthy()
    expect(screen.getByText('Se actualizaría')).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Fila 5' })).toBeTruthy()
  })

  it('lets a person without launch simulate but not apply, and hides cancel', async () => {
    const api = fakeApi({ run: vi.fn(async () => run({ state: 'running' })) })
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' capabilities={{}} showMedia={false} showHistory={false} showReviews={false} />)
    await toPlan(api)
    await screen.findByText('Puedes simular, pero no tienes permiso para aplicar cargas.')
    const apply = screen.getByRole('button', { name: 'Aplicar carga' }) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    expect(apply.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.queryByLabelText(/No aplicar nada/)).toBeNull()
  })

  it('offers cancel only with the cancel capability', async () => {
    const api = fakeApi({ run: vi.fn(async () => run({ state: 'running' })) })
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' capabilities={{ launch: true }} showMedia={false} showHistory={false} showReviews={false} />)
    await toPlan(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar carga' }))
    await screen.findByRole('progressbar', { name: 'Avance de la carga' })
    expect(screen.queryByRole('button', { name: /Cancelar carga/ })).toBeNull()
  })

  it('renders in en-US with no Spanish text left', async () => {
    const api = fakeApi()
    const { container } = wrap(<DataloadLauncher api={api} locale='en-US' defaultProfile='catalogo' />)
    await toPlan(api, 'Simulate load', /File/)
    await screen.findByText('With changes')
    await screen.findByText('Image backup')
    const text = container.textContent ?? ''
    const spanishOnly = Object.entries(DATALOAD_MESSAGES_ES_MX)
      .filter(([k, v]) => v.length > 3 && !v.includes('{{') && DATALOAD_MESSAGES_EN_US[k as keyof typeof DATALOAD_MESSAGES_EN_US] !== v)
      .map(([, v]) => v)
    expect(spanishOnly.filter((v) => text.includes(v))).toEqual([])
    expect(screen.getByRole('button', { name: 'Apply load' })).toBeTruthy()
  })

  it('uploads files above the inline limit in parts and dry-runs by upload id', async () => {
    const api = fakeApi()
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' maxFileBytes={4} chunkedUpload={{ upload: { chunkSize: 4, hashParts: false } }} showMedia={false} showHistory={false} showReviews={false} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    pick(/Archivo/, 'big.csv', 'sku,name\nSKU-1,Uno')
    await screen.findByText('Archivo subido: big.csv')
    expect(api.uploadPart).toHaveBeenCalledTimes(5)
    expect(api.completeUpload).toHaveBeenCalledWith('up1')
    const btn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await waitFor(() => expect(api.dryRun).toHaveBeenCalledWith({ profile: 'catalogo', source: { format: 'csv', name: 'big.csv', uploadId: 'up1' } }))
  })

  it('retries an interrupted upload from where it stopped', async () => {
    let fail = true
    const api = fakeApi({
      uploadPart: vi.fn(async () => {
        if (fail) {
          fail = false
          throw { response: { status: 400 } }
        }
      }),
    })
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' maxFileBytes={4} chunkedUpload={{ upload: { chunkSize: 4, hashParts: false } }} showMedia={false} showHistory={false} showReviews={false} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    pick(/Archivo/, 'big.csv', 'abcdefgh')
    await screen.findByText(/La subida se interrumpió/)
    fireEvent.click(screen.getByRole('button', { name: /Reintentar subida/ }))
    await screen.findByText('Archivo subido: big.csv')
    expect(api.upload).toHaveBeenCalledWith('up1')
  })
})

describe('MediaBackupPanel', () => {
  it('hides verify and retry without those capabilities', async () => {
    const api = fakeApi()
    wrap(<MediaBackupPanel api={api} watch={false} capabilities={{ launch: true }} />)
    await screen.findByText('Requiere atención')
    expect(screen.queryByRole('button', { name: /Verificar respaldo/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reintentar fallidas/ })).toBeNull()
  })

  it('shows integrity, dead jobs, and verifies / retries', async () => {
    const api = fakeApi()
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<MediaBackupPanel api={api} notify={notify} watch={false} />)
    await screen.findByText('Requiere atención')
    expect(screen.getByText('3.0 MB')).toBeTruthy()
    expect(screen.getByText('https://origen.test/a.jpg')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Verificar respaldo/ }))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Respaldo verificado: 5 de 5 íntegros.'))

    fireEvent.click(screen.getByRole('button', { name: /Reintentar fallidas/ }))
    await waitFor(() => expect(api.mediaRetry).toHaveBeenCalledWith(undefined))
    expect(notify.success).toHaveBeenCalledWith('1 imágenes vuelven a la cola.')
  })

  it('reports a failed verification', async () => {
    const entry = { ...media.dead[0]! } as never
    const api = fakeApi({ mediaVerify: vi.fn(async () => ({ checked: 5, ok: 4, missing: [], corrupt: [entry] })) })
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<MediaBackupPanel api={api} notify={notify} watch={false} />)
    await screen.findByText('Requiere atención')
    fireEvent.click(screen.getByRole('button', { name: /Verificar respaldo/ }))
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Verificación: 1 con problemas de 5.'))
  })
})
