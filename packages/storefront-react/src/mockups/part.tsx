import type { PartMockupData } from '@asteby/storefront/mockup'
import { MockupFrame, MockupText, fitMockupFontSize, tone, wrapMockupText } from './frame.js'
import type { MockupComponentProps } from './types.js'

const X = 48
const W = 304
const PAD = 24
const INNER = W - PAD * 2
const SECONDARY = { opacity: 0.68 }

/** Hang tag ("ficha") with the part number in a band, the name and the compatibility. */
export function PartMockup({ data, label, labels, ...rest }: MockupComponentProps<PartMockupData>) {
  const number = data.partNumber ?? data.oemNumber
  const numberCaption = data.partNumber ? labels.partNumber : labels.oem
  const bandLines = number ? [number] : wrapMockupText(data.title, 22, 2)
  const bandFont = number ? fitMockupFontSize(bandLines, INNER, 34, 14, 0.62) : fitMockupFontSize(bandLines, INNER, 24, 14)
  const header = data.brand ?? data.category
  const headerAside = data.brand ? (data.position ?? data.category) : data.position

  // Body lines below the band, laid out top-down until the tag ends.
  const body: { lines: string[]; size: number; secondary?: boolean; weight: number; mono?: boolean }[] = []
  if (number) body.push({ lines: wrapMockupText(data.title, 26, 2), size: 17, weight: 700 })
  if (data.fitment) body.push({ lines: wrapMockupText(`${labels.fits}: ${data.fitment}`, 34, 2), size: 13, secondary: true, weight: 500 })
  if (data.partNumber && data.oemNumber) body.push({ lines: [`${labels.oem} ${data.oemNumber}`], size: 13, secondary: true, weight: 600, mono: true })
  let y = 248
  const placed: ((typeof body)[number] & { y: number })[] = []
  for (const b of body) {
    const at = y + b.size
    const room = Math.floor((330 - at) / (b.size * 1.2)) + 1
    if (room < 1 || !b.lines.length) continue
    const lines = b.lines.length > room ? [...b.lines.slice(0, room - 1), b.lines[room - 1]!.replace(/[\s.,;:…-]*$/, '…')] : b.lines
    placed.push({ ...b, lines, y: at })
    y = at + (lines.length - 1) * b.size * 1.2 + 10
  }

  return (
    <MockupFrame kind="part" label={label} {...rest}>
      <path d="M78 98 C60 52 36 46 14 30" fill="none" strokeWidth={2} strokeLinecap="round" style={tone('muted', 'stroke')} />
      <rect x={X} y={66} width={W} height={276} rx={18} style={tone('label')} />
      <rect x={X + 0.75} y={66.75} width={W - 1.5} height={274.5} rx={17.25} fill="none" strokeWidth={1.5} style={{ ...tone('muted', 'stroke'), opacity: 0.3 }} />
      <circle cx={80} cy={98} r={9} style={tone('bg')} />
      <circle cx={80} cy={98} r={9} fill="none" strokeWidth={1.5} style={{ ...tone('muted', 'stroke'), opacity: 0.5 }} />
      {header ? <MockupText lines={wrapMockupText(header, headerAside ? 14 : 22, 1)} x={104} y={104} size={16} weight={800} tone="label-ink" anchor="start" letterSpacing={0.5} /> : null}
      {headerAside ? <MockupText lines={wrapMockupText(headerAside, header ? 14 : 22, 1)} x={X + W - PAD} y={104} size={12} weight={600} tone="label-ink" anchor="end" style={SECONDARY} /> : null}
      <rect x={X} y={128} width={W} height={92} style={tone('accent')} />
      {number ? (
        <>
          <MockupText lines={[numberCaption]} x={X + PAD} y={154} size={12} weight={600} tone="accent-ink" anchor="start" letterSpacing={1} style={{ opacity: 0.85 }} />
          <MockupText lines={bandLines} x={X + PAD} y={198} size={bandFont} weight={800} tone="accent-ink" anchor="start" mono />
        </>
      ) : (
        <MockupText lines={bandLines} x={X + PAD} y={bandLines.length > 1 ? 168 : 182} size={bandFont} weight={800} tone="accent-ink" anchor="start" />
      )}
      {placed.map((b, i) => (
        <MockupText key={i} lines={b.lines} x={X + PAD} y={b.y} size={b.size} lineHeight={1.2} weight={b.weight} tone="label-ink" anchor="start" mono={b.mono} style={b.secondary ? SECONDARY : undefined} />
      ))}
    </MockupFrame>
  )
}
