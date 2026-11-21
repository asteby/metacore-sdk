// @vitest-environment happy-dom
//
// El índice principal exporta envoltorios perezosos de la UI de Loom: sin injertos no se
// pinta nada (ni baja el chunk); con injertos se monta la implementación real.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { clearLoom, ProposalReview, registerGraft, Seam, type ProposalQueue, type SeamContract } from '../loom/public'

afterEach(() => {
    cleanup()
    clearLoom()
})

const contract: SeamContract = { id: 'demo.seam', version: '1.0.0', lenses: {} }
const emptyQueue: ProposalQueue = { pending: [], applied: null, push: () => {}, accept: () => {}, discard: () => {}, undo: () => {} }

describe('Loom perezoso (índice principal)', () => {
    it('sin injertos no renderiza nada', () => {
        const { container } = render(<Seam contract={contract} lenses={{}} />)
        expect(container.innerHTML).toBe('')
    })

    it('con un injerto monta la implementación real', { timeout: 20000 }, async () => {
        registerGraft({ id: 'demo.g', seam: 'demo.seam', component: () => <span>hola injerto</span> })
        render(<Seam contract={contract} lenses={{}} />)
        expect(await screen.findByText('hola injerto', undefined, { timeout: 15000 })).toBeTruthy()
        expect(document.querySelector('[data-loom-seam="demo.seam"]')).toBeTruthy()
    })

    it('ProposalReview vacío no carga nada', () => {
        const { container } = render(<ProposalReview queue={emptyQueue} values={{}} />)
        expect(container.innerHTML).toBe('')
    })
})
