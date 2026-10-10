import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { C, EASE, FALLBACK_COVERS, MONO, SANS, SERIF } from "./MoodwaveAPI.tsx"

/**
 * "How it flows", told by scrolling: the stage stays pinned while four steps play out
 * (typing → reading the vibe → checking records → the playlist). Pinning is done with a
 * scroll-linked transform, so it works inside clipped layouts. Phones and reduced motion
 * get the same steps stacked.
 */

interface FlowStoryProps {
    accent: string
    eyebrow: string
    heading: string
    style?: CSSProperties
}

const STEPS = [
    { title: "Say it how you feel it", body: "A moment, a feeling, a place. As specific or as vague as you like — there’s no wrong way to ask." },
    { title: "Moodwave reads the vibe", body: "Your words become mood, energy, era and texture, then a shortlist of records that genuinely fit." },
    { title: "Every track, verified", body: "Each pick is matched against Spotify’s catalogue. Anything that doesn’t exist is dropped and replaced." },
    { title: "Press play", body: "A titled, sequenced playlist with a reason for every song — ready to refine or save to Spotify." },
]

const PROMPT = "Rainy Sunday, slow coffee, records that feel like a warm blanket"

function useWidth() {
    const ref = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(1100)
    useEffect(() => {
        const el = ref.current
        if (!el || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(([entry]) => {
            // Hidden tabs and collapsed panes report 0; keep the last real width.
            if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width))
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    return [ref, width] as const
}

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }
const card: CSSProperties = {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    borderRadius: 24,
    padding: 24,
    background: C.surface,
    border: `1px solid ${C.line2}`,
    boxShadow: "0 40px 80px -40px rgba(0,0,0,0.9)",
    overflow: "hidden",
    fontFamily: SANS,
}

function Typing({ active }: { active: boolean }) {
    const [n, setN] = useState(active ? 0 : PROMPT.length)
    useEffect(() => {
        if (!active) return
        setN(0)
        const id = window.setInterval(() => setN((v) => (v >= PROMPT.length ? v : v + 1)), 34)
        return () => window.clearInterval(id)
    }, [active])
    return (
        <div>
            <div style={{ ...eyebrow, marginBottom: 14 }}>New playlist</div>
            <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 28, lineHeight: 1.3, color: C.text, minHeight: 110 }}>
                <span style={{ fontStyle: "italic", color: C.subtle }}>Music for </span>
                {PROMPT.slice(0, n)}
                <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} style={{ display: "inline-block", width: 2, height: "0.9em", marginLeft: 2, transform: "translateY(0.12em)", background: C.lilac }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                {["32 songs", "Energy · Calm"].map((p) => (
                    <span key={p} style={{ padding: "6px 12px", borderRadius: 100, border: `1px solid ${C.line2}`, fontSize: 12, color: C.muted }}>
                        {p}
                    </span>
                ))}
            </div>
        </div>
    )
}

function Vibe({ accent }: { accent: string }) {
    const pills = ["Mood · unhurried", "Era · 70s–now", "Texture · warm, acoustic", "Tempo · 70–95 bpm", "Vocals · soft"]
    return (
        <div>
            <div style={{ ...eyebrow, marginBottom: 14 }}>Reading the vibe</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {pills.map((p, i) => (
                    <motion.span
                        key={p}
                        initial={{ opacity: 0, y: 10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.1 + i * 0.09 }}
                        style={{ padding: "7px 12px", borderRadius: 100, border: `1px solid ${C.line2}`, fontSize: 12.5, color: C.text, background: C.surface2 }}
                    >
                        {p}
                    </motion.span>
                ))}
            </div>
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, marginBottom: 10 }}>
                    <span>Energy</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: accent }}>0.28 · calm</span>
                </div>
                <div style={{ height: 6, borderRadius: 6, background: C.surface3, overflow: "hidden" }}>
                    <motion.div initial={{ width: "0%" }} animate={{ width: "28%" }} transition={{ duration: 1, ease: EASE, delay: 0.5 }} style={{ height: "100%", borderRadius: 6, background: accent }} />
                </div>
            </div>
        </div>
    )
}

