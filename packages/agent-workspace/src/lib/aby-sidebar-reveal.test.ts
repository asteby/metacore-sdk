import { afterEach, describe, expect, it } from 'vitest'
import { abyGuidance } from './aby-guidance'
import {
  annotateAbySidebarTargets,
  expandSidebarPath,
  registerAbySidebarRevealer,
  sidebarHrefMatches,
} from './aby-dynamic-surfaces'

// Radix Collapsible unmounts closed content: the leaf anchor only exists once
// its group trigger is clicked. This fake mirrors that DOM contract.
function mountSidebar(): void {
  document.body.innerHTML = `
    <div data-sidebar="sidebar">
      <ul>
        <li><button aria-expanded="false" id="alineacion"><span>Alineación</span></button></li>
        <li><button aria-expanded="false" id="clientes"><span>Clientes</span></button><div id="clientes-content"></div></li>
      </ul>
    </div>`
  const trigger = document.getElementById('clientes')!
  trigger.addEventListener('click', () => {
    trigger.setAttribute('aria-expanded', 'true')
    document.getElementById('clientes-content')!.innerHTML =
      '<ul><li><a href="' + import.meta.env.BASE_URL.replace(/\/$/, '') + '/m/customers"><span>Clientes</span></a></li></ul>'
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('sidebarHrefMatches', () => {
  it('acepta el href con basepath que renderiza el router', () => {
    expect(sidebarHrefMatches('/app/m/customers', '/m/customers', '/app/')).toBe(true)
    expect(sidebarHrefMatches('/m/customers', '/m/customers', '/app/')).toBe(true)
    expect(sidebarHrefMatches('/app/m/customers_x', '/m/customers', '/app/')).toBe(false)
  })
})

describe('expandSidebarPath', () => {
  it('expande solo el grupo que contiene la hoja', async () => {
    mountSidebar()
    expect(await expandSidebarPath(['Clientes'])).toBe(true)
    expect(document.getElementById('clientes')!.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('alineacion')!.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('a[href$="/m/customers"]')).not.toBeNull()
  })

  it('no vuelve a clicar un grupo ya abierto', async () => {
    mountSidebar()
    await expandSidebarPath(['Clientes'])
    expect(await expandSidebarPath(['Clientes'])).toBe(false)
  })
})

describe('revealer navigation.*', () => {
  it('la hoja colapsada termina anotada y resoluble por la guía', async () => {
    mountSidebar()
    const unannotate = annotateAbySidebarTargets(['/m/customers'])
    const unregister = registerAbySidebarRevealer(new Map([['/m/customers', ['Clientes']]]), () => false)
    expect(document.querySelector('[data-aby-target="navigation./m/customers"]')).toBeNull()

    const errors: unknown[] = []
    const onError = (e: Event) => errors.push((e as CustomEvent).detail)
    window.addEventListener('ops:aby-guide-error', onError)
    const unregisterGuide = abyGuidance.registerGuide({
      id: 'test.nav',
      title: 'Crear cliente',
      description: 'Guía de prueba',
      owner: 'test',
      intents: [],
      steps: [{ id: 'nav', target: 'navigation./m/customers', title: 'Ve a Clientes', description: '' }],
    })
    await abyGuidance.startGuide('test.nav')
    window.removeEventListener('ops:aby-guide-error', onError)

    expect(errors).toEqual([])
    const anchor = document.querySelector('[data-aby-target="navigation./m/customers"]')
    expect(anchor?.getAttribute('href')).toMatch(/\/m\/customers$/)
    abyGuidance.stopGuide()
    unregisterGuide()
    unregister()
    unannotate()
  })
})

describe('Siguiente en un paso de acción', () => {
  it('pulsa el botón iluminado para que el siguiente paso exista', async () => {
    document.body.innerHTML = '<button data-aby-target="model.customers.create">Crear</button>'
    const button = document.querySelector('button')!
    button.addEventListener('click', () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      const form = document.createElement('form')
      form.setAttribute('data-aby-record-form', '')
      form.setAttribute('data-aby-model', 'customers')
      form.setAttribute('data-aby-mode', 'create')
      const row = document.createElement('div')
      row.setAttribute('data-aby-field', 'name')
      row.innerHTML = '<label>Nombre</label><input />'
      form.appendChild(row)
      dialog.appendChild(form)
      document.body.appendChild(dialog)
    })
    const errors: unknown[] = []
    const onError = (e: Event) => errors.push((e as CustomEvent).detail)
    window.addEventListener('ops:aby-guide-error', onError)
    const unregister = abyGuidance.registerGuide({
      id: 'test.create',
      title: 'Crear en Clientes',
      description: 'Guía de prueba',
      owner: 'test',
      intents: [],
      steps: [
        { id: 'create', target: 'model.customers.create', title: 'Pulsa Crear', description: '', advanceOn: { event: 'click' } },
        { id: 'field-name', target: 'model.customers.create.field.name', title: 'Nombre', description: '' },
      ],
    })
    await abyGuidance.startGuide('test.create')
    ;(document.querySelector('.driver-popover-next-btn') as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 50))
    window.removeEventListener('ops:aby-guide-error', onError)
    expect(errors).toEqual([])
    expect(document.querySelectorAll('[data-aby-field="name"]')).toHaveLength(1)
    expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Nombre')
    abyGuidance.stopGuide()
    unregister()
  })
})

describe('annotateAbyRecordForm', () => {
  it('marca el form y el campo por label sin id fijo', async () => {
    const { annotateAbyRecordForm } = await import('./aby-dynamic-surfaces')
    document.body.innerHTML = `
      <div role="dialog">
        <form>
          <div class="flex flex-col gap-1.5">
            <label>Nombre *</label>
            <input />
          </div>
        </form>
      </div>`
    expect(annotateAbyRecordForm('customers', 'create', [{ key: 'name', label: 'Nombre' }])).toBe(true)
    const form = document.querySelector('form')!
    expect(form.getAttribute('data-aby-record-form')).toBe('')
    expect(form.getAttribute('data-aby-model')).toBe('customers')
    expect(document.querySelector('[data-aby-field="name"]')).not.toBeNull()
  })
})
