import type { TireMockupData } from '@asteby/storefront/mockup'
import { MockupFrame, MockupText, fitMockupFontSize, tone, wrapMockupText } from './frame.js'
import type { MockupComponentProps } from './types.js'

const CX = 200
const CY = 146

/** Tire seen from the side (tread blocks on the edge) with the size in big digits. Shows only what the data has. */
export function TireMockup({ data, label, labels, ...rest }: MockupComponentProps<TireMockupData>) {
  const split = data.width && data.aspect && data.rim
  const headline = split ? `${data.width}/${data.aspect} R${data.rim}` : data.size
  const sizeFont = headline ? fitMockupFontSize([headline], 330, 46, 22, 0.6) : 0
  const titleLines = headline ? [] : wrapMockupText(data.model ?? data.title, 24, 2)
  const titleFont = fitMockupFontSize(titleLines, 320, 26, 14)
  const extras = [data.lightTruck && !(headline ?? '').toUpperCase().startsWith(labels.lightTruck.toUpperCase()) ? labels.lightTruck : null, data.runFlat ? labels.runFlat : null].filter(Boolean).join(' · ')
  const footer = [headline ? data.model : null, extras || null].filter(Boolean).join(' · ')
  return (
    <MockupFrame kind="tire" label={label} {...rest}>
      <ellipse cx={CX} cy={CY + 128} rx={120} ry={8} style={{ ...tone('ink'), opacity: 0.08 }} />
      {/* rubber, tread blocks, sidewall ring */}
      <circle cx={CX} cy={CY} r={102} fill="none" strokeWidth={52} style={tone('surface', 'stroke')} />
      <circle cx={CX} cy={CY} r={124} fill="none" strokeWidth={8} strokeDasharray="8 9" style={tone('bg', 'stroke')} />
      <circle cx={CX} cy={CY} r={111} fill="none" strokeWidth={1.5} strokeDasharray="3 5" style={{ ...tone('surface-ink', 'stroke'), opacity: 0.35 }} />
      <circle cx={CX} cy={CY} r={86} fill="none" strokeWidth={1.5} style={{ ...tone('surface-ink', 'stroke'), opacity: 0.25 }} />
      {/* rim with five windows and hub */}
      <circle cx={CX} cy={CY} r={74} style={tone('muted')} />
      <circle cx={CX} cy={CY} r={45} fill="none" strokeWidth={36} strokeDasharray="36 20.5" style={tone('surface', 'stroke')} />
      <circle cx={CX} cy={CY} r={20} style={tone('label')} />
      <circle cx={CX} cy={CY} r={11} fill="none" strokeWidth={4} strokeDasharray="2.5 11.3" style={tone('muted', 'stroke')} />
      {data.brand ? (
        <MockupText lines={[data.brand]} x={CX} y={302} size={15} weight={700} tone="muted" letterSpacing={2} />
      ) : null}
      {headline ? (
        <text x={CX} y={346} fontSize={sizeFont} fontWeight={800} textAnchor="middle" style={tone('ink')}>
          {split ? (
            <>
              {`${data.width}/${data.aspect} `}
              <tspan style={tone('accent')}>{`R${data.rim}`}</tspan>
            </>
          ) : (
            headline
          )}
        </text>
      ) : (
        <MockupText lines={titleLines} x={CX} y={titleLines.length > 1 ? 330 : 342} size={titleFont} weight={700} />
      )}
      {footer || data.service ? (
        <text x={CX} y={380} fontSize={15} fontWeight={600} textAnchor="middle" style={tone('muted')}>
          {data.service ? (
            <tspan fontWeight={800} style={tone('accent')}>
              {data.service}
            </tspan>
          ) : null}
          {data.service && footer ? ' · ' : null}
          {wrapMockupText(footer, data.service ? 34 : 40, 1)[0]}
        </text>
      ) : null}
    </MockupFrame>
  )
}
