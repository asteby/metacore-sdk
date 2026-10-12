import { describe, expect, it } from 'vitest'
import {
  DISABLED_TARGET_HINT,
  describeStep,
  guideRouteToRouterPath,
  guideStepChrome,
  isTargetDisabled,
  missingTargetMessage,
  resolveGuideRoute,
  shouldResumeOnRegister,
  shouldSkipMissingStep,
  type AbyGuide,
} from './aby-guidance'

// Guide step routes come from addon manifests as ROUTER paths (the same shape
// as `addon://` nav targets) and are host-agnostic: a manifest cannot know the
// basepath the shell mounts under. The SPA lives under Vite `base` "/app/", so
// a raw location.assign("/addons/pos/terminal") lands outside the app and
// nginx answers 404 — the exact bug this pins.
describe('resolveGuideRoute', () => {
  it('prefija el basepath de la SPA a una ruta de manifest', () => {
    expect(resolveGuideRoute('/addons/pos/terminal', '/app/')).toBe('/app/addons/pos/terminal')
  })

  it('no duplica el basepath si la ruta ya lo trae', () => {
    expect(resolveGuideRoute('/app/addons/pos/terminal', '/app/')).toBe('/app/addons/pos/terminal')
    expect(resolveGuideRoute('/app', '/app/')).toBe('/app')
  })

  it('no confunde un prefijo textual con el basepath', () => {
    // "/application" empieza con "/app" pero NO está bajo el basepath.
    expect(resolveGuideRoute('/application/x', '/app/')).toBe('/app/application/x')
  })

  it('tolera rutas sin slash inicial', () => {
    expect(resolveGuideRoute('addons/pos/terminal', '/app/')).toBe('/app/addons/pos/terminal')
  })

  it('es identidad cuando la SPA vive en la raíz', () => {
    expect(resolveGuideRoute('/addons/pos/terminal', '/')).toBe('/addons/pos/terminal')
    expect(resolveGuideRoute('/addons/pos/terminal', '')).toBe('/addons/pos/terminal')
  })
})

describe('guideRouteToRouterPath', () => {
  it('quita el basepath para navigate({ to }) de TanStack', () => {
    expect(guideRouteToRouterPath('/m/customers', '/app/')).toBe('/m/customers')
    expect(guideRouteToRouterPath('/app/m/customers', '/app/')).toBe('/m/customers')
  })
})

// Manifest-driven guides register from a React effect AFTER bootstrapAbyGuidance()
// ran, so the resume after a guide navigation must be picked up at register time.
// Mirrors the real POS guide: step 0 lives on the terminal route.
const posGuide: AbyGuide = {
  id: 'pos.create-sale',
  title: 'Crear una venta',
  description: 'Aby acompaña al usuario desde la selección de productos hasta el cobro.',
  owner: 'pos',
  intents: ['como creo una venta'],
  steps: [
    { id: 'open-terminal', route: '/addons/pos/terminal', target: 'pos.product-search', title: 'Elige', description: '…' },
    { id: 'checkout', route: '/addons/pos/terminal', target: 'pos.checkout', title: 'Cobra', description: '…' },
  ],
}

describe('shouldResumeOnRegister', () => {
  it('reanuda cuando la guía pendiente se registra ya estando en la ruta del paso (con basepath)', () => {
    const pending = { guideId: 'pos.create-sale', stepIndex: 0 }
    expect(shouldResumeOnRegister(pending, posGuide, '/app/addons/pos/terminal', '/app/')).toBe(true)
  })

  it('no reanuda en otra ruta: un registro tardío nunca arrastra al usuario a otra pantalla', () => {
    const pending = { guideId: 'pos.create-sale', stepIndex: 0 }
    expect(shouldResumeOnRegister(pending, posGuide, '/app/', '/app/')).toBe(false)
  })

  it('ignora guías que no son la pendiente', () => {
    const pending = { guideId: 'otra.guia', stepIndex: 0 }
    expect(shouldResumeOnRegister(pending, posGuide, '/app/addons/pos/terminal', '/app/')).toBe(false)
  })

  it('no hace nada sin pendiente', () => {
    expect(shouldResumeOnRegister(null, posGuide, '/app/addons/pos/terminal', '/app/')).toBe(false)
  })

  it('rechaza un stepIndex fuera de rango', () => {
    const pending = { guideId: 'pos.create-sale', stepIndex: 99 }
    expect(shouldResumeOnRegister(pending, posGuide, '/app/addons/pos/terminal', '/app/')).toBe(false)
  })

  it('un paso sin ruta reanuda en cualquier pantalla', () => {
    const routeless: AbyGuide = { ...posGuide, steps: [{ id: 's', target: 'x', title: 't', description: 'd' }] }
    const pending = { guideId: 'pos.create-sale', stepIndex: 0 }
    expect(shouldResumeOnRegister(pending, routeless, '/app/cualquier/cosa', '/app/')).toBe(true)
  })
})

