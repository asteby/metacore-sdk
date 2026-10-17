import type { ReactNode } from 'react'
import type { SupplementMockupData, SupplementShape } from '@asteby/storefront/mockup'
import { MockupFrame, MockupText, fitMockupFontSize, mockupWordMax, tone, wrapMockupText } from './frame.js'
import type { MockupComponentProps } from './types.js'

type Box = { x: number; y: number; w: number; h: number }

/** Container silhouettes (generic, unbranded) and where their label sits. */
const SHAPES: Record<SupplementShape, { label: Box; draw: () => ReactNode }> = {
  tub: {
    label: { x: 131, y: 128, w: 138, h: 200 },
    draw: () => (
      <>
        <rect x={120} y={44} width={160} height={54} rx={8} style={tone('surface')} />
        <line x1={128} y1={71} x2={272} y2={71} strokeWidth={42} strokeDasharray="1.5 7.5" style={{ ...tone('surface-ink', 'stroke'), opacity: 0.18 }} />
        <rect x={117} y={95} width={166} height={9} rx={2} style={tone('accent')} />
        <path d="M122 104H278L283 344Q283 362 265 362H135Q117 362 117 344Z" style={tone('surface')} />
      </>
    ),
  },
  bottle: {
    label: { x: 131, y: 148, w: 138, h: 184 },
    draw: () => (
      <>
        <rect x={158} y={46} width={84} height={40} rx={7} style={tone('surface')} />
        <line x1={164} y1={66} x2={236} y2={66} strokeWidth={30} strokeDasharray="1.5 6.5" style={{ ...tone('surface-ink', 'stroke'), opacity: 0.18 }} />
        <rect x={168} y={84} width={64} height={12} style={tone('accent')} />
        <path d="M124 116Q124 96 148 96H252Q276 96 276 116L281 344Q281 362 263 362H137Q119 362 119 344Z" style={tone('surface')} />
      </>
    ),
  },
  bag: {
    label: { x: 133, y: 118, w: 134, h: 196 },
    draw: () => (
      <>
        <path d="M118 64Q200 50 282 64L297 344Q200 360 103 344Z" style={tone('surface')} />
        <path d="M118 64Q200 50 282 64L280 84Q200 70 120 84Z" style={tone('accent')} />
        <path d="M124 92Q200 79 276 92" fill="none" strokeWidth={2} strokeDasharray="4 4" style={{ ...tone('surface-ink', 'stroke'), opacity: 0.4 }} />
      </>
    ),
  },
}

/** Tub, bottle or bag with a label: brand, product name, flavor and presentation. */
export function SupplementMockup({ data, label, labels, ...rest }: MockupComponentProps<SupplementMockupData>) {
  const shape = SHAPES[data.shape] ?? SHAPES.tub
  const box = shape.label
  const cx = box.x + box.w / 2
  const inner = box.w - 20
  const amount = data.presentation ?? (data.servings ? `${data.servings} ${labels.servings}` : null)
  // Long words (CREATINA MONOHIDRATADA) keep a line of their own and the font shrinks to the longest one;
  // only words that would not fit even at the minimum size are cut.
  const nameLines = wrapMockupText(data.title, 12, 3, mockupWordMax(inner, 12, 0.64))
  const nameFont = fitMockupFontSize(nameLines, inner, 26, 12, 0.64)
  const flavor = data.flavor ? wrapMockupText(data.flavor, 18, 1)[0]! : null
  const flavorW = flavor ? Math.min(inner, Array.from(flavor).length * 6.6 + 20) : 0
  const amountText = amount ? wrapMockupText(amount, 16, 1)[0]! : null
  const amountW = amountText ? Math.min(inner, Array.from(amountText).length * 7.4 + 24) : 0
  const top = box.y + (data.brand ? 46 : 30)
  const nameY = top + nameFont * 0.8
  const nameBottom = nameY + (nameLines.length - 1) * nameFont * 1.08
  const flavorY = Math.max(nameBottom + 14, box.y + box.h - 82)
  return (
    <MockupFrame kind="supplement" label={label} {...rest}>
      <ellipse cx={200} cy={364} rx={110} ry={8} style={{ ...tone('ink'), opacity: 0.1 }} />
      {shape.draw()}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={6} style={tone('label')} />
      <rect x={box.x} y={box.y} width={box.w} height={6} rx={3} style={tone('accent')} />
      {data.brand ? <MockupText lines={wrapMockupText(data.brand, 16, 1)} x={cx} y={box.y + 28} size={12} weight={700} tone="label-ink" letterSpacing={1.5} style={{ opacity: 0.68 }} /> : null}
      <MockupText lines={nameLines} x={cx} y={nameY} size={nameFont} lineHeight={1.08} weight={900} tone="label-ink" />
      {flavor ? (
        <>
          <rect x={cx - flavorW / 2} y={flavorY} width={flavorW} height={22} rx={11} style={tone('accent')} />
          <MockupText lines={[flavor]} x={cx} y={flavorY + 15} size={11.5} weight={700} tone="accent-ink" />
        </>
      ) : null}
      {amountText ? (
        <>
          <rect x={cx - amountW / 2} y={box.y + box.h - 40} width={amountW} height={26} rx={13} style={tone('surface')} />
          <MockupText lines={[amountText]} x={cx} y={box.y + box.h - 22.5} size={12.5} weight={700} tone="surface-ink" letterSpacing={1} />
        </>
      ) : null}
    </MockupFrame>
  )
}
