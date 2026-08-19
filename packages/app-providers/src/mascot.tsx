// AI copilot mascot: one SVG component, many declarative "skins". A skin is a
// palette + tooth-shape config, not a component — adding a vertical's mascot
// (new name, new colors) never requires new component code, only a new
// registry entry (or an org-level `mascot_skin` string that resolves here).
//
// States mirror the copilot's own conversation-phase state machine (see the
// consuming app's live-think-stage store) so the mascot's face always reflects
// what the agent is actually doing, not a decorative loop.
import { useEffect, type CSSProperties } from 'react'

export type MascotState =
  | 'idle'
  | 'thinking'
  | 'processing'
  | 'listening'
  | 'speaking'
  | 'happy'
  | 'error'

export interface MascotSkin {
  /** Display name shown alongside the mascot (e.g. "Aby", "Llantonio"). */
  name: string
  /** Tooth shape around the body: fine dashed tire tread, or 6 rounded gear teeth. */
  toothShape: 'tire-tread' | 'gear-teeth'
  /** Whether to draw the small antenna/status LED above the body. */
  antenna: boolean
  /** Face screen tone: a light panel, or a dark glass panel. */
  screenTone: 'light' | 'dark'
  colors: {
    tire: string
    treadOrTooth: string
    accent: string
    glow: string
    screen: string
    screenCenter: string
  }
}

// Registry of built-in skins. Extend this object to onboard a new vertical —
// nothing else in this file changes. Unknown `skin` keys passed to <Mascot>
// fall back to `gear-lime` so a misconfigured org never renders blank.
export const MASCOT_SKINS: Record<string, MascotSkin> = {
  'gear-lime': {
    name: 'Aby',
    toothShape: 'gear-teeth',
    antenna: false,
    screenTone: 'dark',
    colors: {
      tire: '#20261b',
      treadOrTooth: '#4d5740',
      accent: '#84cc16',
      glow: '#bef264',
      screen: '#0a0d07',
      screenCenter: '#1b2016',
    },
  },
  'tire-red': {
    name: 'Llantonio',
    toothShape: 'tire-tread',
    antenna: true,
    screenTone: 'dark',
    colors: {
      tire: '#17171b',
      treadOrTooth: '#232328',
      accent: '#e2172a',
      glow: '#ff5b63',
      screen: '#0d0a0b',
      screenCenter: '#1f1518',
    },
  },
}

const STYLE_TAG_ID = 'metacore-mascot-styles'

/** Injects MASCOT_CSS into <head> exactly once per document, so consuming
 * apps get working animations for free — no manual wiring required. */
function useMascotStyles() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById(STYLE_TAG_ID)) return
    const tag = document.createElement('style')
    tag.id = STYLE_TAG_ID
    tag.textContent = MASCOT_CSS
    document.head.appendChild(tag)
  }, [])
}

const DEFAULT_SKIN_KEY = 'gear-lime'
const DEFAULT_SKIN: MascotSkin = MASCOT_SKINS[DEFAULT_SKIN_KEY]!

function resolveSkin(key: string | undefined): MascotSkin {
  return (key && MASCOT_SKINS[key]) || DEFAULT_SKIN
}

export interface MascotProps {
  /** Key into MASCOT_SKINS (e.g. org's `mascot_skin` branding field). */
  skin?: string
  state?: MascotState
  size?: number
  className?: string
  style?: CSSProperties
}

function GearTeeth({ fill }: { fill: string }) {
  const angles = [0, 60, 120, 180, 240, 300]
  return (
    <g className="mascot-tread">
      {angles.map((a) => (
        <rect
          key={a}
          x="87"
          y="54"
          width="26"
          height="20"
          rx="6"
          fill={fill}
          transform={a === 0 ? undefined : `rotate(${a} 100 130)`}
        />
      ))}
    </g>
  )
}

function TireTread({ stroke }: { stroke: string }) {
  // r=69, strokeWidth=10 → inner edge at r≈64, flush against the tire body
  // circle (r=63) with a hair of overlap. Was r=76: its inner edge (r≈71)
  // sat 8 units outside the body, showing a gap of bare background between
  // the dashed tread and the tire — "floating lugs" disconnected from the
  // wheel, most visible in a small icon-sized render.
  return (
    <g className="mascot-tread" opacity={0.9}>
      <circle cx="100" cy="130" r="69" fill="none" stroke={stroke} strokeWidth="10" strokeDasharray="6 7" />
    </g>
  )
}

