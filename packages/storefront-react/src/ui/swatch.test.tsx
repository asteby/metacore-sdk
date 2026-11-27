import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createSwatchResolver, defaultColors, optionHasSwatches, parseSwatchAttribute, pastelBackground, resolveSwatch, resolveSwatchSpec, swatchBackground, swatchCatalogDictionaries } from './swatch-colors'
import { Swatch } from './swatch'

describe('colores básicos', () => {
  it('resuelve con acentos, mayúsculas y plurales', () => {
    expect(resolveSwatch('ROJO')).toEqual(['#e0262d'])
    expect(resolveSwatch('Café')).toEqual(['#7a4a2b'])
    expect(resolveSwatch('Negros')).toEqual(['#111111'])
  })
  it('la frase más larga gana: "azul marino" no es "azul"', () => {
    expect(resolveSwatch('Azul marino')).toEqual(['#14213d'])
  })
  it('combinaciones en orden de lectura, con cualquier conector', () => {
    expect(resolveSwatch('Rojo / Negro')).toEqual(['#e0262d', '#111111'])
    expect(resolveSwatch('Blanco y azul')).toEqual(['#ffffff', '#2f5bea'])
    expect(resolveSwatch('Gris - Verde')).toEqual(['#9aa0a8', '#2fa84f'])
    expect(resolveSwatch('Black and White')).toEqual(['#111111', '#ffffff'])
  })
  it('acepta hex y limita a 4 colores', () => {
    expect(resolveSwatch('#ff8800')).toEqual(['#ff8800'])
    expect(resolveSwatch('rojo / azul / verde / negro / blanco')).toHaveLength(4)
  })
  it('null si no reconoce nada; el SDK no trae vocabulario de ningún giro', () => {
    expect(resolveSwatch('Talla M')).toBeNull()
    expect(resolveSwatch('')).toBeNull()
    expect(resolveSwatch('Fresa')).toBeNull()
  })
  it('optionHasSwatches exige que todos los valores tengan muestra', () => {
    expect(optionHasSwatches(['Rojo', 'Negro', 'Rojo / Blanco'])).toBe(true)
    expect(optionHasSwatches(['Rojo', 'XL'])).toBe(false)
    expect(optionHasSwatches(['Rojo', 'XL'], parseSwatchAttribute('XL:🧢'))).toBe(true)
  })
})

describe('createSwatchResolver: el diccionario lo inyecta la tienda', () => {
  const resolver = createSwatchResolver({
    colors: [...defaultColors, ['fresa', '#ff4d6d'], ['crema', '#f4ead2'], ['cookies and cream', ['#3b2a22', '#f4ead2']]],
    emojis: [['cookies and cream', '🍪🥛'], ['fresa', '🍓'], ['crema', '🍦'], ['kiwi', '🥝']],
    prefer: 'emoji',
  })
  it('frases con conector se resuelven como frase', () => {
    expect(resolver.colors('COOKIES AND CREAM')).toEqual(['#3b2a22', '#f4ead2'])
    expect(resolver.emoji('COOKIES AND CREAM')).toBe('🍪🥛')
  })
  it('mezclas llevan varios emoji en orden de lectura, sin repetir y con plurales', () => {
    expect(resolver.emoji('FRESAS CON CREMA')).toBe('🍓🍦')
    expect(resolver.emoji('Fresa Kiwi')).toBe('🍓🥝')
    expect(resolver.emoji('Talla M')).toBeNull()
  })
  it('prefer decide entre emoji y color; el color de ropa sigue sirviendo', () => {
    expect(resolver.resolve('Fresa')).toEqual({ emoji: '🍓' })
    expect(resolver.resolve('Rojo')).toEqual({ colors: ['#e0262d'] })
    expect(createSwatchResolver({ colors: [['fresa', '#ff4d6d']], emojis: [['fresa', '🍓']], prefer: 'color' }).resolve('Fresa')).toEqual({ colors: ['#ff4d6d'] })
  })
  it('el catálogo manda sobre cualquier diccionario', () => {
    const attr = parseSwatchAttribute('Fresa:#aa0000|Natural:🥛')
    expect(resolver.resolve('FRESA', attr)).toEqual({ colors: ['#aa0000'] })
    expect(resolver.resolve('natural', attr)).toEqual({ emoji: '🥛' })
  })
  it('hasSwatches', () => {
    expect(resolver.hasSwatches(['Fresa', 'Kiwi', 'Rojo'])).toBe(true)
    expect(resolver.hasSwatches(['Fresa', 'Talla M'])).toBe(false)
  })
})

