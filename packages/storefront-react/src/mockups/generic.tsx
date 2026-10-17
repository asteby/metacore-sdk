import type { GenericMockupData } from '@asteby/storefront/mockup'
import { MockupFrame, MockupText, fitMockupFontSize, tone, wrapMockupText } from './frame.js'
import type { MockupComponentProps } from './types.js'

/** Closed box with the product monogram, the brand on the box and the name below. */
export function GenericMockup({ data, label, labels: _labels, ...rest }: MockupComponentProps<GenericMockupData>) {
  const titleLines = wrapMockupText(data.title, 28, 2)
  const titleFont = fitMockupFontSize(titleLines, 330, 22, 13)
  const titleY = titleLines.length > 1 ? 340 : 352
  const eyebrow = data.category ? wrapMockupText(data.category, 30, 1) : []
  return (
    <MockupFrame kind="generic" label={label} {...rest}>
      <ellipse cx={200} cy={300} rx={130} ry={8} style={{ ...tone('ink'), opacity: 0.08 }} />
      <path d="M90 82L114 64H330L306 82Z" style={tone('accent')} />
      <path d="M306 82L330 64V280L306 298Z" style={tone('surface')} />
      <path d="M306 82L330 64V280L306 298Z" style={{ fill: '#000', opacity: 0.22 }} />
      <rect x={90} y={82} width={216} height={216} style={tone('surface')} />
      <rect x={186} y={82} width={24} height={46} style={{ ...tone('accent'), opacity: 0.9 }} />
      <circle cx={198} cy={186} r={50} style={tone('label')} />
      {data.monogram ? <MockupText lines={[data.monogram]} x={198} y={202} size={44} weight={900} tone="label-ink" letterSpacing={1} /> : null}
      {data.brand ? <MockupText lines={wrapMockupText(data.brand, 20, 1)} x={198} y={272} size={13} weight={700} tone="surface-ink" letterSpacing={2} /> : null}
      {eyebrow.length > 0 && titleLines.length < 2 ? <MockupText lines={eyebrow} x={200} y={326} size={12} weight={600} tone="muted" letterSpacing={1} /> : null}
      <MockupText lines={titleLines} x={200} y={titleY} size={titleFont} lineHeight={1.2} weight={700} />
    </MockupFrame>
  )
}
