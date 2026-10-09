import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion"
import { useEffect, useState, type CSSProperties } from "react"

import { C, MONO, useFinePointer } from "./MoodwaveAPI.tsx"

/**
 * A soft ring that trails the pointer and swells over anything clickable. The system
 * cursor stays visible; this only adds feel. Mouse/trackpad only, off for reduced motion.
 */

interface CursorProps {
    accent: string
    style?: CSSProperties
}

type Mode = "idle" | "link" | "text"

/**
 * @framerIntrinsicWidth 40
 * @framerIntrinsicHeight 40
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function Cursor(props: CursorProps) {
    const { accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    const fine = useFinePointer()
    const enabled = !isStatic && !reduced && fine

    const x = useMotionValue(-100)
    const y = useMotionValue(-100)
    const sx = useSpring(x, { stiffness: 420, damping: 36, mass: 0.6 })
    const sy = useSpring(y, { stiffness: 420, damping: 36, mass: 0.6 })
    const [mode, setMode] = useState<Mode>("idle")
    const [label, setLabel] = useState("")
    const [visible, setVisible] = useState(false)
    const [down, setDown] = useState(false)

    useEffect(() => {
        if (!enabled) return
        const move = (e: PointerEvent) => {
            x.set(e.clientX)
            y.set(e.clientY)
            setVisible(true)
            const target = e.target instanceof Element ? e.target : null
            if (target?.closest("input, textarea, [contenteditable='true']")) {
                setMode("text")
                setLabel("")
                return
            }
            const interactive = target?.closest("a, button, [role='button'], label, summary")
            if (interactive) {
                setMode("link")
                const href = interactive instanceof HTMLAnchorElement ? interactive.getAttribute("href") ?? "" : ""
                setLabel(href.startsWith("http") && !href.includes(window.location.host) ? "open ↗" : "")
            } else {
                setMode("idle")
                setLabel("")
            }
        }
        const leave = () => setVisible(false)
        const press = () => setDown(true)
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

    if (isStatic) return <div style={{ ...props.style, borderRadius: "50%", border: `1.5px solid ${accent}` }} aria-hidden />
    if (!enabled) return null

    const size = mode === "link" ? 54 : mode === "text" ? 6 : 28
    return (
        <motion.div
            aria-hidden
            style={{ position: "fixed", left: 0, top: 0, x: sx, y: sy, zIndex: 90, pointerEvents: "none", mixBlendMode: "difference" }}
        >
            <motion.div
                animate={{ width: size, height: size, opacity: visible ? 1 : 0, scale: down ? 0.8 : 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                style={{
                    translateX: "-50%",
                    translateY: "-50%",
                    borderRadius: "50%",
                    border: mode === "link" ? "none" : `1.5px solid ${C.text}`,
                    background: mode === "link" ? C.text : "transparent",
                    display: "grid",
                    placeItems: "center",
                }}
            >
                {label ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ink }}>{label}</span> : null}
            </motion.div>
        </motion.div>
    )
}

addPropertyControls(Cursor, {
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