describe('atributo del catálogo', () => {
  const attr = parseSwatchAttribute('Mora Azul:#3d4fd6|Fresa Kiwi:#ff4d6d+#8bc34a|Natural:🥛|Roto:nada')
  it('lee hex, combinaciones y emojis; ignora lo inválido', () => {
    expect(attr.get('mora azul')).toEqual({ colors: ['#3d4fd6'] })
    expect(attr.get('fresa kiwi')).toEqual({ colors: ['#ff4d6d', '#8bc34a'] })
    expect(attr.get('natural')).toEqual({ emoji: '🥛' })
    expect(attr.has('roto')).toBe(false)
    expect(parseSwatchAttribute(undefined).size).toBe(0)
  })
  it('resolveSwatchSpec: catálogo primero, luego colores básicos', () => {
    expect(resolveSwatchSpec('NATURAL', attr)).toEqual({ emoji: '🥛' })
    expect(resolveSwatchSpec('Rojo', attr)).toEqual({ colors: ['#e0262d'] })
    expect(resolveSwatchSpec('Talla M', attr)).toBeNull()
  })
})

describe('swatchBackground', () => {
  it('liso, mitades y sectores', () => {
    expect(swatchBackground(['#111111'])).toBe('#111111')
    expect(swatchBackground(['#111111', '#ffffff'])).toBe('linear-gradient(90deg, #111111 50%, #ffffff 50%)')
    expect(swatchBackground(['#1', '#2', '#3'])).toContain('conic-gradient(#1 0deg 120deg, #2 120deg 240deg, #3 240deg 360deg)')
  })
})

describe('<Swatch>', () => {
  it('es decorativa, plana y marca el aro solo donde hace falta', () => {
    const white = renderToString(<Swatch value="Blanco" />)
    expect(white).toContain('aria-hidden="true"')
    expect(white).toContain('data-edge="light"')
    expect(renderToString(<Swatch value="Negro" />)).toContain('data-edge="dark"')
    expect(renderToString(<Swatch value="Rojo" />)).not.toContain('data-edge')
    expect(renderToString(<Swatch value="Rojo" />)).not.toContain('box-shadow')
  })
  it('no pinta nada si no reconoce el color y respeta la muestra ya resuelta', () => {
    expect(renderToString(<Swatch value="Talla M" />)).toBe('')
    expect(renderToString(<Swatch value="Talla M" spec={{ colors: ['#ff0000'] }} />)).toContain('#ff0000')
  })
  it('emoji y mezclas de emoji en su propia baldosa', () => {
    const one = renderToString(<Swatch spec={{ emoji: '🍓' }} />)
    expect(one).toContain('data-kind="emoji"')
    expect(one).toContain('🍓')
    const mix = renderToString(<Swatch spec={{ emoji: '🍓🍦' }} />)
    expect(mix.indexOf('🍓')).toBeGreaterThan(-1)
    expect(mix.indexOf('🍦')).toBeGreaterThan(mix.indexOf('🍓'))
    expect(mix).toContain('margin-inline-start:-0.3em')
  })
})