// Each step runs in its own single-step driver.js instance, so driver.js thinks
// every step is first AND last ("Terminar" on step 1, "1 de 1", "Atrás" disabled).
// The tour-level chrome must come from the guide's real step position.
describe('guideStepChrome', () => {
  it('primer paso de 4: Siguiente, 1 de 4, sin Atrás', () => {
    expect(guideStepChrome(0, 4)).toEqual({ nextLabel: 'Siguiente', progressText: '1 de 4', canGoBack: false })
  })

  it('paso intermedio: Siguiente, progreso real, con Atrás', () => {
    expect(guideStepChrome(1, 4)).toEqual({ nextLabel: 'Siguiente', progressText: '2 de 4', canGoBack: true })
  })

  it('último paso: Terminar, con Atrás', () => {
    expect(guideStepChrome(3, 4)).toEqual({ nextLabel: 'Terminar', progressText: '4 de 4', canGoBack: true })
  })

  it('guía de un solo paso: Terminar y sin Atrás', () => {
    expect(guideStepChrome(0, 1)).toEqual({ nextLabel: 'Terminar', progressText: '1 de 1', canGoBack: false })
  })
})

// A guide must never go silent: with an empty cart the POS "Crear venta" button
// (target pos.checkout) is disabled and the next step's target lives inside the
// still-closed checkout modal. Both cases need visible feedback.
describe('isTargetDisabled / describeStep', () => {
  const step = posGuide.steps[1]

  it('detecta un botón deshabilitado', () => {
    const btn = document.createElement('button')
    btn.disabled = true
    expect(isTargetDisabled(btn)).toBe(true)
    expect(describeStep(step, btn)).toBe(`${step.description} ${DISABLED_TARGET_HINT}`)
  })

  it('detecta aria-disabled en un control no nativo', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'button')
    el.setAttribute('aria-disabled', 'true')
    expect(isTargetDisabled(el)).toBe(true)
  })

  it('un botón habilitado o un contenedor plano no llevan aviso', () => {
    const btn = document.createElement('button')
    const box = document.createElement('div')
    expect(isTargetDisabled(btn)).toBe(false)
    expect(isTargetDisabled(box)).toBe(false)
    expect(describeStep(step, btn)).toBe(step.description)
  })
})

describe('missingTargetMessage', () => {
  it('nombra el paso que no se encontró y dice qué hacer', () => {
    const msg = missingTargetMessage(posGuide.steps[1])
    expect(msg).toContain('"Cobra"')
    expect(msg).toContain('Completa el paso actual')
  })
})

describe('shouldSkipMissingStep', () => {
  it('salta campos opcionales del create que no están en pantalla', () => {
    expect(
      shouldSkipMissingStep({
        id: 'field-external_id',
        title: 'ID externo',
        description: '',
        target: 'model.customers.create.field.external_id',
        optional: true,
      }),
    ).toBe(true)
  })

  it('no salta campos obligatorios ni pasos que no son field', () => {
    expect(
      shouldSkipMissingStep({
        id: 'field-name',
        title: 'Nombre',
        description: '',
        target: 'model.customers.create.field.name',
        optional: false,
      }),
    ).toBe(false)
    expect(
      shouldSkipMissingStep({
        id: 'create',
        title: 'Pulsa Crear',
        description: '',
        target: 'model.customers.create',
        optional: true,
      }),
    ).toBe(false)
  })
})
