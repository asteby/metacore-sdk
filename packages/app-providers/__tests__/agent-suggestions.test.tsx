import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_SUGGESTIONS,
  resolveAgentSuggestions,
  useAgentSuggestions,
} from '../src/agent-suggestions'
import { FALLBACK_BRANDING } from '../src/platform-config-provider'

describe('resolveAgentSuggestions', () => {
  it('uses the branding list, trimmed, without blanks or non-strings', () => {
    const got = resolveAgentSuggestions({
      agent_suggestions: ['  Buscar un hallazgo ', '', '   ', 3 as unknown as string, 'Resumen de hoy'],
    })
    expect(got).toEqual(['Buscar un hallazgo', 'Resumen de hoy'])
  })

  it('falls back to the neutral defaults when absent, empty or unusable', () => {
    expect(resolveAgentSuggestions(undefined)).toEqual([...DEFAULT_AGENT_SUGGESTIONS])
    expect(resolveAgentSuggestions({})).toEqual([...DEFAULT_AGENT_SUGGESTIONS])
    expect(resolveAgentSuggestions({ agent_suggestions: [] })).toEqual([...DEFAULT_AGENT_SUGGESTIONS])
    expect(resolveAgentSuggestions({ agent_suggestions: [' '] })).toEqual([...DEFAULT_AGENT_SUGGESTIONS])
  })

  it('accepts a vertical-specific fallback and returns a copy', () => {
    const fb = ['A', 'B'] as const
    const got = resolveAgentSuggestions({}, fb)
    expect(got).toEqual(['A', 'B'])
    expect(got).not.toBe(fb)
  })

  it('FALLBACK_BRANDING carries no suggestions', () => {
    expect(FALLBACK_BRANDING.agent_suggestions).toBeUndefined()
  })
})

describe('useAgentSuggestions', () => {
  it('returns the defaults outside a provider', () => {
    let out: string[] = []
    function Probe() {
      out = useAgentSuggestions()
      return null
    }
    renderToStaticMarkup(createElement(Probe))
    expect(out).toEqual([...DEFAULT_AGENT_SUGGESTIONS])
  })
})
