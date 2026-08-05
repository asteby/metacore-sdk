import * as React from 'react'
import { Camera, ScanLine, X } from 'lucide-react'
import { Button } from '@asteby/metacore-ui'

/**
 * BarcodeScanner — primitivo REUSABLE de escaneo por cámara para todo el
 * ecosistema (POS, formularios declarativos, cualquier addon). Sin dependencias
 * externas ni assets: usa la API nativa `BarcodeDetector` sobre el stream de la
 * cámara trasera (`facingMode: environment`), por lo que respeta la CSP estricta
 * de los addons federados.
 *
 * Vive en el SDK (no en un addon) porque escanear un código para "llenar rápido"
 * es una capacidad transversal: la usa el POS para agregar productos y cualquier
 * campo de formulario para completar una referencia sin tipear el UUID/SKU.
 *
 * Degradación honesta: si el navegador no expone `BarcodeDetector` o el usuario
 * niega la cámara, muestra un aviso claro. Los lectores FÍSICOS (USB/Bluetooth)
 * NO necesitan esto: escriben como un teclado y ya funcionan.
 *
 * País/negocio-agnóstico: detecta los simbolismos de retail habituales
 * (EAN-13/8, UPC-A/E, Code-128/39, ITF, QR).
 */

// `BarcodeDetector` aún no está en las libs de TS por defecto: declaramos el
// contrato mínimo que consumimos (evita `any` y mantiene el tipado del detect).
interface DetectedBarcode {
    rawValue: string
    format: string
}
interface BarcodeDetectorLike {
    detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorCtor {
    new (opts?: { formats?: string[] }): BarcodeDetectorLike
    getSupportedFormats?: () => Promise<string[]>
}

/** Simbolismos de retail que intentamos detectar. */
export const RETAIL_BARCODE_FORMATS = [
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'code_128',
    'code_39',
    'itf',
    'qr_code',
]

function getDetectorCtor(): BarcodeDetectorCtor | null {
    if (typeof window === 'undefined') return null
    const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
    return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : null
}

/** `true` si este navegador puede escanear con la cámara (detector + getUserMedia). */
export function isCameraScanSupported(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        getDetectorCtor() !== null
    )
}

/**
 * Beep corto de confirmación al escanear — WebAudio puro (sin assets ni libs,
 * CSP-safe). El AudioContext se crea perezosamente en el primer uso (ya hubo
 * gesto del usuario al abrir el escáner, así que suena). Falla en silencio si el
 * dispositivo no permite audio. Exportado para reutilizarlo con lectores físicos.
 */
export function useScanBeep() {
    const ctxRef = React.useRef<AudioContext | null>(null)
    return React.useCallback(() => {
        try {
            const AC =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext?: typeof AudioContext })
                    .webkitAudioContext
            if (!AC) return
            const ctx = ctxRef.current ?? (ctxRef.current = new AC())
            if (ctx.state === 'suspended') void ctx.resume()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = 'square'
            osc.frequency.value = 880 // beep agudo tipo lector de supermercado
            gain.gain.setValueAtTime(0.0001, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
            osc.connect(gain).connect(ctx.destination)
            osc.start()
            osc.stop(ctx.currentTime + 0.13)
        } catch {
            /* audio no disponible — el escaneo sigue funcionando igual */
        }
    }, [])
}

export interface BarcodeScannerProps {
    open: boolean
    onClose: () => void
    /** Se dispara con el código detectado. El padre resuelve qué hacer con él. */
    onDetected: (code: string) => void
    /**
     * Escaneo continuo (default): no cierra tras el primer código, ignora
     * repetidos ~1.2s y sigue detectando. `false` cierra al primer código
     * (ideal para llenar UN campo de formulario).
     */
    continuous?: boolean
    /** Beep de confirmación al detectar (default true). */
    beepOnScan?: boolean
    /** Texto del encabezado del overlay. */
    title?: string
    /** Ayuda mostrada bajo la retícula mientras la cámara está lista. */
    hint?: string
    /**
     * Posicionamiento del overlay. `absolute` (default) lo ancla al ancestro
     * posicionado más cercano — correcto dentro de un panel inmersivo o un
     * modal, sin taparse con el chrome del host. `fixed` cubre todo el viewport.
     */
    position?: 'absolute' | 'fixed'
}

