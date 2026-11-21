import { useState, type ReactNode } from 'react'
import { VirtualKeyboard } from './virtual-keyboard'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/primitives/popover'
import { cn } from '@/lib/utils'

export interface FloatingNumpadProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Texto en edicion (cadena, jamas number). */
  value: string
  onChange: (next: string) => void
  /** Enter del teclado en pantalla (confirmar). El cierre lo decide quien lo usa. */
  onSubmit?: () => void
  /** Decimales admitidos: 0 oculta el punto y descarta lo que exceda. */
  decimals?: number
  /** Longitud maxima del texto (tope duro de digitos). */
  maxLength?: number
  /** Elemento al que se ancla: el campo y su disparador (clic dentro no cuenta como "fuera"). */
  children: ReactNode
  /** Etiqueta accesible del teclado. */
  label?: string
  side?: 'top' | 'bottom'
  className?: string
}

/**
 * Teclado numerico FLOTANTE y generico: popover en portal anclado a `children`, no empuja ni estira el
 * contenedor (modal incluido). Las teclas no roban el foco, asi el teclado fisico sigue escribiendo en el
 * campo; cierra con Esc / clic fuera (Esc solo cierra el teclado, no el dialogo). Teclas >= 44px.
 */
export function FloatingNumpad({
  open,
  onOpenChange,
  value,
  onChange,
  onSubmit,
  decimals = 2,
  maxLength = 12,
  children,
  label,
  side = 'bottom',
  className,
}: FloatingNumpadProps) {
  // Al abrir, el campo suele traer el valor previo seleccionado: la primera tecla lo REEMPLAZA (como el teclado fisico).
  // `seed` = valor al abrir; mientras no cambie, la tecla reemplaza (derivado, sin efectos).
  const [seed, setSeed] = useState<{ open: boolean; value: string }>({
    open,
    value,
  })
  if (seed.open !== open) setSeed({ open, value })
  const fresh = open && seed.value === value
  const apply = (next: string) => {
    if (next.length > maxLength) return
    const dot = next.indexOf('.')
    if (dot >= 0 && (decimals === 0 || next.length - dot - 1 > decimals)) return
    onChange(next)
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div data-numpad-anchor className='min-w-0'>
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side={side}
        align='end'
        sideOffset={6}
        collisionPadding={8}
        aria-label={label}
        className={cn('w-60 p-2', className)}
        // El foco se queda en el campo (teclado fisico); abrir/cerrar no lo mueve.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement | null)?.closest('[data-numpad-anchor]'))
            e.preventDefault()
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <VirtualKeyboard
          layout='numeric'
          decimal={decimals > 0}
          minTarget={44}
          gap={6}
          value={fresh ? '' : value}
          onValueChange={apply}
          onEnter={onSubmit}
        />
      </PopoverContent>
    </Popover>
  )
}
