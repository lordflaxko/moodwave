import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion, useSpring } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { C, useFinePointer, Safe } from "./MoodwaveAPI.tsx"

/**
 * A tiny vinyl record that trails the pointer. It idles with a slow spin and spins faster
 * the quicker you move; over anything clickable it grows and its label shows ▶ (↗ for
 * links that leave the site); a click sends out a soundwave ripple. The system cursor
 * stays visible. Mouse/trackpad only, off for reduced motion.
 */

interface CursorProps {
    accent: string
    style?: CSSProperties
}

type Mode = "idle" | "link" | "external" | "text"

interface Ripple {
    id: number
    x: number
    y: number
}

function Record({ accent, glyph }: { accent: string; glyph: string }) {
    return (
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", overflow: "visible" }}>
            <circle cx="50" cy="50" r="49" fill="#141217" stroke="rgba(242,239,233,0.22)" strokeWidth="1.5" />
            {[42, 36, 30].map((r) => (
                <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(242,239,233,0.09)" strokeWidth="1.2" />
            ))}
            <circle cx="50" cy="50" r="20" fill={accent} />
            {/* A notch on the label so the spin is visible. */}
            <circle cx="50" cy="35" r="2.6" fill="rgba(11,10,13,0.55)" />
            {glyph ? (
                <text x="50" y="51" textAnchor="middle" dominantBaseline="middle" fontSize="15" fill="#0b0a0d" fontFamily="system-ui, sans-serif">
                    {glyph}
                </text>
            ) : (
                <circle cx="50" cy="50" r="3.2" fill="#0b0a0d" />
            )}
        </svg>
    )
}

function CursorInner(props: CursorProps) {
    const { accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    const fine = useFinePointer()
    const enabled = !isStatic && !reduced && fine

    const x = useMotionValue(-100)
    const y = useMotionValue(-100)
    const sx = useSpring(x, { stiffness: 420, damping: 36, mass: 0.6 })
    const sy = useSpring(y, { stiffness: 420, damping: 36, mass: 0.6 })
    const rotate = useMotionValue(0)
    const speed = useRef(0)
    const last = useRef<{ x: number; y: number; t: number } | null>(null)
    const [mode, setMode] = useState<Mode>("idle")
    const [visible, setVisible] = useState(false)
    const [down, setDown] = useState(false)
    const [ripples, setRipples] = useState<Ripple[]>([])
    const nextRipple = useRef(0)

    // Spin: a slow idle turn plus whatever the pointer's speed adds, easing back down.
    useAnimationFrame((_, delta) => {
        if (!enabled) return
        speed.current *= 0.92
        const dps = 60 + speed.current * 0.9 + (mode === "link" || mode === "external" ? 140 : 0)
        rotate.set((rotate.get() + (dps * delta) / 1000) % 360)
    })

    useEffect(() => {
        if (!enabled) return
        const move = (e: PointerEvent) => {
            x.set(e.clientX)
            y.set(e.clientY)
            setVisible(true)
            const now = performance.now()
            if (last.current) {
                const dt = Math.max(8, now - last.current.t)
                const v = Math.hypot(e.clientX - last.current.x, e.clientY - last.current.y) / dt // px per ms
                speed.current = Math.min(1400, Math.max(speed.current, v * 600))
            }
            last.current = { x: e.clientX, y: e.clientY, t: now }
            const target = e.target instanceof Element ? e.target : null
            if (target?.closest("input, textarea, select, [contenteditable='true']")) {
                setMode("text")
                return
            }
            const interactive = target?.closest("a, button, [role='button'], [role='tab'], [role='radio'], [role='switch'], label, summary")
            if (interactive) {
                const href = interactive instanceof HTMLAnchorElement ? interactive.getAttribute("href") ?? "" : ""
                setMode(href.startsWith("http") && !href.includes(window.location.host) ? "external" : "link")
            } else {
                setMode("idle")
            }
        }
        const leave = () => setVisible(false)
        const press = (e: PointerEvent) => {
            setDown(true)
            speed.current = Math.min(1400, speed.current + 500)
            const id = nextRipple.current++
            setRipples((r) => [...r.slice(-4), { id, x: e.clientX, y: e.clientY }])
        }
        const release = () => setDown(false)
        window.addEventListener("pointermove", move, { passive: true })
        document.addEventListener("pointerleave", leave)
        window.addEventListener("blur", leave)
        window.addEventListener("pointerdown", press)
        window.addEventListener("pointerup", release)
        return () => {
            window.removeEventListener("pointermove", move)
            document.removeEventListener("pointerleave", leave)
            window.removeEventListener("blur", leave)
            window.removeEventListener("pointerdown", press)
            window.removeEventListener("pointerup", release)
        }
    }, [enabled, x, y])

    if (isStatic)
        return (
            <div style={{ ...props.style }} aria-hidden>
                <Record accent={accent} glyph="" />
            </div>
        )
    if (!enabled) return null

    const hot = mode === "link" || mode === "external"
    const size = hot ? 44 : 26
    return (
        <>
            {/* Soundwave ripples where you click. */}
            <AnimatePresence>
                {ripples.map((r) => (
                    <motion.span
                        key={r.id}
                        aria-hidden
                        initial={{ scale: 0.3, opacity: 0.7 }}
                        animate={{ scale: 2.6, opacity: 0 }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                        onAnimationComplete={() => setRipples((all) => all.filter((x) => x.id !== r.id))}
                        style={{ position: "fixed", left: r.x - 22, top: r.y - 22, width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${accent}`, boxShadow: `0 0 0 6px color-mix(in srgb, ${accent} 12%, transparent)`, pointerEvents: "none", zIndex: 89 }}
                    />
                ))}
            </AnimatePresence>
            <motion.div aria-hidden style={{ position: "fixed", left: 0, top: 0, x: sx, y: sy, zIndex: 90, pointerEvents: "none" }}>
                <motion.div
                    animate={{ width: size, height: size, opacity: visible && mode !== "text" ? 1 : 0, scale: down ? 0.82 : 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 26 }}
                    style={{ position: "relative", translateX: "-50%", translateY: "-50%", borderRadius: "50%", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.55))" }}
                >
                    <motion.div style={{ width: "100%", height: "100%", rotate }}>
                        <Record accent={accent} glyph="" />
                    </motion.div>
                    {/* The label glyph stays upright while the record turns. */}
                    {hot ? (
                        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#0b0a0d", fontSize: 11, lineHeight: 1, fontFamily: "system-ui, sans-serif", paddingLeft: mode === "external" ? 0 : 1.5 }}>
                            {mode === "external" ? "↗" : "▶"}
                        </span>
                    ) : null}
                    {/* A fixed sheen across the grooves sells the spin. */}
                    <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(135deg, rgba(255,255,255,0.16) 0%, transparent 38%, transparent 62%, rgba(255,255,255,0.07) 100%)", pointerEvents: "none" }} />
                </motion.div>
            </motion.div>
        </>
    )
}

/**
 * @framerIntrinsicWidth 40
 * @framerIntrinsicHeight 40
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function Cursor(props: CursorProps) {
    return (
        <Safe name="Cursor">
            <CursorInner {...props} />
        </Safe>
    )
}

addPropertyControls(Cursor, {
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
