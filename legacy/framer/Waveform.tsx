import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { useReducedMotion } from "framer-motion"
import { useEffect, useRef, type CSSProperties } from "react"

import { C, Safe } from "./MoodwaveAPI.tsx"

/**
 * A thin oscilloscope line between sections. It hums quietly, swells where the pointer is,
 * and ripples harder the faster you scroll. Animates only while on screen.
 */

interface WaveformProps {
    accent: string
    intensity: number
    style?: CSSProperties
}

const POINTS = 120

function WaveformInner(props: WaveformProps) {
    const { accent = C.lilac, intensity = 1 } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    const root = useRef<HTMLDivElement>(null)
    const path = useRef<SVGPathElement>(null)
    const glow = useRef<SVGPathElement>(null)

    useEffect(() => {
        const el = root.current
        if (!el || isStatic) return
        let raf = 0
        let visible = false
        let t = 0
        let pointerX = -1
        let pointerNear = 0
        let lastScroll = window.scrollY
        let scrollEnergy = 0
        let amp = 0

        const onMove = (e: PointerEvent) => {
            const r = el.getBoundingClientRect()
            const dy = Math.abs(e.clientY - (r.top + r.height / 2))
            pointerNear = Math.max(0, 1 - dy / 220)
            pointerX = (e.clientX - r.left) / r.width
        }

        const draw = () => {
            const w = el.clientWidth
            const h = el.clientHeight
            const mid = h / 2
            const sy = window.scrollY
            scrollEnergy = Math.min(1, scrollEnergy * 0.92 + Math.abs(sy - lastScroll) / 900)
            lastScroll = sy
            const target = (3 + pointerNear * 16 + scrollEnergy * 22) * intensity
            amp += (target - amp) * 0.08
            t += 0.03 + scrollEnergy * 0.08
            let d = ""
            for (let i = 0; i <= POINTS; i++) {
                const u = i / POINTS
                const edge = Math.sin(Math.PI * u) // quiet at the ends
                const bump = pointerX >= 0 ? Math.exp(-Math.pow((u - pointerX) / 0.12, 2)) * pointerNear : 0
                const y =
                    mid +
                    edge *
                        (amp * (0.55 * Math.sin(u * 22 + t * 2.1) + 0.3 * Math.sin(u * 47 - t * 3.3) + 0.15 * Math.sin(u * 91 + t * 5.7)) +
                            bump * 14 * intensity * Math.sin(u * 60 - t * 6))
                d += `${i ? "L" : "M"}${(u * w).toFixed(1)},${y.toFixed(1)}`
            }
            path.current?.setAttribute("d", d)
            glow.current?.setAttribute("d", d)
            if (visible && !reduced) raf = requestAnimationFrame(draw)
        }

        const io = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting
            cancelAnimationFrame(raf)
            if (visible) raf = requestAnimationFrame(draw)
        })
        io.observe(el)
        window.addEventListener("pointermove", onMove, { passive: true })
        draw()
        return () => {
            io.disconnect()
            cancelAnimationFrame(raf)
            window.removeEventListener("pointermove", onMove)
        }
    }, [isStatic, reduced, intensity])

    const id = "mw-wave-grad"
    return (
        <div ref={root} aria-hidden style={{ position: "relative", ...props.style, pointerEvents: "none" }}>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                <defs>
                    <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0" stopColor={accent} stopOpacity="0" />
                        <stop offset="0.5" stopColor={accent} stopOpacity="0.9" />
                        <stop offset="1" stopColor={accent} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path ref={glow} d="M0,45 L1200,45" fill="none" stroke={`url(#${id})`} strokeWidth="6" opacity="0.18" style={{ filter: "blur(4px)" }} />
                <path ref={path} d="M0,45 L1200,45" fill="none" stroke={`url(#${id})`} strokeWidth="1.25" />
            </svg>
        </div>
    )
}

/**
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 90
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function Waveform(props: WaveformProps) {
    return (
        <Safe name="Waveform">
            <WaveformInner {...props} />
        </Safe>
    )
}

addPropertyControls(Waveform, {
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    intensity: { type: ControlType.Number, title: "Intensity", min: 0.2, max: 2, step: 0.1, defaultValue: 1 },
})
