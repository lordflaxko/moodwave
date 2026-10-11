import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion, useMotionValue, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"

import { C, EASE, MONO, needleDrop, sized, SANS, scratch, SERIF, SoundToggle, spinTone, stopSpinTone, Safe } from "./MoodwaveAPI.tsx"

/**
 * "Can't decide?" — a record you can grab, scratch and fling. When it stops, the tonearm
 * drops on whichever mood is under the needle and offers to compose it.
 */

interface Mood {
    label: string
    prompt: string
    cover: string
}

interface SpinRecordProps {
    moods: Mood[]
    eyebrow: string
    heading: string
    createPath: string
    accent: string
    style?: CSSProperties
}

const DEFAULT_MOODS: Mood[] = [
    { label: "Late-night drive through Toronto", prompt: "Late-night drive through Toronto: moody R&B, city lights, windows down", cover: "/media/ZkgRFPEfUNc4lwMX98J5NUdIyo4.jpg" },
    { label: "Music for a Sunday morning", prompt: "Music for a slow Sunday morning: coffee, sunlight, warm soul and soft jazz", cover: "/media/hJvuqEaralMFDlwPm8eoLagQJI.jpg" },
    { label: "Coding at 2 AM", prompt: "Coding at 2 AM: instrumental electronic and lo-fi to stay in deep focus", cover: "/media/En2EwG4jlYCCFdRYbTICP0ipY78.jpg" },
    { label: "Songs that feel like summer", prompt: "Songs that feel like summer: sunny, carefree, dancing outside", cover: "/media/BLHjDOgcme8zSKbNIjPzlVU69Aw.jpg" },
    { label: "90s R&B dinner party", prompt: "A 90s R&B dinner party: smooth, soulful, candlelit and a little nostalgic", cover: "/media/kRch2vq5fwB6pcWDAttnY9yzPA0.jpg" },
]

// The needle rests at about one o'clock.
const NEEDLE = 30

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

const mod = (a: number, n: number) => ((a % n) + n) % n

