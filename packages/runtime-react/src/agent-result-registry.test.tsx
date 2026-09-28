import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
    AgentResultView,
    clearAgentResultRenderers,
    listAgentResultRenderers,
    registerAgentResultRenderer,
    resolveAgentResultRenderer,
    type AgentResultRendererProps,
} from './agent-result-registry'

const Generic = ({ result }: AgentResultRendererProps) => <span>generic:{String(result.title)}</span>
const Invoice = ({ result }: AgentResultRendererProps) => <span>invoice:{String(result.title)}</span>

afterEach(() => clearAgentResultRenderers())

describe('agent result registry', () => {
    it('renders a result through the renderer of its kind', () => {
        registerAgentResultRenderer('record', Generic)
        const html = renderToStaticMarkup(
            <AgentResultView result={{ kind: 'record', model: 'products', title: 'Llanta' }} />,
        )
        expect(html).toBe('<span>generic:Llanta</span>')
    })

    it('prefers a model-specific renderer over the generic one', () => {
        registerAgentResultRenderer('record', Generic)
        registerAgentResultRenderer('record', Invoice, { model: 'invoices' })
        expect(resolveAgentResultRenderer({ kind: 'record', model: 'invoices' })).toBe(Invoice)
        expect(resolveAgentResultRenderer({ kind: 'record', model: 'products' })).toBe(Generic)
    })

    it('renders nothing (never the raw payload) for an unknown kind', () => {
        const html = renderToStaticMarkup(
            <AgentResultView result={{ kind: 'mystery', secret: 'Model: warehouses' }} />,
        )
        expect(html).toBe('')
        expect(
            renderToStaticMarkup(
                <AgentResultView result={{ kind: 'mystery' }} fallback={<i>sin vista</i>} />,
            ),
        ).toBe('<i>sin vista</i>')
    })

    it('unregister only removes its own registration', () => {
        const off = registerAgentResultRenderer('count', Generic)
        registerAgentResultRenderer('count', Invoice)
        off()
        expect(resolveAgentResultRenderer({ kind: 'count' })).toBe(Invoice)
        expect(listAgentResultRenderers()).toEqual(['count'])
    })
})