/** Eyes/mouth shared by idle, happy and speaking — same geometry everywhere so
 * switching state never changes the mascot's basic proportions. */
function CurvedEyes({ accent, glowId, className }: { accent: string; glowId: string; className?: string }) {
  return (
    <g className={className} stroke={accent} strokeWidth="4" strokeLinecap="round" fill="none" filter={`url(#${glowId})`}>
      <path d="M78 122 Q86 112 94 122" />
      <path d="M106 122 Q114 112 122 122" />
    </g>
  )
}

function SmileMouth({ accent, glowId }: { accent: string; glowId: string }) {
  return (
    <path
      d="M82 143 Q100 156 118 143"
      stroke={accent}
      strokeWidth="4"
      strokeLinecap="round"
      fill="none"
      filter={`url(#${glowId})`}
    />
  )
}

function EqualizerBars({ accent, className }: { accent: string; className?: string }) {
  const xs = [0, 9, 18, 27, 36]
  return (
    <g transform="translate(80,148)" fill={accent}>
      {xs.map((x, i) => (
        <rect
          key={x}
          className={className}
          x={x}
          y="-10"
          width="4"
          height="20"
          rx="2"
          style={{ transformOrigin: `${x + 2}px 0px`, animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </g>
  )
}

/**
 * `<Mascot skin="gear-lime" state="thinking" />`
 *
 * Renders the animated copilot avatar. Purely presentational: the caller owns
 * mapping its own agent/conversation phase to `state`.
 */
export function Mascot({
  skin = DEFAULT_SKIN_KEY,
  state = 'idle',
  size = 120,
  className,
  style,
}: MascotProps) {
  useMascotStyles()
  const cfg = resolveSkin(skin)
  const uid = `mascot-${skin}`
  const glowId = `${uid}-glow`
  const gradId = `${uid}-grad`
  const { colors } = cfg

  // The drawn tire/gear body always spans x:24-176 / y:54-206 (152x152).
  // The antenna, when present, extends the top edge up to ~y:33. Cropping
  // per-skin (rather than one fixed box sized for the antenna) keeps a
  // no-antenna skin (e.g. Aby/gear-lime) from sitting in a box with ~30px
  // of dead space above it — which reads as "stuck to the bottom".
  const viewBox = cfg.antenna ? '20 28 160 182' : '20 50 160 160'
  const aspect = cfg.antenna ? 182 / 160 : 1

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size * aspect}
      fill="none"
      className={className}
      style={{ overflow: 'visible', ...style }}
      role="img"
      aria-label={cfg.name}
    >
      <defs>
        <radialGradient id={gradId} cx="42%" cy="35%" r="75%">
          <stop offset="0%" stopColor={colors.screenCenter} />
          <stop offset="100%" stopColor={colors.screen} />
        </radialGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="mascot-bot" style={{ transformOrigin: '100px 130px' }}>
        {cfg.antenna && (
          <g className="mascot-antenna">
            <rect x="97" y="42" width="6" height="16" rx="3" fill={colors.tire} stroke={colors.treadOrTooth} strokeWidth="1" />
            <circle className="mascot-antenna-tip" cx="100" cy="38" r="4.5" fill={colors.accent} />
          </g>
        )}

        {cfg.toothShape === 'gear-teeth' ? (
          <GearTeeth fill={colors.treadOrTooth} />
        ) : (
          <TireTread stroke={colors.treadOrTooth} />
        )}
        <circle cx="100" cy="130" r="63" fill={colors.tire} />

        <circle cx="100" cy="130" r="52" fill={`url(#${gradId})`} />
        <circle
          cx="100"
          cy="130"
          r="52"
          fill="none"
          stroke={colors.accent}
          strokeWidth="1.6"
          opacity={0.75}
          filter={`url(#${glowId})`}
        />

        {state === 'idle' && (
          <g>
            <CurvedEyes accent={colors.accent} glowId={glowId} className="mascot-eye-idle" />
            <SmileMouth accent={colors.accent} glowId={glowId} />
          </g>
        )}

        {state === 'happy' && (
          <g>
            <CurvedEyes accent={colors.accent} glowId={glowId} />
            <SmileMouth accent={colors.accent} glowId={glowId} />
            <g className="mascot-spark" stroke={colors.glow} strokeWidth="2" strokeLinecap="round">
              <path d="M62 100 L62 92 M58 96 L66 96" />
            </g>
            <g className="mascot-spark" style={{ animationDelay: '.4s' }} stroke={colors.glow} strokeWidth="2" strokeLinecap="round">
              <path d="M138 108 L138 102 M135 105 L141 105" />
            </g>
          </g>
        )}

        {state === 'thinking' && (
          <g>
            <g className="mascot-think-brow" stroke={colors.accent} strokeWidth="4" strokeLinecap="round">
              <path d="M74 108 L94 104" />
            </g>
            <line x1="106" y1="118" x2="126" y2="118" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" opacity={0.8} />
            <g className="mascot-think-pupil">
              <circle cx="84" cy="122" r="6" fill={colors.accent} filter={`url(#${glowId})`} />
            </g>
            <path d="M84 146 Q100 141 116 146" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" fill="none" opacity={0.85} />
            <g fill={colors.accent}>
              <circle className="mascot-think-dot" cx="88" cy="164" r="3" />
              <circle className="mascot-think-dot" cx="100" cy="164" r="3" style={{ animationDelay: '.18s' }} />
              <circle className="mascot-think-dot" cx="112" cy="164" r="3" style={{ animationDelay: '.36s' }} />
            </g>
          </g>
        )}

        {state === 'processing' && (
          <g>
            <g transform="translate(100,112)">
              <circle r="16" fill="none" stroke={colors.accent} strokeWidth="2.6" opacity={0.18} />
              <path
                className="mascot-ring-arc"
                d="M0 -16 A16 16 0 0 1 13.9 -8"
                stroke={colors.accent}
                strokeWidth="2.6"
                strokeLinecap="round"
                fill="none"
                filter={`url(#${glowId})`}
                style={{ transformOrigin: '0px 0px' }}
              />
            </g>
            <g transform="translate(58,130)">
              <rect className="mascot-scan-line" x="0" y="-1" width="84" height="2" rx="1" fill={colors.glow} filter={`url(#${glowId})`} />
            </g>
            <EqualizerBars accent={colors.accent} className="mascot-proc-bar" />
          </g>
        )}

        {state === 'listening' && (
          <g>
            <g fill="none" stroke={colors.glow}>
              <circle className="mascot-listen-ring" cx="100" cy="112" r="16" strokeWidth="2" />
              <circle className="mascot-listen-ring" cx="100" cy="112" r="16" strokeWidth="2" style={{ animationDelay: '.6s' }} />
            </g>
            <g fill={colors.accent} filter={`url(#${glowId})`}>
              <rect x="94" y="98" width="12" height="19" rx="6" />
              <path d="M89 110 a11 11 0 0 0 22 0" fill="none" stroke={colors.accent} strokeWidth="3" strokeLinecap="round" />
              <line x1="100" y1="121" x2="100" y2="128" stroke={colors.accent} strokeWidth="3" strokeLinecap="round" />
              <line x1="92" y1="128" x2="108" y2="128" stroke={colors.accent} strokeWidth="3" strokeLinecap="round" />
            </g>
            <path d="M82 149 Q100 162 118 149" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" fill="none" />
          </g>
        )}

        {state === 'speaking' && (
          <g>
            <CurvedEyes accent={colors.accent} glowId={glowId} />
            <EqualizerBars accent={colors.accent} className="mascot-voice-bar" />
          </g>
        )}

        {state === 'error' && (
          <g>
            <g className="mascot-err-blink" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" filter={`url(#${glowId})`}>
              <path d="M80 115 L92 127 M92 115 L80 127" />
              <path d="M108 115 L120 127 M120 115 L108 127" />
            </g>
            <path d="M82 149 Q100 138 118 149" stroke={colors.accent} strokeWidth="4" strokeLinecap="round" fill="none" />
          </g>
        )}
      </g>
    </svg>
  )
}

/**
 * Resolve the display name for a mascot skin, preferring an explicit org
 * override (branding.mascot_name) over the skin's own default.
 */
export function resolveMascotName(skin: string | undefined, override: string | undefined): string {
  if (override && override.trim()) return override
  const cfg = resolveSkin(skin)
  return cfg.name
}

export const MASCOT_CSS = `
@keyframes mascot-bob { 0%,100%{ transform: translateY(0) rotate(0deg); } 50%{ transform: translateY(-4px) rotate(.4deg); } }
.mascot-bot{ animation: mascot-bob 3.6s ease-in-out infinite; }

@keyframes mascot-sway { 0%,100%{ transform: rotate(-2deg); } 50%{ transform: rotate(2.5deg); } }
.mascot-antenna{ transform-origin: 100px 40px; animation: mascot-sway 3.6s ease-in-out infinite; }
@keyframes mascot-tipglow { 0%,100%{ opacity:.75; } 50%{ opacity:1; } }
.mascot-antenna-tip{ animation: mascot-tipglow 2.4s ease-in-out infinite; }

@keyframes mascot-treadspin { to{ transform: rotate(360deg); } }
.mascot-tread{ animation: mascot-treadspin 40s linear infinite; transform-origin: 100px 130px; }

@keyframes mascot-blink { 0%, 92%, 100%{ transform: scaleY(1); } 95%{ transform: scaleY(.12); } }
.mascot-eye-idle{ animation: mascot-blink 5.5s ease-in-out infinite; transform-origin: center; }

@keyframes mascot-sparkle { 0%,100%{ opacity:0; transform: scale(.4) rotate(0deg); } 50%{ opacity:1; transform: scale(1) rotate(25deg); } }
.mascot-spark{ animation: mascot-sparkle 1.1s ease-in-out infinite; }

@keyframes mascot-scan { 0%,100%{ transform: translateX(-7px); } 50%{ transform: translateX(7px); } }
.mascot-think-pupil{ animation: mascot-scan 2.8s ease-in-out infinite; }
@keyframes mascot-raise { 0%,100%{ transform: translateY(0) rotate(0deg); } 50%{ transform: translateY(-2px) rotate(-4deg); } }
.mascot-think-brow{ animation: mascot-raise 2.8s ease-in-out infinite; }
@keyframes mascot-dotpulse { 0%,60%,100%{ opacity:.25; transform:translateY(0); } 30%{ opacity:1; transform:translateY(-2.5px); } }
.mascot-think-dot{ animation: mascot-dotpulse 1.4s ease-in-out infinite; }

@keyframes mascot-sweep { 0%{ transform: translateY(-26px); opacity:0; } 10%{ opacity:1; } 90%{ opacity:1; } 100%{ transform: translateY(26px); opacity:0; } }
.mascot-scan-line{ animation: mascot-sweep 1.7s ease-in-out infinite; }
@keyframes mascot-spin { to{ transform: rotate(360deg); } }
.mascot-ring-arc{ animation: mascot-spin 1.3s linear infinite; }
@keyframes mascot-barpulse { 0%,100%{ transform: scaleY(.35); opacity:.4; } 50%{ transform: scaleY(1); opacity:1; } }
.mascot-proc-bar{ animation: mascot-barpulse 1.2s ease-in-out infinite; }
.mascot-voice-bar{ animation: mascot-barpulse .5s ease-in-out infinite; }

@keyframes mascot-listenring { 0%{ transform: scale(.55); opacity:.9; } 100%{ transform: scale(1.35); opacity:0; } }
.mascot-listen-ring{ animation: mascot-listenring 1.8s ease-out infinite; transform-origin: 100px 112px; }

@keyframes mascot-errpulse { 0%,100%{ opacity:1; } 50%{ opacity:.35; } }
.mascot-err-blink{ animation: mascot-errpulse 1s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce){
  .mascot-bot,.mascot-antenna,.mascot-antenna-tip,.mascot-tread,.mascot-eye-idle,.mascot-spark,
  .mascot-think-pupil,.mascot-think-brow,.mascot-think-dot,.mascot-scan-line,.mascot-ring-arc,
  .mascot-proc-bar,.mascot-voice-bar,.mascot-listen-ring,.mascot-err-blink{
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
  }
}
`