function SpinRecordInner(props: SpinRecordProps) {
    const { moods: rawMoods, eyebrow = "05 — Can’t decide?", heading = "Spin the record.", createPath = "/create", accent = C.lilac } = props
    const moods = rawMoods?.length ? rawMoods : DEFAULT_MOODS
    const isStatic = useIsStaticRenderer()
    const reduced = Boolean(useReducedMotion())
    const [ref, width] = useWidth()
    const narrow = width < 760
    const size = narrow ? Math.max(200, Math.min(300, width - 40)) : 380

    const rotation = useMotionValue(0)
    const platter = useRef<HTMLDivElement>(null)
    const drag = useRef<{ angle: number; time: number; velocity: number } | null>(null)
    const spin = useRef(0)
    const raf = useRef(0)
    const idleRaf = useRef(0)
    const lastScratch = useRef(0)
    const [phase, setPhase] = useState<"idle" | "dragging" | "spinning" | "landed">("idle")
    const [landed, setLanded] = useState<number | null>(null)
    const seg = 360 / moods.length

    useEffect(() => () => stopSpinTone(), [])

    const moodUnderNeedle = (rot: number) => Math.floor(mod(NEEDLE - rot, 360) / seg) % moods.length

    // Idle: a slow 33⅓-ish turn so it reads as a record, until someone touches it.
    useEffect(() => {
        if (isStatic || reduced || phase !== "idle") return
        let prev = performance.now()
        const tick = (now: number) => {
            rotation.set(rotation.get() + (now - prev) * 0.012)
            prev = now
            idleRaf.current = requestAnimationFrame(tick)
        }
        idleRaf.current = requestAnimationFrame(tick)
        // Its own handle: cancelling this must never stop a spin that just started.
        return () => cancelAnimationFrame(idleRaf.current)
    }, [isStatic, reduced, phase, rotation])

    const settle = () => {
        // Glide to the centre of the segment under the needle, then drop the arm.
        const rot = rotation.get()
        const index = moodUnderNeedle(rot)
        const centre = NEEDLE - (index * seg + seg / 2)
        const target = rot + mod(centre - rot + 180, 360) - 180
        const from = rot
        const start = performance.now()
        const glide = (now: number) => {
            const t = Math.min(1, (now - start) / 450)
            const eased = 1 - Math.pow(1 - t, 3)
            rotation.set(from + (target - from) * eased)
            if (t < 1) raf.current = requestAnimationFrame(glide)
            else {
                stopSpinTone()
                needleDrop()
                setLanded(index)
                setPhase("landed")
            }
        }
        raf.current = requestAnimationFrame(glide)
    }

    const fling = (velocity: number) => {
        cancelAnimationFrame(raf.current)
        cancelAnimationFrame(idleRaf.current)
        if (reduced) {
            rotation.set(rotation.get() + 140 + Math.random() * 360)
            settle()
            return
        }
        spin.current = velocity
        setPhase("spinning")
        let prev = performance.now()
        const tick = (now: number) => {
            const dt = Math.min(48, now - prev)
            prev = now
            spin.current *= Math.pow(0.9965, dt)
            rotation.set(rotation.get() + spin.current * dt)
            spinTone(Math.abs(spin.current) / 2)
            if (Math.abs(spin.current) < 0.04) settle()
            else raf.current = requestAnimationFrame(tick)
        }
        raf.current = requestAnimationFrame(tick)
    }

    const angleAt = (clientX: number, clientY: number) => {
        const r = platter.current?.getBoundingClientRect()
        if (!r) return 0
        return (Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2)) * 180) / Math.PI
    }

    const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        cancelAnimationFrame(raf.current)
        cancelAnimationFrame(idleRaf.current)
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { angle: angleAt(e.clientX, e.clientY), time: performance.now(), velocity: 0 }
        setLanded(null)
        setPhase("dragging")
    }
    const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const d = drag.current
        if (!d) return
        const angle = angleAt(e.clientX, e.clientY)
        const now = performance.now()
        const delta = mod(angle - d.angle + 180, 360) - 180
        rotation.set(rotation.get() + delta)
        const dt = Math.max(1, now - d.time)
        d.velocity = d.velocity * 0.6 + (delta / dt) * 0.4
        d.angle = angle
        d.time = now
        spinTone(Math.abs(d.velocity) / 1.6)
        if (now - lastScratch.current > 55 && Math.abs(delta) > 0.6) {
            lastScratch.current = now
            scratch(d.velocity / 1.2)
        }
    }
    const onUp = () => {
        const d = drag.current
        drag.current = null
        if (!d) return
        // A gentle release still spins a little; a hard flick spins for a while.
        const v = Math.abs(d.velocity) < 0.15 ? Math.sign(d.velocity || 1) * 0.6 : d.velocity
        fling(Math.max(-3, Math.min(3, v)))
    }

    const mood = landed !== null ? moods[landed] : null
    const href = mood ? `${createPath}?${new URLSearchParams({ prompt: mood.prompt, auto: "1" }).toString()}` : createPath

    const record = (
        <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
            <div aria-hidden style={{ position: "absolute", inset: -40, borderRadius: "50%", background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 18%, transparent), transparent)`, filter: "blur(16px)" }} />
            <motion.div
                ref={platter}
                role="button"
                tabIndex={0}
                aria-label="Spin the record to pick a mood"
                onPointerDown={isStatic ? undefined : onDown}
                onPointerMove={isStatic ? undefined : onMove}
                onPointerUp={isStatic ? undefined : onUp}
                onPointerCancel={isStatic ? undefined : onUp}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setLanded(null)
                        fling(1.6 + Math.random() * 1.2)
                    }
                }}
                style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    rotate: rotation,
                    cursor: phase === "dragging" ? "grabbing" : "grab",
                    touchAction: "none",
                    outline: "none",
                    background: [
                        "conic-gradient(from 20deg, rgba(255,255,255,0.09), rgba(255,255,255,0) 10%, rgba(255,255,255,0.07) 24%, rgba(255,255,255,0) 36%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.07) 74%, rgba(255,255,255,0) 88%, rgba(255,255,255,0.09))",
                        "repeating-radial-gradient(circle at center, #121015 0px, #121015 2px, #1a181e 3px, #121015 4px)",
                    ].join(", "),
                    boxShadow: "0 40px 90px -30px rgba(0,0,0,0.95), inset 0 0 0 1px rgba(242,239,233,0.06)",
                }}
            >
                {/* Mood bands around the record, each with its cover on the rim */}
                {moods.map((m, i) => {
                    const angle = i * seg + seg / 2 - 90
                    const r = size * 0.4
                    const active = landed === i
                    return (
                        <div key={m.label} aria-hidden style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, transform: `rotate(${angle}deg) translateX(${r}px)` }}>
                            <img
                                src={sized(m.cover, 128)}
                                loading="lazy"
                                decoding="async"
                                alt=""
                                draggable={false}
                                style={{ position: "absolute", width: size * 0.13, height: size * 0.13, marginLeft: -(size * 0.065), marginTop: -(size * 0.065), borderRadius: 8, objectFit: "cover", transform: "rotate(90deg)", boxShadow: active ? `0 0 0 2px ${accent}` : "0 6px 16px -6px rgba(0,0,0,0.9)", opacity: landed === null || active ? 1 : 0.35, transition: "opacity 0.4s ease, box-shadow 0.4s ease", pointerEvents: "none" }}
                            />
                        </div>
                    )
                })}
                {/* Label */}
                <div style={{ position: "absolute", left: "50%", top: "50%", width: size * 0.34, height: size * 0.34, marginLeft: -(size * 0.17), marginTop: -(size * 0.17), borderRadius: "50%", background: `radial-gradient(circle, ${C.ink} 0 6%, ${accent} 7% 100%)`, display: "grid", placeItems: "center", boxShadow: "0 0 0 6px #0b0a0d" }}>
                    <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: size * 0.05, color: C.ink, transform: `translateY(${size * 0.075}px)` }}>moodwave</span>
                </div>
            </motion.div>
            {/* Tonearm, drawn in the record's own coordinates so the stylus sits on the
                cover under the needle (NEEDLE degrees from the top). Lifts while spinning. */}
            {(() => {
                const c = size / 2
                const rad = (NEEDLE * Math.PI) / 180
                const tip = { x: c + size * 0.4 * Math.sin(rad), y: c - size * 0.4 * Math.cos(rad) }
                const pivot = { x: size * 1.04, y: size * 0.04 }
                // A gentle kink near the headshell, like a real tonearm.
                const dx = tip.x - pivot.x
                const dy = tip.y - pivot.y
                const len = Math.hypot(dx, dy)
                const elbow = { x: pivot.x + dx * 0.8 + (-dy / len) * size * 0.04, y: pivot.y + dy * 0.8 + (dx / len) * size * 0.04 }
                const angle = (Math.atan2(tip.y - elbow.y, tip.x - elbow.x) * 180) / Math.PI
                return (
                    <motion.svg
                        aria-hidden
                        width={size}
                        height={size}
                        viewBox={`0 0 ${size} ${size}`}
                        animate={{ rotate: phase === "landed" ? 0 : -14 }}
                        transition={{ duration: 0.6, ease: EASE }}
                        style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", originX: pivot.x / size, originY: pivot.y / size }}
                    >
                        <circle cx={pivot.x} cy={pivot.y} r={size * 0.035} fill={C.surface3} stroke="rgba(242,239,233,0.18)" />
                        <circle cx={pivot.x} cy={pivot.y} r={size * 0.012} fill={C.muted} />
                        <path d={`M${pivot.x},${pivot.y} L${elbow.x},${elbow.y} L${tip.x},${tip.y}`} fill="none" stroke={C.muted} strokeWidth={Math.max(2, size * 0.008)} strokeLinecap="round" strokeLinejoin="round" />
                        <rect x={tip.x - size * 0.03} y={tip.y - size * 0.016} width={size * 0.06} height={size * 0.032} rx={3} transform={`rotate(${angle} ${tip.x} ${tip.y})`} fill={C.text} />
                    </motion.svg>
                )
            })()}
        </div>
    )

    return (
        <div ref={ref} style={{ position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS }}>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1.1fr 0.9fr", gap: narrow ? 32 : 56, alignItems: "center" }}>
                {record}
                <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }}>{eyebrow}</div>
                    <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: narrow ? 40 : 60, lineHeight: 1, letterSpacing: "-0.035em", color: C.text, margin: "16px 0 18px" }}>{heading}</h2>
                    <div style={{ position: "relative", minHeight: 170 }}>
                        <AnimatePresence mode="wait" initial={false}>
                            {mood ? (
                                <motion.div key={mood.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }}>
                                    <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>The needle landed on</div>
                                    <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 30, letterSpacing: "-0.02em", color: C.text, margin: "8px 0 8px" }}>{mood.label}</div>
                                    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 16, lineHeight: 1.45, color: C.subtle, margin: "0 0 20px" }}>“{mood.prompt}”</p>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                                        <a href={href} style={{ height: 46, borderRadius: 100, padding: "0 20px", display: "inline-flex", alignItems: "center", background: C.text, color: C.ink, textDecoration: "none", fontSize: 15, fontWeight: 500 }}>
                                            Compose this →
                                        </a>
                                        <button type="button" onClick={() => { setLanded(null); fling(1.8 + Math.random() * 1.2) }} style={{ height: 46, borderRadius: 100, padding: "0 18px", border: `1px solid ${C.line2}`, background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}>
                                            Spin again
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                                    <p style={{ fontSize: 15.5, lineHeight: 1.6, color: C.subtle, margin: "0 0 20px", maxWidth: 400 }}>
                                        {phase === "spinning" ? "Round and round…" : "Grab the record and give it a spin — scratch it, fling it. Wherever the needle lands, that’s tonight’s mood."}
                                    </p>
                                    <button type="button" onClick={() => fling(1.8 + Math.random() * 1.2)} disabled={phase === "spinning"} style={{ height: 46, borderRadius: 100, padding: "0 20px", border: "none", background: accent, color: C.ink, fontSize: 15, fontWeight: 500, cursor: "pointer", opacity: phase === "spinning" ? 0.5 : 1 }}>
                                        Spin it for me
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    <div style={{ marginTop: 18 }}>
                        <SoundToggle accent={accent} />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function SpinRecord(props: SpinRecordProps) {
    return (
        <Safe name="SpinRecord">
            <SpinRecordInner {...props} />
        </Safe>
    )
}

addPropertyControls(SpinRecord, {
    eyebrow: { type: ControlType.String, title: "Eyebrow", defaultValue: "05 — Can’t decide?" },
    heading: { type: ControlType.String, title: "Heading", defaultValue: "Spin the record." },
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    moods: {
        type: ControlType.Array,
        title: "Moods",
        control: {
            type: ControlType.Object,
            controls: {
                label: { type: ControlType.String, title: "Label" },
                prompt: { type: ControlType.String, title: "Prompt", displayTextArea: true },
                cover: { type: ControlType.String, title: "Cover URL" },
            },
        },
        defaultValue: DEFAULT_MOODS,
        maxCount: 8,
    },
})
