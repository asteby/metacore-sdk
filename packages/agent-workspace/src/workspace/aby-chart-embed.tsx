import { Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@asteby/metacore-ui'
import type { ChartKind, ChartSpec } from '../team-chat/data/types'
import { useWorkspaceHost } from '../host'

const PALETTE = [
  '#10b981',
  '#38bdf8',
  '#f59e0b',
  '#a78bfa',
  '#f43f5e',
  '#14b8a6',
]

const KIND_LABEL: Record<ChartKind, string> = {
  bar: 'Barras',
  stacked_bar: 'Apiladas',
  horizontal_bar: 'Barras H',
  line: 'Línea',
  area: 'Área',
  pie: 'Pastel',
  donut: 'Dona',
  scatter: 'Dispersión',
  radar: 'Radar',
  composed: 'Combo',
  choropleth: 'Mapa',
}

const tooltipStyle: CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
}

export function AbyChartEmbed({ spec, className }: { spec: ChartSpec; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const series = spec.series?.filter((s) => s.key) || []
  const xKey = spec.x_key || 'label'
  const rows = useMemo(() => (Array.isArray(spec.rows) ? spec.rows : []), [spec.rows])
  const kind = (spec.kind || 'bar') as ChartKind
  const fileBase = slugName(spec.title || 'grafico')
  const [atlas, setAtlas] = useState<unknown>(null)
  const MapChart = useWorkspaceHost().capabilities.MapChart

  useEffect(() => {
    if (kind !== 'choropleth') return
    const cc = spec.country_code || 'MX'
    let cancelled = false
    fetch(`/api/bi/geo/${encodeURIComponent(cc)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setAtlas(j.data ?? null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [kind, spec.country_code])

  const pieData = useMemo(() => {
    const y = series[0]?.key
    if (!y) return []
    return rows.map((r, i) => ({
      name: String(r[xKey] ?? ''),
      value: Number(r[y]) || 0,
      fill: PALETTE[i % PALETTE.length],
    }))
  }, [rows, series, xKey])

  const downloadCsv = () => {
    const headers = [xKey, ...series.map((s) => s.label || s.key)]
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [csvCell(r[xKey]), ...series.map((s) => csvCell(r[s.key]))].join(','),
      ),
    ]
    triggerDownload(new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`)
  }

  const downloadPng = async () => {
    const root = wrapRef.current
    const svg = root?.querySelector('svg')
    if (!root || !svg) return
    try {
      await svgToPng(svg, root, `${fileBase}.png`)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm',
        className,
      )}
    >
      <div className='flex items-start justify-between gap-2 border-b border-border/50 px-3 py-2'>
        <div className='min-w-0'>
          <p className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
            Gráfico · {KIND_LABEL[kind] || kind}
            {spec.unit ? ` · ${spec.unit}` : ''}
          </p>
          <p className='text-sm font-semibold leading-snug text-foreground'>{spec.title || 'Gráfico'}</p>
        </div>
        <div className='flex shrink-0 gap-1'>
          <button
            type='button'
            onClick={downloadCsv}
            className='inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            <Download className='size-3' />
            CSV
          </button>
          <button
            type='button'
            onClick={() => void downloadPng()}
            className='inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground'
          >
            <Download className='size-3' />
            PNG
          </button>
        </div>
      </div>
      <div ref={wrapRef} className={kind === 'choropleth' ? 'px-3 py-3' : 'h-56 px-1 py-2'}>
        {kind === 'choropleth' ? (
          MapChart ? <MapChart spec={spec} atlas={atlas} height={240} /> : <p className='px-2 py-6 text-center text-xs text-muted-foreground'>Mapa no disponible</p>
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            {renderChart(kind, rows, xKey, series, pieData, spec.unit)}
          </ResponsiveContainer>
        )}
      </div>
      {spec.note ? (
        <p className='border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground'>{spec.note}</p>
      ) : null}
    </div>
  )
}

function renderChart(
  kind: ChartKind,
  rows: Record<string, unknown>[],
  xKey: string,
  series: ChartSpec['series'],
  pieData: { name: string; value: number; fill: string }[],
  unit?: string,
): ReactNode {
  const yTick = (v: number) => formatTick(v, unit)
  if (kind === 'pie' || kind === 'donut') {
    const inner = kind === 'donut' ? '58%' : 0
    return (
      <PieChart>
        <Pie data={pieData} dataKey='value' nameKey='name' innerRadius={inner} outerRadius='80%' paddingAngle={1}>
          {pieData.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    )
  }
  if (kind === 'radar') {
    return (
      <RadarChart data={rows} cx='50%' cy='50%' outerRadius='70%'>
        <PolarGrid />
        <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 10 }} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} />
        {series.map((s, i) => (
          <Radar
            key={s.key}
            name={s.label || s.key}
            dataKey={s.key}
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.25}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
      </RadarChart>
    )
  }
  if (kind === 'scatter') {
    const yKey = series[0]?.key
    return (
      <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
        <XAxis dataKey={xKey} name={xKey} fontSize={11} tickLine={false} />
        <YAxis dataKey={yKey} name={series[0]?.label || yKey} fontSize={11} tickLine={false} tickFormatter={yTick} width={48} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={rows} fill={PALETTE[0]} />
      </ScatterChart>
    )
  }

  const stacked = kind === 'stacked_bar'
  const vertical = kind === 'horizontal_bar'

  if (kind === 'line') {
    return (
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        {axes(xKey, yTick, false)}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type='monotone'
            dataKey={s.key}
            name={s.label || s.key}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 2.5 }}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </LineChart>
    )
  }
  if (kind === 'area') {
    return (
      <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        {axes(xKey, yTick, false)}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type='monotone'
            dataKey={s.key}
            name={s.label || s.key}
            stroke={PALETTE[i % PALETTE.length]}
            fill={PALETTE[i % PALETTE.length]}
            fillOpacity={0.25}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </AreaChart>
    )
  }
  if (kind === 'composed') {
    return (
      <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        {axes(xKey, yTick, false)}
        {series.map((s, i) =>
          i === 0 ? (
            <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
          ) : (
            <Line
              key={s.key}
              type='monotone'
              dataKey={s.key}
              name={s.label || s.key}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
            />
          ),
        )}
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </ComposedChart>
    )
  }

  return (
    <BarChart
      data={rows}
      layout={vertical ? 'vertical' : 'horizontal'}
      margin={{ top: 8, right: 12, left: vertical ? 8 : 0, bottom: 4 }}
    >
      {axes(xKey, yTick, vertical)}
      {series.map((s, i) => (
        <Bar
          key={s.key}
          dataKey={s.key}
          name={s.label || s.key}
          fill={PALETTE[i % PALETTE.length]}
          stackId={stacked ? 'a' : undefined}
          radius={stacked ? 0 : [4, 4, 0, 0]}
        />
      ))}
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </BarChart>
  )
}

