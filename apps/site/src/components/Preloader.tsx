import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { C, EASE, FALLBACK_COVERS, MONO, SERIF, sized, Safe } from "./MoodwaveAPI.tsx"

/**
 * Welcome loader: a record spins up (its label cycling through real covers), the tonearm
 * drops, equaliser bars pulse and a counter tracks the page actually loading. Then a
 * curtain lifts on the hero. Shown once per browser session.
 */

interface PreloaderProps {
    covers: string[]
    accent: string
    minDuration: number
    style?: CSSProperties
}

const SEEN_KEY = "mw_intro_seen"

function seenThisSession(): boolean {
    try {
        return window.sessionStorage.getItem(SEEN_KEY) === "1"
    } catch {
        return false
    }
}

function markSeen() {
    try {
        window.sessionStorage.setItem(SEEN_KEY, "1")
    } catch {
        // Storage blocked: the intro may show again next page load, which is harmless.
    }
}

/** Resolves when fonts and the window have loaded (or after `max` ms, whichever is first). */
function pageReady(max: number): Promise<void> {
    const load = new Promise<void>((resolve) => {
        if (document.readyState === "complete") resolve()
        else window.addEventListener("load", () => resolve(), { once: true })
    })
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve()
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, max))
    return Promise.race([Promise.all([load, fonts]).then(() => undefined), timeout])
}

