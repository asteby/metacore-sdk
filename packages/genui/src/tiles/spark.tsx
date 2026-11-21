import { useId } from 'react'
import { cn } from '@asteby/metacore-ui'
import { toneColor, type TileTone } from './tone-css'

const W = 120
const H = 36
const PAD = 3

/** Geometria pura de una serie (solo valores finitos). Serie plana: linea al centro. */
export function sparkGeometry(data: ReadonlyArray<number>, w = W, h = H, pad = PAD): { points: Array<[number, number]>; line: string; area: string } {
  const v = data.filter((n) => typeof n === 'number' && Number.isFinite(n))
  if (v.length === 0) return { points: [], line: '', area: '' }
  const min = Math.min(...v)
  const span = Math.max(...v) - min
  const r = (n: number) => Math.round(n * 100) / 100
  const points = v.map((n, i): [number, number] => [r(v.length === 1 ? w / 2 : pad + ((w - pad * 2) * i) / (v.length - 1)), r(span === 0 ? h / 2 : pad + (h - pad * 2) * (1 - (n - min) / span))])
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
  const first = points[0]!
  const last = points[points.length - 1]!
  return { points, line, area: `${line} L${last[0]} ${h - pad} L${first[0]} ${h - pad} Z` }
}

export interface TrendSparkProps {
  data: ReadonlyArray<number>
  tone?: TileTone
  /** Con `label` es una imagen con nombre; sin el, decorativa (`aria-hidden`). */
  label?: string
  /** Alto en px (el ancho es fluido). */
  height?: number
  className?: string
}

/**
 * Mini-grafica de tendencia, SVG puro: tinta recesiva para la serie y el acento del tono solo en el
 * ultimo tramo y el punto final (el periodo actual). Ancho fluido y alto fijo: no mueve el layout.
 */
export function TrendSpark({ data, tone = 'primary', label, height = 40, className }: TrendSparkProps) {
  const uid = useId().replace(/:/g, '')
  const g = sparkGeometry(data)
  if (g.points.length < 2) return null
  const color = toneColor(tone)
  const tail = g.points.slice(-Math.max(2, Math.ceil(g.points.length / 4)))
  const last = g.points[g.points.length - 1]!
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <div className={cn('relative w-full', className)} style={{ height }} data-genui-block='spark' {...a11y}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio='none' className='h-full w-full overflow-visible'>
        <defs>
          <linearGradient id={`${uid}-a`} x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor={color} stopOpacity={0.2} />
            <stop offset='100%' stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={g.area} fill={`url(#${uid}-a)`} />
        <path d={g.line} fill='none' stroke='var(--muted-foreground)' strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin='round' strokeLinecap='round' vectorEffect='non-scaling-stroke' />
        <path d={tail.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')} fill='none' stroke={color} strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' vectorEffect='non-scaling-stroke' />
      </svg>
      {/* Punto final fuera del SVG: con preserveAspectRatio='none' un circulo SVG se estira en elipse. */}
      <span className='absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2' style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%`, background: color, borderColor: 'var(--card, var(--background))' }} />
    </div>
  )
}