function axes(xKey: string, yTick: (v: number) => string, vertical: boolean) {
  return (
    <>
      <CartesianGrid strokeDasharray='3 3' className='stroke-border' />
      {vertical ? (
        <>
          <XAxis type='number' fontSize={11} tickLine={false} axisLine={false} tickFormatter={yTick} />
          <YAxis type='category' dataKey={xKey} width={72} fontSize={11} tickLine={false} axisLine={false} />
        </>
      ) : (
        <>
          <XAxis dataKey={xKey} fontSize={11} tickLine={false} axisLine={false} interval={0} />
          <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={yTick} />
        </>
      )}
      <Tooltip contentStyle={tooltipStyle} />
    </>
  )
}

function formatTick(v: number, unit?: string) {
  const n = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v * 100) / 100)
  return unit && unit.length <= 4 ? `${n}` : n
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function slugName(s: string): string {
  const t = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return t || 'grafico'
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

async function svgToPng(svg: SVGSVGElement, surface: HTMLElement, filename: string) {
  const box = svg.getBoundingClientRect()
  const w = Math.max(1, Math.round(box.width) || 640)
  const h = Math.max(1, Math.round(box.height) || 280)
  const clone = prepareSvgClone(svg, w, h)
  const xml = new XMLSerializer().serializeToString(clone)
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('png'))
    img.src = url
  })
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)
  ctx.fillStyle = canvasFill(surface)
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  await new Promise<void>((resolve) => {
    canvas.toBlob((b) => {
      if (b) triggerDownload(b, filename)
      resolve()
    }, 'image/png')
  })
}

function canvasFill(el: HTMLElement): string {
  let node: HTMLElement | null = el
  while (node) {
    const bg = getComputedStyle(node).backgroundColor
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg
    node = node.parentElement
  }
  return '#111827'
}

function prepareSvgClone(svg: SVGSVGElement, w: number, h: number): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  const srcNodes = [svg, ...Array.from(svg.querySelectorAll('*'))]
  const dstNodes = [clone, ...Array.from(clone.querySelectorAll('*'))]
  for (let i = 0; i < srcNodes.length && i < dstNodes.length; i++) {
    const cs = getComputedStyle(srcNodes[i])
    const dest = dstNodes[i] as SVGElement
    const fill = cs.fill
    const stroke = cs.stroke
    if (fill && fill !== 'none') dest.setAttribute('fill', fill)
    if (stroke && stroke !== 'none') dest.setAttribute('stroke', stroke)
    if (cs.strokeWidth && cs.strokeWidth !== '0px') dest.setAttribute('stroke-width', cs.strokeWidth)
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
      dest.setAttribute('stroke-dasharray', cs.strokeDasharray)
    }
    if (cs.opacity && cs.opacity !== '1') dest.setAttribute('opacity', cs.opacity)
    if (cs.fillOpacity && cs.fillOpacity !== '1') dest.setAttribute('fill-opacity', cs.fillOpacity)
    const tag = dest.tagName.toLowerCase()
    if (tag === 'text' || tag === 'tspan') {
      dest.setAttribute('font-size', cs.fontSize)
      dest.setAttribute('font-family', cs.fontFamily.split(',')[0]?.trim() || 'sans-serif')
      dest.setAttribute('font-weight', cs.fontWeight)
      if (fill && fill !== 'none') dest.setAttribute('fill', fill)
    }
    dest.removeAttribute('class')
  }
  return clone
}