function Verify() {
    const hits = [
        { ok: true, t: "Pink + White", a: "Frank Ocean", m: "99%" },
        { ok: true, t: "Sunday Morning", a: "Maroon 5", m: "97%" },
        { ok: false, t: "Coffee Rain (Lofi Edit)", a: "Unknown uploader", m: "no match" },
        { ok: true, t: "Come Away With Me", a: "Norah Jones", m: "98%" },
    ]
    return (
        <div>
            <div style={{ ...eyebrow, marginBottom: 14 }}>Checking 38 picks</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {hits.map((h, i) => (
                    <motion.div
                        key={h.t}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: h.ok ? 1 : 0.8, x: 0 }}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.15 + i * 0.16 }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: h.ok ? C.surface2 : "rgba(232,184,107,0.06)" }}
                    >
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.45 + i * 0.16 }}
                            style={{ width: 18, height: 18, borderRadius: 18, display: "grid", placeItems: "center", fontSize: 11, color: C.ink, background: h.ok ? C.moss : C.amber }}
                        >
                            {h.ok ? "✓" : "×"}
                        </motion.span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "baseline", overflow: "hidden" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: h.ok ? C.text : C.subtle, textDecoration: h.ok ? "none" : "line-through", whiteSpace: "nowrap" }}>{h.t}</span>
                            <span style={{ fontSize: 12.5, color: C.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.a}</span>
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: h.ok ? C.moss : C.amber }}>{h.m}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

function Playlist({ accent }: { accent: string }) {
    const rows = [
        ["Pink + White", "Frank Ocean", "3:04"],
        ["Come Away With Me", "Norah Jones", "3:18"],
        ["Best Part", "Daniel Caesar", "3:29"],
        ["Sunday Morning", "Maroon 5", "4:05"],
    ]
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <motion.div
                    initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    transition={{ duration: 0.7, ease: EASE }}
                    style={{ width: 84, height: 84, borderRadius: 14, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, flexShrink: 0, boxShadow: "0 16px 40px -16px rgba(0,0,0,0.9)" }}
                >
                    {FALLBACK_COVERS.slice(0, 4).map((src: string) => (
                        <img key={src} src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ))}
                </motion.div>
                <div>
                    <div style={eyebrow}>Playlist · 32 songs</div>
                    <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 26, letterSpacing: "-0.02em", color: C.text, marginTop: 6 }}>Slow Sunday</div>
                </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                {rows.map(([t, a, d], i) => (
                    <motion.div
                        key={t}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, ease: EASE, delay: 0.25 + i * 0.1 }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}
                    >
                        <span style={{ width: 18, fontFamily: MONO, fontSize: 11, color: i === 0 ? accent : C.faint }}>{i === 0 ? "▶" : String(i + 1).padStart(2, "0")}</span>
                        <span style={{ flex: 1, fontSize: 14, color: C.text }}>
                            {t} <span style={{ color: C.subtle, fontSize: 12.5 }}>{a}</span>
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.subtle }}>{d}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

