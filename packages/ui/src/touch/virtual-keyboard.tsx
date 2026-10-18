import * as React from 'react'
import { cn } from '@/lib/utils'
import { touchFontSizeCss, touchMinTargetCss } from './constants'
import {
  applyKeyAction,
  charFor,
  nextShift,
  rowsFor,
  type KeyAction,
  type KeyboardLayout,
  type KeyDef,
  type ShiftState,
} from './keyboard-layouts'

export interface VirtualKeyboardLabels {
  group: string
  shift: string
  shiftLock: string
  backspace: string
  space: string
  enter: string
}

const DEFAULT_LABELS: VirtualKeyboardLabels = {
  group: 'Teclado virtual',
  shift: 'Mayúsculas',
  shiftLock: 'Bloqueo de mayúsculas',
  backspace: 'Borrar',
  space: 'Espacio',
  enter: 'Aceptar',
}

export interface VirtualKeyboardProps
  extends Omit<React.ComponentProps<'div'>, 'onChange' | 'onKeyDown'> {
  layout?: KeyboardLayout
  /** Controlled text. With `onValueChange`, key presses are applied for you. */
  value?: string
  onValueChange?: (value: string) => void
  /** Raw key stream, e.g. to drive a field with its own caret logic. */
  onKey?: (action: KeyAction) => void
  onEnter?: () => void
  /** Numeric layout only: show a decimal point key. */
  decimal?: boolean
  /** Key edge floor in px. Defaults to the theme's `--touch-min-target` (60). */
  minTarget?: number
  /** Gap between keys in px. */
  gap?: number
  /** i18n overrides for the accessible names. */
  labels?: Partial<VirtualKeyboardLabels>
}

/**
 * On-screen keyboard for kiosks. Keys are real <button>s (focusable, labelled,
 * Enter/Space activate them) at least `minTarget` tall. Pressing a key never
 * steals focus from the field being typed into.
 */
export function VirtualKeyboard({
  layout = 'text',
  value,
  onValueChange,
  onKey,
  onEnter,
  decimal = false,
  minTarget,
  gap = 8,
  labels,
  className,
  style,
  ...props
}: VirtualKeyboardProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const [shift, setShift] = React.useState<ShiftState>('off')
  const rows = rowsFor(layout, decimal)
  const valueRef = React.useRef(value ?? '')
  valueRef.current = value ?? valueRef.current

  const press = (action: KeyAction) => {
    if (action.type === 'shift') {
      setShift(nextShift)
      return
    }
    onKey?.(action)
    if (action.type === 'enter') {
      onEnter?.()
      return
    }
    if (onValueChange) {
      valueRef.current = applyKeyAction(valueRef.current, action)
      onValueChange(valueRef.current)
    }
    if (action.type === 'char' && shift === 'once') setShift('off')
  }

  const keyText = (k: KeyDef): React.ReactNode => {
    switch (k.kind) {
      case 'char':
        return charFor(k, shift)
      case 'shift':
        return shift === 'lock' ? '⇪' : '⇧'
      case 'backspace':
        return '⌫'
      case 'enter':
        return '↵'
      case 'space':
        return '␣'
    }
  }

  const keyLabel = (k: KeyDef): string => {
    switch (k.kind) {
      case 'char':
        return charFor(k, shift)
      case 'shift':
        return shift === 'lock' ? l.shiftLock : l.shift
      case 'backspace':
        return l.backspace
      case 'enter':
        return l.enter
      case 'space':
        return l.space
    }
  }

  const keyAction = (k: KeyDef): KeyAction =>
    k.kind === 'char' ? { type: 'char', value: charFor(k, shift) } : { type: k.kind }

  return (
    <div
      role='group'
      aria-label={l.group}
      data-slot='virtual-keyboard'
      data-layout={layout}
      className={cn('flex w-full select-none flex-col', className)}
      style={{ gap, ...style }}
      {...props}
    >
      {rows.map((row, ri) => (
        <div key={ri} className='flex' style={{ gap }}>
          {row.map((k, ki) => {
            const isShift = k.kind === 'shift'
            const accent = k.kind === 'enter'
            return (
              <button
                key={`${ri}-${ki}`}
                type='button'
                data-key={k.kind === 'char' ? k.value : k.kind}
                aria-label={keyLabel(k)}
                aria-pressed={isShift ? shift !== 'off' : undefined}
                // Keep focus (and any soft caret) on the field being typed into.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => press(keyAction(k))}
                className={cn(
                  'flex flex-1 items-center justify-center rounded-lg border font-medium touch-manipulation outline-none transition-transform active:scale-95 motion-reduce:active:scale-100 focus-visible:ring-4 focus-visible:ring-ring/60',
                  accent
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                  isShift && shift !== 'off' && 'bg-accent text-accent-foreground',
                )}
                style={{
                  flexGrow: k.grow ?? 1,
                  flexBasis: 0,
                  minWidth: 0,
                  minHeight: touchMinTargetCss(minTarget),
                  fontSize: touchFontSizeCss(),
                }}
              >
                {keyText(k)}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