function Record({ covers, accent, spinning }: { covers: string[]; accent: string; spinning: boolean }) {
    const [index, setIndex] = useState(0)
    useEffect(() => {
        if (!spinning || covers.length < 2) return
        const id = window.setInterval(() => setIndex((i) => (i + 1) % covers.length), 520)
        return () => window.clearInterval(id)
    }, [spinning, covers.length])

    return (
        <div style={{ position: "relative", width: 260, height: 260 }}>
            {/* Soft lilac halo under the record */}
            <div aria-hidden style={{ position: "absolute", inset: -60, borderRadius: "50%", background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 22%, transparent), transparent)`, filter: "blur(20px)" }} />
            <motion.div
                aria-hidden
                animate={spinning ? { rotate: 360 } : { rotate: 0 }}
                transition={spinning ? { duration: 1.8, ease: "linear", repeat: Infinity } : { duration: 0 }}
                style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    background: [
                        "conic-gradient(from 30deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 12%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0) 38%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.08) 75%, rgba(255,255,255,0) 88%, rgba(255,255,255,0.10))",
                        "repeating-radial-gradient(circle at center, #121015 0px, #121015 2px, #19171d 3px, #121015 4px)",
                    ].join(", "),
                    boxShadow: "0 30px 80px -20px rgba(0,0,0,0.9), inset 0 0 0 1px rgba(242,239,233,0.06)",
                    display: "grid",
                    placeItems: "center",
                }}
            >
                <div style={{ position: "relative", width: 96, height: 96, borderRadius: "50%", overflow: "hidden", boxShadow: "0 0 0 6px #0b0a0d" }}>
                    <AnimatePresence initial={false}>
                        <motion.img
                            key={covers[index]}
                            src={sized(covers[index], 256)}
                            alt=""
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    </AnimatePresence>
                    <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, margin: -5, borderRadius: "50%", background: C.ink }} />
                </div>
            </motion.div>
            {/* Tonearm: drops onto the record */}
            <motion.svg
                aria-hidden
                width="120"
                height="190"
                viewBox="0 0 120 190"
                initial={{ rotate: -28 }}
                animate={{ rotate: spinning ? 0 : -28 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.35 }}
                style={{ position: "absolute", right: -64, top: -30, transformOrigin: "96px 18px", overflow: "visible" }}
            >
                <circle cx="96" cy="18" r="12" fill={C.surface3} stroke="rgba(242,239,233,0.18)" />
                <circle cx="96" cy="18" r="4" fill={C.muted} />
                <path d="M96 18 L70 140 L52 168" fill="none" stroke={C.muted} strokeWidth="3" strokeLinecap="round" />
                <rect x="40" y="160" width="22" height="12" rx="3" transform="rotate(-35 51 166)" fill={C.text} />
            </motion.svg>
        </div>
    )
}

function PreloaderInner(props: PreloaderProps) {
    const { covers = FALLBACK_COVERS.slice(0, 4), accent = C.lilac, minDuration = 1.5 } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    // "pending" renders the cover on first paint (SSR too) so the hero never flashes first.
    const [phase, setPhase] = useState<"pending" | "loading" | "leaving" | "done">("pending")
    const [progress, setProgress] = useState(0)
    const raf = useRef(0)

    useEffect(() => {
        if (isStatic) return
        if (seenThisSession()) {
            setPhase("done")
            return
        }
        setPhase("loading")
        const root = document.documentElement
        const previousOverflow = root.style.overflow
        root.style.overflow = "hidden"

        const minMs = reduced ? 400 : minDuration * 1000
        const start = performance.now()
        let ready = false
        pageReady(3000).then(() => {
            ready = true
        })

        // Ease towards 90% over the minimum time; finish once the page is ready.
        let shown = 0
        const tick = (now: number) => {
            const elapsed = now - start
            const target = ready && elapsed >= minMs ? 1 : Math.min(0.9, (elapsed / minMs) * 0.9)
            shown += (target - shown) * (target === 1 ? 0.18 : 0.12)
            if (target === 1 && 1 - shown < 0.005) shown = 1
            setProgress(shown)
            if (shown < 1) raf.current = requestAnimationFrame(tick)
            else {
                markSeen()
                setPhase("leaving")
            }
        }
        raf.current = requestAnimationFrame(tick)
        return () => {
            cancelAnimationFrame(raf.current)
            root.style.overflow = previousOverflow
        }
    }, [isStatic, reduced, minDuration])

    useEffect(() => {
        if (phase === "done") document.documentElement.style.overflow = ""
    }, [phase])

    if (isStatic) {
        return (
            <div style={{ ...props.style, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 100, background: C.surface2, border: `1px solid ${C.line2}`, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }}>
                ◉ Intro loader
            </div>
        )
    }
    if (phase === "done") return null

    const percent = Math.round(progress * 100)
    return (
        <motion.div
            role="status"
            aria-live="polite"
            aria-label={`Loading Moodwave, ${percent}%`}
            initial={false}
            animate={phase === "leaving" ? { clipPath: "inset(0% 0% 100% 0%)" } : { clipPath: "inset(0% 0% 0% 0%)" }}
            transition={{ duration: reduced ? 0.3 : 0.95, ease: [0.76, 0, 0.24, 1], delay: phase === "leaving" ? 0.15 : 0 }}
            onAnimationComplete={() => phase === "leaving" && setPhase("done")}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: C.ink, display: "grid", placeItems: "center", overflow: "hidden" }}
        >
            <motion.div
                animate={phase === "leaving" ? { scale: 0.92, opacity: 0, y: -30 } : { scale: 1, opacity: 1, y: 0 }}
                initial={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}
            >
                <Record covers={covers} accent={accent} spinning={!reduced && phase !== "pending"} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                    <div aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 22 }}>
                        {Array.from({ length: 9 }).map((_, i) => (
                            <motion.span
                                key={i}
                                animate={reduced ? { height: 10 } : { height: [5, 22, 9, 18, 5] }}
                                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" }}
                                style={{ width: 3, borderRadius: 3, background: i % 3 === 1 ? C.text : accent }}
                            />
                        ))}
                    </div>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, fontSize: 34, letterSpacing: "-0.03em", color: C.text }}>moodwave</div>
                </div>
            </motion.div>

            {/* Counter + progress line */}
            <div style={{ position: "absolute", left: 32, right: 32, bottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between", fontFamily: MONO, color: C.subtle }}>
                <span style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>Tuning in</span>
                <span style={{ fontSize: 44, lineHeight: 1, color: C.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{String(percent).padStart(3, "0")}</span>
            </div>
            <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: C.line }}>
                <div style={{ height: "100%", width: `${percent}%`, background: accent, transition: "width 0.1s linear" }} />
            </div>
        </motion.div>
    )
}

/**
 * @framerIntrinsicWidth 200
 * @framerIntrinsicHeight 40
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function Preloader(props: PreloaderProps) {
    return (
        <Safe name="Preloader">
            <PreloaderInner {...props} />
        </Safe>
    )
}

addPropertyControls(Preloader, {
    covers: {
        type: ControlType.Array,
        title: "Covers",
        control: { type: ControlType.String },
        defaultValue: FALLBACK_COVERS.slice(0, 4),
    },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    minDuration: { type: ControlType.Number, title: "Min time", min: 0.6, max: 4, step: 0.1, unit: "s", defaultValue: 1.5 },
})
