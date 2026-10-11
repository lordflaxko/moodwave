import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion"
import { useEffect, useRef, type CSSProperties } from "react"

import { C, useFinePointer, Safe } from "./MoodwaveAPI.tsx"

/**
 * A soft light that follows the pointer across the hero's portrait wall, lifting the
 * dimmed faces near it. On touch or reduced motion it rests gently over the centre.
 */

interface SpotlightProps {
    accent: string
    radius: number
    strength: number
    style?: CSSProperties
}

function SpotlightInner(props: SpotlightProps) {
    const { accent = C.lilac, radius = 340, strength = 0.22 } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    const fine = useFinePointer()
    const ref = useRef<HTMLDivElement>(null)

    const x = useMotionValue(50)
    const y = useMotionValue(40)
    const sx = useSpring(x, { stiffness: 90, damping: 22 })
    const sy = useSpring(y, { stiffness: 90, damping: 22 })
    const glow = useMotionTemplate`radial-gradient(${radius}px circle at ${sx}% ${sy}%, color-mix(in srgb, ${accent} ${Math.round(strength * 100)}%, transparent), transparent 70%)`
    const lift = useMotionTemplate`radial-gradient(${Math.round(radius * 0.7)}px circle at ${sx}% ${sy}%, rgba(255,255,255,${(strength * 0.5).toFixed(2)}), transparent 70%)`

    useEffect(() => {
        if (isStatic || reduced || !fine) return
        const move = (e: PointerEvent) => {
            const el = ref.current
            if (!el) return
            const r = el.getBoundingClientRect()
            if (e.clientY < r.top || e.clientY > r.bottom) return
            x.set(((e.clientX - r.left) / r.width) * 100)
            y.set(((e.clientY - r.top) / r.height) * 100)
        }
        window.addEventListener("pointermove", move, { passive: true })
        return () => window.removeEventListener("pointermove", move)
    }, [isStatic, reduced, fine, x, y])

    // Touch devices: a slow idle drift instead of following a finger.
    useEffect(() => {
        if (isStatic || reduced || fine) return
        let t = 0
        const id = window.setInterval(() => {
            t += 0.02
            x.set(50 + Math.sin(t) * 22)
            y.set(38 + Math.cos(t * 0.7) * 12)
        }, 60)
        return () => window.clearInterval(id)
    }, [isStatic, reduced, fine, x, y])

    return (
        <div ref={ref} aria-hidden style={{ position: "relative", ...props.style, pointerEvents: "none", overflow: "hidden" }}>
            <motion.div style={{ position: "absolute", inset: 0, background: glow, mixBlendMode: "screen" }} />
            <motion.div style={{ position: "absolute", inset: 0, background: lift, mixBlendMode: "soft-light" }} />
        </div>
    )
}

/**
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function Spotlight(props: SpotlightProps) {
    return (
        <Safe name="Spotlight">
            <SpotlightInner {...props} />
        </Safe>
    )
}

addPropertyControls(Spotlight, {
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    radius: { type: ControlType.Number, title: "Radius", min: 120, max: 800, step: 10, unit: "px", defaultValue: 340 },
    strength: { type: ControlType.Number, title: "Strength", min: 0.05, max: 0.6, step: 0.01, defaultValue: 0.22 },
})
