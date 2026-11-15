// @vitest-environment happy-dom
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import {
  VEHICLE_MAKE_LOGO_SLUGS,
  VehicleMakeLogo,
  hasVehicleMakeLogo,
  resolveVehicleMake,
  vehicleMakeInitials,
  vehicleMakeLogoSrc,
  vehicleMakeSlug,
} from './index.js'

afterEach(cleanup)

describe('vehicleMakeSlug / resolveVehicleMake', () => {
  it('normaliza acentos, mayúsculas, espacios y símbolos', () => {
    expect(vehicleMakeSlug('Mercedes Benz')).toBe('mercedes-benz')
    expect(vehicleMakeSlug('  ALFA_ROMEO ')).toBe('alfa-romeo')
    expect(vehicleMakeSlug('Citroën')).toBe('citroen')
    expect(vehicleMakeSlug(null)).toBe('')
  })

  it('aplica alias comunes', () => {
    expect(resolveVehicleMake('VW')).toBe('volkswagen')
    expect(resolveVehicleMake('Chevy')).toBe('chevrolet')
    expect(resolveVehicleMake('Mercedes')).toBe('mercedes-benz')
    expect(resolveVehicleMake('Range Rover')).toBe('land-rover')
    expect(resolveVehicleMake('Nissan')).toBe('nissan')
    expect(resolveVehicleMake('')).toBeNull()
  })
})

describe('vehicleMakeLogoSrc', () => {
  it('da la ruta solo si hay logo, con la carpeta indicada', () => {
    expect(vehicleMakeLogoSrc('ACURA')).toBe('/vehicle-makes/acura.webp')
    expect(vehicleMakeLogoSrc('vw', '/assets/makes/')).toBe('/assets/makes/volkswagen.webp')
    expect(vehicleMakeLogoSrc('Bugatti')).toBeNull()
    expect(hasVehicleMakeLogo('Toyota')).toBe(true)
    expect(hasVehicleMakeLogo('Yugo')).toBe(false)
  })

  it('la lista generada coincide con los archivos del paquete', () => {
    // happy-dom cambia import.meta.url a http: se resuelve desde la raíz del paquete (cwd de vitest).
    const files = readdirSync(resolve(process.cwd(), 'vehicle-makes'))
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.slice(0, -5))
      .sort()
    expect([...VEHICLE_MAKE_LOGO_SLUGS]).toEqual(files)
  })

  it('cada alias apunta a una marca con logo', () => {
    for (const alias of ['vw', 'chevy', 'mercedes', 'range-rover', 'alfa', 'mini-cooper', 'dodge-ram', 'ssang-yong']) {
      expect(hasVehicleMakeLogo(alias), alias).toBe(true)
    }
  })
})

describe('vehicleMakeInitials', () => {
  it('toma dos letras', () => {
    expect(vehicleMakeInitials('Mercedes Benz')).toBe('MB')
    expect(vehicleMakeInitials('Nissan')).toBe('NI')
    expect(vehicleMakeInitials('')).toBe('?')
  })
})

describe('<VehicleMakeLogo>', () => {
  it('pinta el logo en una caja fija y decorativa por omisión', () => {
    const { container } = render(<VehicleMakeLogo make="Nissan" size={40} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/vehicle-makes/nissan.webp')
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('width')).toBe('40')
    const box = container.querySelector('.sf-vehicle-make') as HTMLElement
    expect(box.style.width).toBe('40px')
    expect(box.style.height).toBe('40px')
    expect(box.dataset.make).toBe('nissan')
  })

  it('con decorative=false lleva el nombre como alt', () => {
    const { container } = render(<VehicleMakeLogo make="VW" decorative={false} />)
    expect(container.querySelector('img')!.getAttribute('alt')).toBe('VW')
  })

  it('sin logo muestra iniciales en la misma caja', () => {
    const { container } = render(<VehicleMakeLogo make="Rolls Royce" size={24} />)
    expect(container.querySelector('img')).toBeNull()
    const box = container.querySelector('.sf-vehicle-make') as HTMLElement
    expect(box.textContent).toBe('RR')
    expect(box.style.width).toBe('24px')
    expect(box.getAttribute('aria-hidden')).toBe('true')
  })

  it('si la imagen falla cae a las iniciales', () => {
    const { container } = render(<VehicleMakeLogo make="Toyota" decorative={false} />)
    fireEvent.error(container.querySelector('img')!)
    const box = container.querySelector('.sf-vehicle-make') as HTMLElement
    expect(box.textContent).toBe('TO')
    expect(box.getAttribute('role')).toBe('img')
    expect(box.getAttribute('aria-label')).toBe('Toyota')
  })
})
