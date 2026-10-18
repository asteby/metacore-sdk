import { afterEach, describe, expect, it } from 'vitest'
import { storageKey } from '../host'
import { abyGuidance } from './aby-guidance'

describe('ops:aby-guide-stopped', () => {
  afterEach(() => sessionStorage.clear())

  function listen() {
    const events: Array<{ guideId: string; stepIndex: number }> = []
    const on = (e: Event) => events.push((e as CustomEvent).detail)
    window.addEventListener('ops:aby-guide-stopped', on)
    return { events, off: () => window.removeEventListener('ops:aby-guide-stopped', on) }
  }

  it('se emite al descartar una guía en curso, con guía y paso', () => {
    sessionStorage.setItem(
      storageKey('aby-guidance:pending'),
      JSON.stringify({ guideId: 'help.pos.first_sale', stepIndex: 2 })
    )
    const { events, off } = listen()
    abyGuidance.stopGuide()
    off()
    expect(events).toEqual([{ guideId: 'help.pos.first_sale', stepIndex: 2 }])
  })

  it('no se emite si no hay guía en curso', () => {
    const { events, off } = listen()
    abyGuidance.stopGuide()
    off()
    expect(events).toHaveLength(0)
  })
})
