/** React bindings of the contrast primitive (`@asteby/metacore-theme/contrast-react`). */
import * as React from 'react'
import { onColor, type OnColorOptions } from './contrast.js'
import { imageTone, type ImageTone, type ImageToneOptions } from './image-tone.js'

/** Text colour for a runtime background (see `onColor`); memoised on the inputs. */
export function useOnColor(bg: string | undefined, options: OnColorOptions = {}): string | undefined {
  const { light, dark, min } = options
  return React.useMemo(() => (bg ? onColor(bg, { light, dark, min }) : undefined), [bg, light, dark, min])
}

/** Tone of the logo at `url`: `undefined` while measuring, then the tone or `'unknown'` (see `imageTone`). */
export function useImageTone(url: string | undefined, options?: ImageToneOptions): ImageTone | undefined {
  const [tone, setTone] = React.useState<ImageTone | undefined>(undefined)
  const opts = React.useRef(options)
  opts.current = options
  React.useEffect(() => {
    setTone(undefined)
    if (!url) return
    let alive = true
    void imageTone(url, opts.current).then((t) => alive && setTone(t))
    return () => {
      alive = false
    }
  }, [url])
  return tone
}
