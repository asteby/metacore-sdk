export type KeyboardLayout = 'text' | 'numeric' | 'email'

/** What a key press means. `char` carries the (already shifted) text to insert. */
export type KeyAction =
  | { type: 'char'; value: string }
  | { type: 'backspace' }
  | { type: 'space' }
  | { type: 'enter' }
  | { type: 'shift' }

export type ShiftState = 'off' | 'once' | 'lock'

export type KeyDef =
  | { kind: 'char'; value: string; shifted?: string; grow?: number }
  | { kind: 'shift' | 'backspace' | 'enter' | 'space'; grow?: number }

const chars = (s: string): KeyDef[] => [...s].map((value) => ({ kind: 'char', value }))

const bottom = (...extra: KeyDef[]): KeyDef[] => [
  ...extra,
  { kind: 'space', grow: 5 },
  { kind: 'enter', grow: 2 },
]

export const TEXT_ROWS: KeyDef[][] = [
  chars('1234567890'),
  chars('qwertyuiop'),
  chars('asdfghjklñ'),
  [{ kind: 'shift', grow: 1.5 }, ...chars('zxcvbnm'), { kind: 'backspace', grow: 1.5 }],
  bottom({ kind: 'char', value: '-' }, { kind: 'char', value: '.' }),
]

export const EMAIL_ROWS: KeyDef[][] = [
  chars('1234567890'),
  chars('qwertyuiop'),
  chars('asdfghjkl'),
  [{ kind: 'shift', grow: 1.5 }, ...chars('zxcvbnm'), { kind: 'backspace', grow: 1.5 }],
  [
    { kind: 'char', value: '@', grow: 1.5 },
    { kind: 'char', value: '.' },
    { kind: 'char', value: '_' },
    { kind: 'char', value: '-' },
    { kind: 'char', value: '.com', shifted: '.com', grow: 2 },
    { kind: 'enter', grow: 2 },
  ],
]

export function numericRows(decimal: boolean): KeyDef[][] {
  const g = decimal ? 0.75 : 1
  return [
    chars('123'),
    chars('456'),
    chars('789'),
    [
      ...(decimal ? [{ kind: 'char', value: '.', grow: g } as KeyDef] : []),
      { kind: 'char', value: '0', grow: g },
      { kind: 'backspace', grow: g },
      { kind: 'enter', grow: g },
    ],
  ]
}

export function rowsFor(layout: KeyboardLayout, decimal = false): KeyDef[][] {
  if (layout === 'numeric') return numericRows(decimal)
  return layout === 'email' ? EMAIL_ROWS : TEXT_ROWS
}

/** Text a char key produces under the current shift state. */
export function charFor(key: Extract<KeyDef, { kind: 'char' }>, shift: ShiftState): string {
  if (shift === 'off') return key.value
  return key.shifted ?? key.value.toUpperCase()
}

/** off -> once -> lock -> off. */
export function nextShift(s: ShiftState): ShiftState {
  return s === 'off' ? 'once' : s === 'once' ? 'lock' : 'off'
}

/** Apply an action to a string (append-only caret model: kiosks have no caret). */
export function applyKeyAction(value: string, action: KeyAction): string {
  switch (action.type) {
    case 'char':
      return value + action.value
    case 'space':
      return value + ' '
    case 'backspace':
      return Array.from(value).slice(0, -1).join('')
    default:
      return value
  }
}
