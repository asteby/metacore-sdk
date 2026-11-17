import { useId, useMemo } from 'react'
import { cn } from '@asteby/metacore-ui'
import type { GenUIBlockRendererProps } from './registry'
import { TEXT_TONE } from './generative-ui'
import type { Tone } from './types'

interface DNode {
  id: string
  label: unknown
  kind?: string
  tone?: Tone
  detail?: string
  route?: Record<string, unknown>
}
interface DEdge {
  from: string
  to: string
  label?: unknown
  tone?: Tone
  style?: 'solid' | 'dashed'
}

const NW = 156
const NH = 48
const GX = 72
const GY = 28
const PAD = 16

/**
 * Automatic layered layout (longest-path layering, tolerant to cycles, one
 * barycenter pass to reduce crossings). Pure and deterministic: same spec,
 * same picture. Returns node centres in SVG units.
 */
export function layoutDiagram(nodes: Pick<DNode, 'id'>[], edges: Pick<DEdge, 'from' | 'to'>[], direction: 'lr' | 'tb' = 'lr') {
  const n = nodes.length
  const layer = new Map(nodes.map((x) => [x.id, 0]))
  for (let pass = 0; pass < n; pass++) {
    let changed = false
    for (const e of edges) {
      if (e.from === e.to) continue
      const next = (layer.get(e.from) ?? 0) + 1
      if (next < n && next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next)
        changed = true
      }
    }
    if (!changed) break
  }
  const cols: string[][] = []
  for (const x of nodes) (cols[layer.get(x.id)!] ??= []).push(x.id)
  const pos = new Map<string, number>()
  cols.forEach((c) => c?.forEach((id, i) => pos.set(id, i)))
  for (let l = 1; l < cols.length; l++) {
    const col = cols[l]
    if (!col) continue
    const bary = (id: string) => {
      const ps = edges.filter((e) => e.to === id && (layer.get(e.from) ?? 0) < l).map((e) => pos.get(e.from) ?? 0)
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : pos.get(id)!
    }
    col.sort((a, b) => bary(a) - bary(b) || pos.get(a)! - pos.get(b)!)
    col.forEach((id, i) => pos.set(id, i))
  }
  const centers = new Map<string, { x: number; y: number }>()
  let maxMain = 0
  let maxCross = 0
  cols.forEach((col, l) => {
    col?.forEach((id, i) => {
      const main = PAD + l * ((direction === 'lr' ? NW : NH) + (direction === 'lr' ? GX : GY * 2)) + (direction === 'lr' ? NW : NH) / 2
      const cross = PAD + i * ((direction === 'lr' ? NH : NW) + (direction === 'lr' ? GY : GX / 2)) + (direction === 'lr' ? NH : NW) / 2
      centers.set(id, direction === 'lr' ? { x: main, y: cross } : { x: cross, y: main })
      maxMain = Math.max(maxMain, main)
      maxCross = Math.max(maxCross, cross)
    })
  })
  const w = (direction === 'lr' ? maxMain + NW / 2 : maxCross + NW / 2) + PAD
  const h = (direction === 'lr' ? maxCross + NH / 2 : maxMain + NH / 2) + PAD
  return { centers, width: w, height: h }
}

function edgePoint(from: { x: number; y: number }, to: { x: number; y: number }) {
  // Intersection of the segment with the node rectangle around `from`.
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return from
  const k = Math.min(dx === 0 ? Infinity : NW / 2 / Math.abs(dx), dy === 0 ? Infinity : NH / 2 / Math.abs(dy))
  return { x: from.x + dx * k, y: from.y + dy * k }
}

const radius = (kind?: string) => (kind === 'database' ? 22 : kind === 'queue' ? 24 : kind === 'user' ? 24 : kind === 'group' ? 4 : 8)