function Visual({ step, accent }: { step: number; accent: string }) {
    const views = (active: number): ReactNode[] => [
        <Typing active={active === 0} />,
        <Vibe accent={accent} />,
        <Verify />,
        <Playlist accent={accent} />,
    ]
    const all = views(step)
    return (
        <div style={card}>
            <div aria-hidden style={{ position: "absolute", inset: -120, background: `radial-gradient(closest-side at 80% 0%, color-mix(in srgb, ${accent} 14%, transparent), transparent)`, pointerEvents: "none" }} />
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", minHeight: 260 }}>
                {all.map((view, i) => (
                    <motion.div
                        key={i}
                        aria-hidden={i !== step}
                        initial={false}
                        animate={{ opacity: i === step ? 1 : 0, y: i === step ? 0 : i < step ? -10 : 10 }}
                        transition={{ duration: 0.4, ease: EASE }}
                        style={{ gridArea: "1 / 1", minWidth: 0, pointerEvents: i === step ? "auto" : "none" }}
                    >
                        <div key={i === step ? `on-${i}` : `off-${i}`}>{view}</div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

/**
 * @framerIntrinsicWidth 1120
 * @framerIntrinsicHeight 900
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function FlowStory(props: FlowStoryProps) {
    const { accent = C.lilac, eyebrow: kicker = "03 — How it flows", heading = "From a line to a record." } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    const [ref, width] = useWidth()
    const pinned = !isStatic && !reduced && width >= 760

    const track = useRef<HTMLDivElement>(null)
    const stage = useRef<HTMLDivElement>(null)
    const [viewport, setViewport] = useState(800)
    const [stageHeight, setStageHeight] = useState(600)
    const [step, setStep] = useState(0)

    useEffect(() => {
        const update = () => setViewport(window.innerHeight)
        update()
        window.addEventListener("resize", update)
        return () => window.removeEventListener("resize", update)
    }, [])
    useEffect(() => {
        const el = stage.current
        if (!el || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(([entry]) => setStageHeight(Math.round(entry.contentRect.height)))
        ro.observe(el)
        return () => ro.disconnect()
    }, [pinned])

    // One step ≈ 85vh of scrolling. The browser pins the stage (position: sticky), so it
    // moves exactly with the page; JS only decides which step is showing.
    const travel = viewport * 0.85 * STEPS.length
    const top = Math.max(96, Math.round((viewport - stageHeight) / 2))
    const { scrollYProgress } = useScroll({ target: track, offset: [`start ${top}px`, `end ${top + stageHeight}px`] })
    const rail = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])
    useMotionValueEvent(scrollYProgress, "change", (v) => {
        const raw = v * STEPS.length
        setStep((prev) => {
            // Small dead zone at each boundary so the step doesn't flicker back and forth.
            if (raw >= prev + 1 + 0.06 || raw < prev - 0.06) return Math.max(0, Math.min(STEPS.length - 1, Math.floor(raw)))
            return prev
        })
    })

    const header = (
        <div style={{ marginBottom: pinned ? 36 : 28 }}>
            <div style={eyebrow}>{kicker}</div>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: width < 760 ? 40 : 60, lineHeight: 1, letterSpacing: "-0.035em", color: C.text, margin: "16px 0 0" }}>{heading}</h2>
        </div>
    )

    if (!pinned) {
        return (
            <div ref={ref} style={{ position: "relative", width: "100%", ...props.style, height: "auto" }}>
                {header}
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    {STEPS.map((s, i) => (
                        <div key={s.title}>
                            <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginBottom: 14 }}>
                                <span style={{ fontFamily: MONO, fontSize: 11, color: accent }}>{String(i + 1).padStart(2, "0")}</span>
                                <div>
                                    <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 24, color: C.text }}>{s.title}</div>
                                    <div style={{ fontSize: 14.5, lineHeight: 1.55, color: C.subtle, marginTop: 6, fontFamily: SANS }}>{s.body}</div>
                                </div>
                            </div>
                            <Visual step={i} accent={accent} />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div ref={ref} style={{ position: "relative", width: "100%", ...props.style, height: "auto" }}>
            <div ref={track} style={{ position: "relative", height: travel + stageHeight }}>
                <div ref={stage} style={{ position: "sticky", top, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
                    <div>
                        {header}
                        <div style={{ display: "flex", gap: 24 }}>
                            {/* Progress rail */}
                            <div aria-hidden style={{ position: "relative", width: 2, borderRadius: 2, background: C.line2 }}>
                                <motion.div style={{ position: "absolute", left: 0, right: 0, top: 0, height: rail, borderRadius: 2, background: accent }} />
                            </div>
                            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                                {STEPS.map((s, i) => {
                                    const active = i === step
                                    return (
                                        <li key={s.title} aria-current={active ? "step" : undefined}>
                                            <motion.div animate={{ opacity: active ? 1 : 0.38 }} transition={{ duration: 0.4 }} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
                                                <span style={{ fontFamily: MONO, fontSize: 11, color: active ? accent : C.faint }}>{String(i + 1).padStart(2, "0")}</span>
                                                <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 26, letterSpacing: "-0.015em", color: C.text }}>{s.title}</span>
                                            </motion.div>
                                        </li>
                                    )
                                })}
                            </ol>
                        </div>
                        <div style={{ position: "relative", display: "grid", minHeight: 76, marginTop: 22, marginLeft: 26, maxWidth: 440 }}>
                            {STEPS.map((s, i) => (
                                <motion.p
                                    key={s.title}
                                    aria-hidden={i !== step}
                                    initial={false}
                                    animate={{ opacity: i === step ? 1 : 0, y: i === step ? 0 : 6 }}
                                    transition={{ duration: 0.35, ease: EASE }}
                                    style={{ gridArea: "1 / 1", margin: 0, fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: C.subtle }}
                                >
                                    {s.body}
                                </motion.p>
                            ))}
                        </div>
                    </div>
                    <Visual step={step} accent={accent} />
                </div>
            </div>
        </div>
    )
}

addPropertyControls(FlowStory, {
    eyebrow: { type: ControlType.String, title: "Eyebrow", defaultValue: "03 — How it flows" },
    heading: { type: ControlType.String, title: "Heading", defaultValue: "From a line to a record." },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