describe('badge de color + emoji (prefer: both)', () => {
  const resolver = createSwatchResolver({
    colors: [...defaultColors, ['fresa', '#ff4d6d'], ['crema', '#f4ead2']],
    emojis: [['fresa', '🍓'], ['crema', '🍦']],
    prefer: 'both',
  })
  it('devuelve colores y emoji juntos cuando hay de ambos', () => {
    expect(resolver.resolve('Fresas con crema')).toEqual({ colors: ['#ff4d6d', '#f4ead2'], emoji: '🍓🍦' })
  })
  it('si solo hay uno de los dos, ese', () => {
    expect(resolver.resolve('Rojo')).toEqual({ colors: ['#e0262d'] })
  })
  it('el atributo acepta colores y emoji juntos', () => {
    const attr = parseSwatchAttribute('Fresas con crema:#ff4d6d+#f4ead2 🍓🍦|Natural:🥛|Rojo:#e0262d')
    expect(attr.get('fresas con crema')).toEqual({ colors: ['#ff4d6d', '#f4ead2'], emoji: '🍓🍦' })
    expect(attr.get('natural')).toEqual({ emoji: '🥛' })
    expect(attr.get('rojo')).toEqual({ colors: ['#e0262d'] })
  })
  it('pastelBackground: color mezclado con blanco y degradado suave entre varios', () => {
    expect(pastelBackground(['#ff4d6d'])).toBe('color-mix(in srgb, #ff4d6d 26%, white)')
    expect(pastelBackground(['#ff4d6d', '#f4ead2'])).toContain('linear-gradient(100deg')
  })
  it('<Swatch> dibuja la píldora pastel con emoji encima', () => {
    const html = renderToString(<Swatch spec={{ colors: ['#ff4d6d', '#f4ead2'], emoji: '🍓🍦' }} />)
    expect(html).toContain('data-colored')
    expect(html).toContain('data-mixed')
    expect(html).toContain('color-mix(in srgb, #ff4d6d 26%, white)')
    expect(html).toContain('🍓')
  })
})

describe('catálogo de muestras de la organización (shop.swatches)', () => {
  const catalog = [
    { name: 'Fresa', aliases: ['strawberry', 'Fresas'], colors: ['#FF4D6D'], emoji: '🍓' },
    { name: 'Cookies and cream', aliases: [], colors: ['#3b2a22', '#f4ead2'], emoji: '🍪🥛' },
    { name: 'Piña', aliases: ['pineapple'], colors: [], emoji: '🍍' },
    { name: 'Natural', aliases: ['unflavored'], colors: ['#ffffff'], emoji: null },
  ]
  const { colors, emojis } = swatchCatalogDictionaries(catalog)
  const resolver = createSwatchResolver({ colors: [...defaultColors, ...colors], emojis, prefer: 'both' })

  it('cada nombre y alias, en cualquier idioma, resuelve a la misma muestra', () => {
    expect(resolver.resolve('STRAWBERRY')).toEqual({ colors: ['#ff4d6d'], emoji: '🍓' })
    expect(resolver.resolve('Fresa')).toEqual({ colors: ['#ff4d6d'], emoji: '🍓' })
    expect(resolver.resolve('UNFLAVORED')).toEqual({ colors: ['#ffffff'] })
  })

  it('normaliza acentos y mayúsculas, y respeta mezclas y la frase más larga', () => {
    expect(resolver.resolve('PIÑA')).toEqual({ emoji: '🍍' })
    expect(resolver.resolve('Cookies and Cream')).toEqual({ colors: ['#3b2a22', '#f4ead2'], emoji: '🍪🥛' })
  })

  it('sin catálogo (undefined, null o vacío) no aporta diccionarios', () => {
    for (const none of [undefined, null, []]) expect(swatchCatalogDictionaries(none)).toEqual({ colors: [], emojis: [] })
  })

  it('descarta hex inválidos y muestras sin color ni emoji', () => {
    const d = swatchCatalogDictionaries([
      { name: 'Roto', colors: ['no-es-hex', '#12'] },
      { name: 'Bueno', colors: ['#abc', 'rojo'] },
    ])
    expect(d.colors).toEqual([['bueno', '#abc']])
    expect(d.emojis).toEqual([])
  })

  it('un nombre con signos de expresión regular (datos de la organización) no rompe ni se interpreta', () => {
    const { colors: c } = swatchCatalogDictionaries([{ name: 'Fresa (nueva) [x]+', colors: ['#ff4d6d'] }, { name: '.*', colors: ['#000000'] }])
    const r = createSwatchResolver({ colors: c })
    expect(() => r.resolve('Fresa (nueva) [x]+')).not.toThrow()
    expect(r.resolve('Fresa (nueva) [x]+')).toEqual({ colors: ['#ff4d6d'] })
    // «.*» no es un comodín: no se come cualquier texto.
    expect(r.resolve('Chocolate')).toBeNull()
  })

  it('el atributo `colores` del producto sigue mandando sobre el catálogo', () => {
    const attr = parseSwatchAttribute('Fresa:#000000')
    expect(resolver.resolve('Fresa', attr)).toEqual({ colors: ['#000000'] })
  })
})
