import { useEffect, type ComponentProps, type CSSProperties } from 'react'
import { Bot } from 'lucide-react'
import { Mascot as SdkMascot, type MascotSkin } from '@asteby/metacore-app-providers'
import { cn } from '@asteby/metacore-ui'

export type MascotState =
  | 'idle'
  | 'thinking'
  | 'processing'
  | 'listening'
  | 'speaking'
  | 'happy'
  | 'error'

export type MascotProps = {
  /** Skin id (aliases included) or an inline declarative skin. */
  skin?: string | MascotSkin
  state?: MascotState | string
  size?: number
  className?: string
  style?: CSSProperties
  /** Soften eye/brow amplitude. Auto when size < 48. Never kills tread spin. */
  soft?: boolean
}

const SOFT_STYLE_ID = 'metacore-mascot-soft-motion'
const LEGACY_CALM_ID = 'metacore-mascot-calm-override'

function useSoftMascotCss() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    // Drop the old “kill all animations” stylesheet if a prior build injected it.
    document.getElementById(LEGACY_CALM_ID)?.remove()

    let tag = document.getElementById(SOFT_STYLE_ID) as HTMLStyleElement | null
    if (!tag) {
      tag = document.createElement('style')
      tag.id = SOFT_STYLE_ID
      document.head.appendChild(tag)
    }
    // Soft = less eye/brow travel. Tread spin + bob stay on (gira como antes).
    tag.textContent = `
      @keyframes mascot-scan-soft {
        0%,100% { transform: translateX(-2px); }
        50% { transform: translateX(2px); }
      }
      @keyframes mascot-raise-soft {
        0%,100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-0.5px) rotate(-1deg); }
      }
      @keyframes mascot-blink-soft {
        0%, 92%, 100% { transform: scaleY(1); }
        95% { transform: scaleY(0.4); }
      }

      .mascot-size-soft .mascot-think-pupil {
        animation-name: mascot-scan-soft !important;
      }
      .mascot-size-soft .mascot-think-brow {
        animation-name: mascot-raise-soft !important;
      }
      .mascot-size-soft .mascot-eye-idle {
        animation-name: mascot-blink-soft !important;
      }
      /* Never disable tread / bob / antenna — spinning is the brand motion. */
    `
  }, [])
}

function asSdkMascotState(state: MascotState | string | undefined): MascotState | undefined {
  switch (state) {
    case 'idle':
    case 'thinking':
    case 'processing':
    case 'listening':
    case 'speaking':
    case 'happy':
    case 'error':
      return state
    default:
      return undefined
  }
}

export function Mascot({ soft, className, size = 32, state, skin, ...props }: MascotProps) {
  useSoftMascotCss()
  const sizeSoft = soft ?? size < 48
  if (SdkMascot) {
    return (
      <span
        data-mascot-skin={typeof skin === 'string' ? skin : skin?.id}
        data-mascot-state={asSdkMascotState(state) || 'idle'}
        className={cn(
          'inline-flex leading-none',
          sizeSoft && 'mascot-size-soft',
          className,
        )}
        style={{ lineHeight: 0 }}
      >
        <SdkMascot
          {...props}
          skin={skin}
          state={asSdkMascotState(state) as ComponentProps<typeof SdkMascot>['state']}
          size={size}
        />
      </span>
    )
  }
  return <Bot className={className} size={size} style={props.style} />
}

/** Map agent step / live phase → face emotion. */
export function mascotStateFromAgent(opts: {
  loading?: boolean
  speaking?: boolean
  listening?: boolean
  error?: boolean
  stepIcon?: string
  stepKind?: string
}): MascotState {
  if (opts.error) return 'error'
  if (opts.speaking) return 'speaking'
  if (opts.listening) return 'listening'
  if (!opts.loading) return 'idle'
  const icon = (opts.stepIcon || '').toLowerCase()
  if (
    opts.stepKind === 'tool_call' ||
    icon === 'package' ||
    icon === 'package-search' ||
    icon === 'boxes' ||
    icon === 'warehouse' ||
    icon === 'cog' ||
    icon === 'shopping-cart'
  ) {
    return 'processing'
  }
  if (icon === 'brain') return 'thinking'
  return 'thinking'
}