/** `diagram` block: closed nodes+edges spec drawn as SVG text (never HTML, never mermaid). */
export function DiagramBlock({ block, text, navigate, act }: GenUIBlockRendererProps) {
  const uid = useId()
  const nodes = block.nodes as DNode[]
  const edges = (block.edges ?? []) as DEdge[]
  const direction = block.direction === 'tb' ? 'tb' : 'lr'
  const { centers, width, height } = useMemo(() => layoutDiagram(nodes, edges, direction), [nodes, edges, direction])
  const open = (n: DNode) => {
    const path = n.route?.path
    if (typeof path === 'string') navigate(path)
    else if (n.route) act({ action: { do: 'navigate', route: n.route }, blockId: block.id, context: { node: n.id } })
  }
  return (
    <figure className='m-0 w-full' data-genui-block='diagram'>
      {block.title ? <figcaption className='mb-1 text-xs font-medium text-muted-foreground'>{text(block.title)}</figcaption> : null}
      <div className='w-full overflow-auto rounded-lg border bg-card'>
        <svg role='img' aria-label={block.summary} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className='block max-w-none'>
          <defs>
            <marker id={`${uid}-arrow`} viewBox='0 0 10 10' refX='9' refY='5' markerWidth='7' markerHeight='7' orient='auto-start-reverse'>
              <path d='M0,0 L10,5 L0,10 z' fill='currentColor' />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = centers.get(e.from)
            const b = centers.get(e.to)
            if (!a || !b) return null
            const p1 = edgePoint(a, b)
            const p2 = edgePoint(b, a)
            return (
              <g key={i} className={cn(TEXT_TONE[e.tone ?? 'muted'])}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke='currentColor' strokeWidth={1.5} strokeDasharray={e.style === 'dashed' ? '5 4' : undefined} markerEnd={`url(#${uid}-arrow)`} />
                {e.label ? (
                  <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 4} textAnchor='middle' fontSize={11} className='fill-muted-foreground'>
                    {text(e.label)}
                  </text>
                ) : null}
              </g>
            )
          })}
          {nodes.map((n) => {
            const c = centers.get(n.id)!
            const clickable = !!n.route
            return (
              <g
                key={n.id}
                transform={`translate(${c.x - NW / 2},${c.y - NH / 2})`}
                className={cn(TEXT_TONE[n.tone ?? 'default'], clickable && 'cursor-pointer outline-none focus-visible:[&>rect]:stroke-[3]')}
                role={clickable ? 'link' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? `${text(n.label)}${n.tone ? ` (${n.tone})` : ''}` : undefined}
                onClick={clickable ? () => open(n) : undefined}
                onKeyDown={clickable ? (ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), open(n)) : undefined}
              >
                {n.detail ? <title>{n.detail}</title> : null}
                <rect width={NW} height={NH} rx={radius(n.kind)} className='fill-card' stroke='currentColor' strokeWidth={n.tone && n.tone !== 'default' ? 2 : 1.25} />
                <text x={NW / 2} y={n.kind && n.kind !== 'generic' ? 20 : 29} textAnchor='middle' fontSize={13} fontWeight={600} className='fill-foreground'>
                  {clip(text(n.label), 20)}
                </text>
                {n.kind && n.kind !== 'generic' ? (
                  <text x={NW / 2} y={36} textAnchor='middle' fontSize={9.5} letterSpacing={0.6} className='fill-muted-foreground'>
                    {n.kind.toUpperCase()}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>
      <ul className='sr-only'>
        {nodes.map((n) => (
          <li key={n.id}>
            {text(n.label)}
            {n.kind ? `, ${n.kind}` : ''}
            {n.tone && n.tone !== 'default' ? `, ${n.tone}` : ''}
            {n.detail ? `: ${n.detail}` : ''}
          </li>
        ))}
        {edges.map((e, i) => (
          <li key={`e${i}`}>
            {e.from} → {e.to}
            {e.label ? `: ${text(e.label)}` : ''}
          </li>
        ))}
      </ul>
    </figure>
  )
}

const clip = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n - 1).join('')}…` : s)
