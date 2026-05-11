// Wasm-client SRI smoke tests — lives in runtime-react because the SDK
// package does not (yet) carry a vitest setup of its own. We import the
// helper through the workspace specifier so the test exercises the same
// public boundary downstream apps see.
//
// The SRI logic is decoupled from WebAssembly instantiation by design, so
// these tests run in plain Node without needing a real `.wasm` module.

import { describe, it, expect } from 'vitest'
import {
    verifyIntegrity,
    WasmIntegrityError,
} from '@asteby/metacore-sdk'

function bytes(input: string): Uint8Array {
    return new TextEncoder().encode(input)
}

async function digestB64(algo: 'SHA-256' | 'SHA-384' | 'SHA-512', input: string) {
    const buf = await crypto.subtle.digest(algo, bytes(input))
    const view = new Uint8Array(buf)
    let bin = ''
    for (let i = 0; i < view.byteLength; i++) bin += String.fromCharCode(view[i]!)
    return btoa(bin)
}

describe('verifyIntegrity', () => {
    it('accepts a matching sha384 digest', async () => {
        const payload = 'hello, metacore wasm world'
        const hash = await digestB64('SHA-384', payload)
        await expect(
            verifyIntegrity(bytes(payload), `sha384-${hash}`),
        ).resolves.toBeUndefined()
    })

    it('accepts a matching sha256 digest', async () => {
        const payload = '{"hello":"world"}'
        const hash = await digestB64('SHA-256', payload)
        await expect(
            verifyIntegrity(bytes(payload), `sha256-${hash}`),
        ).resolves.toBeUndefined()
    })

    it('throws WasmIntegrityError on digest mismatch', async () => {
        const payload = 'hello'
        const wrong = await digestB64('SHA-384', 'tampered')
        await expect(
            verifyIntegrity(bytes(payload), `sha384-${wrong}`),
        ).rejects.toBeInstanceOf(WasmIntegrityError)
    })

    it('passes when ANY space-separated token matches', async () => {
        const payload = 'multi-hash'
        const bad = await digestB64('SHA-384', 'other')
        const good = await digestB64('SHA-256', payload)
        await expect(
            verifyIntegrity(bytes(payload), `sha384-${bad} sha256-${good}`),
        ).resolves.toBeUndefined()
    })

    it('is a no-op when integrity is the empty string', async () => {
        await expect(verifyIntegrity(bytes('anything'), '')).resolves.toBeUndefined()
    })

    it('rejects malformed integrity tokens', async () => {
        await expect(
            verifyIntegrity(bytes('x'), 'this-has-no-algo'),
        ).rejects.toBeInstanceOf(WasmIntegrityError)
    })

    it('rejects unsupported algorithms', async () => {
        await expect(
            verifyIntegrity(bytes('x'), 'md5-deadbeef'),
        ).rejects.toBeInstanceOf(WasmIntegrityError)
    })

    it('handles length-mismatched digests as a clean mismatch', async () => {
        await expect(
            verifyIntegrity(bytes('x'), 'sha256-short'),
        ).rejects.toBeInstanceOf(WasmIntegrityError)
    })
})