/**
 * Overlay de cámara a pantalla del contenedor con retícula de puntería. Montalo
 * condicionalmente (`open`) dentro de un ancestro `relative` cuando uses el
 * posicionamiento `absolute` por defecto.
 */
export function BarcodeScanner({
    open,
    onClose,
    onDetected,
    continuous = true,
    beepOnScan = true,
    title = 'Escanear código',
    hint = 'Apuntá al código de barras',
    position = 'absolute',
}: BarcodeScannerProps) {
    const videoRef = React.useRef<HTMLVideoElement | null>(null)
    const streamRef = React.useRef<MediaStream | null>(null)
    const rafRef = React.useRef<number | null>(null)
    const lastHitRef = React.useRef<{ code: string; at: number }>({ code: '', at: 0 })
    const [error, setError] = React.useState<string | null>(null)
    const [ready, setReady] = React.useState(false)
    const beep = useScanBeep()

    const stop = React.useCallback(() => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setReady(false)
    }, [])

    React.useEffect(() => {
        if (!open) return
        setError(null)

        const Ctor = getDetectorCtor()
        if (!navigator.mediaDevices?.getUserMedia || !Ctor) {
            setError(
                'Tu navegador no soporta escaneo por cámara. Usá un lector físico (escribe en el campo) o escribí el código a mano.',
            )
            return
        }

        let cancelled = false
        const detector = new Ctor({ formats: RETAIL_BARCODE_FORMATS })

        const scanFrame = async () => {
            const video = videoRef.current
            if (cancelled || !video || video.readyState < 2) {
                rafRef.current = requestAnimationFrame(scanFrame)
                return
            }
            try {
                const codes = await detector.detect(video)
                const hit = codes.find((c) => c.rawValue)?.rawValue?.trim()
                if (hit) {
                    const now = Date.now()
                    const dup = hit === lastHitRef.current.code && now - lastHitRef.current.at < 1200
                    if (!dup) {
                        lastHitRef.current = { code: hit, at: now }
                        if (beepOnScan) beep()
                        onDetected(hit)
                        if (!continuous) {
                            onClose()
                            return
                        }
                    }
                }
            } catch {
                /* frame sin código o detect transitorio — seguimos */
            }
            if (!cancelled) rafRef.current = requestAnimationFrame(scanFrame)
        }

        void (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                })
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop())
                    return
                }
                streamRef.current = stream
                const video = videoRef.current
                if (video) {
                    video.srcObject = stream
                    await video.play().catch(() => undefined)
                    setReady(true)
                    rafRef.current = requestAnimationFrame(scanFrame)
                }
            } catch (e) {
                const name = (e as { name?: string })?.name
                setError(
                    name === 'NotAllowedError'
                        ? 'Permiso de cámara denegado. Habilitalo en el navegador para escanear.'
                        : 'No se pudo abrir la cámara. Usá un lector físico o escribí el código a mano.',
                )
            }
        })()

        return () => {
            cancelled = true
            stop()
        }
    }, [open, continuous, beepOnScan, onDetected, onClose, stop, beep])

    if (!open) return null

    const posClass = position === 'fixed' ? 'fixed' : 'absolute'
    return (
        <div className={`${posClass} inset-0 z-[100] flex flex-col bg-black`}>
            {/* Barra superior */}
            <div className="flex items-center justify-between px-4 py-3 text-white">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <ScanLine className="size-5" />
                    {title}
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={onClose}
                    aria-label="Cerrar escáner"
                >
                    <X className="size-5" />
                </Button>
            </div>

            {/* Área de cámara */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden">
                {error ? (
                    <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-white">
                        <Camera className="size-10 opacity-70" />
                        <p className="text-sm leading-relaxed">{error}</p>
                        <Button variant="secondary" onClick={onClose}>
                            Entendido
                        </Button>
                    </div>
                ) : (
                    <>
                        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                        {/* Retícula de puntería */}
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="relative h-40 w-72 max-w-[80%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                                <span className="bg-primary absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 animate-pulse" />
                            </div>
                        </div>
                        <p className="absolute bottom-8 left-0 right-0 text-center text-sm text-white/90">
                            {ready ? hint : 'Abriendo cámara…'}
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}

export default BarcodeScanner
