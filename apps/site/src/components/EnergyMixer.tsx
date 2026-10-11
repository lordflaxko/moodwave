import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"

import {
    C,
    EASE,
    energyLabel,
    MONO,
    playPad,
    readSpectrum,
    SANS,
    SERIF,
    sized,
    SoundToggle,
    stopPad,
    useFeaturedTracks,
    useSound,
    type FeaturedTrack,
    Safe,
} from "./MoodwaveAPI.tsx"

/**
 * A mixing desk for mood: drag the fader from Calm to Peak and the visualiser, tempo and
 * matching records follow. With sound on, a soft pad and pulse play at that energy.
 * "Compose at this energy" opens the studio with it preset.
 */

interface EnergyMixerProps {
    eyebrow: string
    heading: string
    body: string
    createPath: string
    accent: string
    style?: CSSProperties
}

const BARS = 32
const MARKS = ["Calm", "Steady", "Lift", "Peak"]

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

function Visualizer({ energy, accent, active, reduced }: { energy: number; accent: string; active: boolean; reduced: boolean }) {
    const canvas = useRef<HTMLCanvasElement>(null)
    const energyRef = useRef(energy)
    energyRef.current = energy

    useEffect(() => {
        const el = canvas.current
        const ctx = el?.getContext("2d")
        if (!el || !ctx) return
        const spectrum = new Uint8Array(64)
        const heights = new Array(BARS).fill(0.1)
        let raf = 0
        let t = 0
        const draw = () => {
            const dpr = window.devicePixelRatio || 1
            const w = el.clientWidth
            const h = el.clientHeight
            if (w < 40 || h < 10) {
                if (active && !reduced) raf = requestAnimationFrame(draw)
                return
            }
            if (el.width !== w * dpr) {
                el.width = w * dpr
                el.height = h * dpr
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.clearRect(0, 0, w, h)
            const e = energyRef.current
            const live = readSpectrum(spectrum)
            t += 0.016 * (1.5 + e * 9)
            const gap = 4
            const bw = (w - gap * (BARS - 1)) / BARS
            for (let i = 0; i < BARS; i++) {
                let target: number
                if (live) target = spectrum[Math.min(63, Math.floor((i / BARS) * 48))] / 255
                else if (reduced) target = 0.15 + e * 0.5 * (0.6 + 0.4 * Math.sin(i * 0.7))
                else {
                    const wave = 0.5 + 0.5 * Math.sin(t + i * 0.55) * Math.cos(t * 0.37 + i * 0.21)
                    const beat = Math.pow(Math.max(0, Math.sin(t * 1.2)), 6) * e
                    target = 0.08 + (0.25 + e * 0.7) * wave * (0.75 + 0.25 * Math.sin(i * 1.7)) + beat * 0.3
                }
                heights[i] += (Math.min(1, target) - heights[i]) * 0.25
                const bh = Math.max(3, heights[i] * h)
                const x = i * (bw + gap)
                const grad = ctx.createLinearGradient(0, h, 0, h - bh)
                grad.addColorStop(0, accent)
                grad.addColorStop(1, "rgba(242,239,233,0.85)")
                ctx.fillStyle = grad
                ctx.globalAlpha = 0.35 + heights[i] * 0.65
                ctx.beginPath()
                if (typeof ctx.roundRect === "function") ctx.roundRect(x, h - bh, bw, bh, Math.max(0, Math.min(3, bw / 2)))
                else ctx.rect(x, h - bh, bw, bh)
                ctx.fill()
            }
            ctx.globalAlpha = 1
            if (active && !reduced) raf = requestAnimationFrame(draw)
        }
        draw()
        if (active && !reduced) raf = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(raf)
    }, [active, reduced, accent])

    return <canvas ref={canvas} aria-hidden style={{ width: "100%", height: 140, display: "block" }} />
}

function nearest(tracks: FeaturedTrack[], energy: number, count: number): FeaturedTrack[] {
    return [...tracks]
        .filter((t) => t.energy != null && t.image_url)
        .sort((a, b) => Math.abs((a.energy ?? 0) - energy) - Math.abs((b.energy ?? 0) - energy))
        .slice(0, count)
}

function EnergyMixerInner(props: EnergyMixerProps) {
    const {
        eyebrow = "03 — Find your energy",
        heading = "Slide it until it feels right.",
        body = "Energy is the one dial that changes everything — tempo, texture, how hard the drums hit. Move the fader and hear how a playlist shifts.",
        createPath = "/create",
        accent = C.lilac,
    } = props
    const isStatic = useIsStaticRenderer()
    const reduced = Boolean(useReducedMotion())
    const [ref, width] = useWidth()
    const narrow = width < 760
    const [energy, setEnergy] = useState(0.45)
    const [dragging, setDragging] = useState(false)
    const [inView, setInView] = useState(false)
    const track = useRef<HTMLDivElement>(null)
    const tracks = useFeaturedTracks()
    const { enabled } = useSound()

    useEffect(() => {
        const el = ref.current
        if (!el || typeof IntersectionObserver === "undefined") return
        const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 })
        io.observe(el)
        return () => io.disconnect()
    }, [ref])

    // Sound follows the fader while the section is on screen.
    useEffect(() => {
        if (enabled && inView) playPad(energy)
        else stopPad()
    }, [enabled, inView, energy])
    useEffect(() => () => stopPad(), [])

    const setFromPointer = (clientX: number) => {
        const r = track.current?.getBoundingClientRect()
        if (!r) return
        setEnergy(Math.max(0, Math.min(1, (clientX - r.left) / r.width)))
    }
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 0.1 : 0.02
        if (e.key === "ArrowRight" || e.key === "ArrowUp") setEnergy((v) => Math.min(1, v + step))
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setEnergy((v) => Math.max(0, v - step))
        else if (e.key === "Home") setEnergy(0)
        else if (e.key === "End") setEnergy(1)
        else return
        e.preventDefault()
    }

    const bpm = Math.round(60 + energy * 110)
    const word = energyLabel(energy)
    const picks = nearest(tracks, energy, 3)
    const href = `${createPath}?energy=${energy.toFixed(2)}`

    const panel = (
        <div style={{ position: "relative", borderRadius: 28, padding: narrow ? 18 : 26, background: C.surface, border: `1px solid ${C.line2}`, boxShadow: "0 40px 90px -40px rgba(0,0,0,0.9)", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 80% at ${energy * 100}% 100%, color-mix(in srgb, ${accent} ${Math.round(8 + energy * 14)}%, transparent), transparent 70%)`, transition: "background 0.3s linear", pointerEvents: "none" }} />
            <div style={{ position: "relative", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                        key={word}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        style={{ fontFamily: SERIF, fontWeight: 300, fontStyle: "italic", fontSize: narrow ? 40 : 52, letterSpacing: "-0.03em", color: C.text, lineHeight: 1 }}
                    >
                        {word}
                    </motion.span>
                </AnimatePresence>
                <span style={{ fontFamily: MONO, fontSize: 13, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ fontSize: 28, color: C.text }}>{bpm}</span> BPM
                </span>
            </div>
            {isStatic ? (
                <div style={{ height: 140, borderRadius: 12, background: `linear-gradient(90deg, ${C.surface2}, ${C.surface3})` }} />
            ) : (
                <Visualizer energy={energy} accent={accent} active={inView} reduced={reduced} />
            )}

            {/* Fader */}
            <div style={{ position: "relative", marginTop: 22 }}>
                <div
                    ref={track}
                    role="slider"
                    tabIndex={0}
                    aria-label="Energy"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(energy * 100)}
                    aria-valuetext={`${word}, ${bpm} BPM`}
                    onKeyDown={onKey}
                    onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
                        e.currentTarget.setPointerCapture(e.pointerId)
                        setDragging(true)
                        setFromPointer(e.clientX)
                    }}
                    onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => dragging && setFromPointer(e.clientX)}
                    onPointerUp={() => setDragging(false)}
                    onPointerCancel={() => setDragging(false)}
                    style={{ position: "relative", height: 44, cursor: dragging ? "grabbing" : "grab", touchAction: "none", outline: "none" }}
                >
                    <div style={{ position: "absolute", left: 0, right: 0, top: 20, height: 4, borderRadius: 4, background: C.surface3 }} />
                    <div style={{ position: "absolute", left: 0, width: `${energy * 100}%`, top: 20, height: 4, borderRadius: 4, background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 40%, transparent), ${accent})` }} />
                    {Array.from({ length: 21 }).map((_, i) => (
                        <span key={i} aria-hidden style={{ position: "absolute", left: `${i * 5}%`, top: i % 5 === 0 ? 30 : 32, width: 1, height: i % 5 === 0 ? 10 : 6, background: C.line2 }} />
                    ))}
                    <motion.div
                        aria-hidden
                        animate={{ scale: dragging ? 1.12 : 1 }}
                        style={{ position: "absolute", left: `calc(${energy * 100}% - 14px)`, top: 6, width: 28, height: 32, borderRadius: 8, background: C.text, boxShadow: `0 8px 24px -6px rgba(0,0,0,0.9), 0 0 0 4px color-mix(in srgb, ${accent} 30%, transparent)`, display: "grid", placeItems: "center" }}
                    >
                        <span style={{ width: 12, height: 2, borderRadius: 2, background: C.ink, boxShadow: `0 -5px 0 ${C.ink}, 0 5px 0 ${C.ink}` }} />
                    </motion.div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    {MARKS.map((m) => (
                        <button key={m} type="button" onClick={() => setEnergy({ Calm: 0.2, Steady: 0.45, Lift: 0.68, Peak: 0.9 }[m] ?? 0.5)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: word === m ? accent : C.faint }}>
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            {/* Matching records */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 22 }}>
                {(picks.length ? picks : [null, null, null]).map((t, i) => (
                    <div key={i} style={{ minWidth: 0 }}>
                        <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: C.surface2 }}>
                            <AnimatePresence initial={false}>
                                {t?.image_url ? (
                                    <motion.img
                                        key={t.image_url}
                                        src={sized(t.image_url, 320)}
                                        alt=""
                                        initial={{ opacity: 0, scale: 1.08 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.5, ease: EASE }}
                                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                ) : null}
                            </AnimatePresence>
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: 12.5, color: C.text, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t?.title ?? "—"}</div>
                        <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t?.artists.join(", ") ?? ""}</div>
                    </div>
                ))}
            </div>
        </div>
    )

    return (
        <div ref={ref} style={{ position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS }}>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "0.9fr 1.1fr", gap: narrow ? 28 : 64, alignItems: "center" }}>
                <div>
                    <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }}>{eyebrow}</div>
                    <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: narrow ? 40 : 60, lineHeight: 1, letterSpacing: "-0.035em", color: C.text, margin: "16px 0 18px" }}>{heading}</h2>
                    <p style={{ fontSize: 15.5, lineHeight: 1.6, color: C.subtle, margin: "0 0 24px", maxWidth: 420 }}>{body}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                        <a href={href} style={{ height: 48, borderRadius: 100, padding: "0 22px", display: "inline-flex", alignItems: "center", gap: 10, background: C.text, color: C.ink, textDecoration: "none", fontSize: 15, fontWeight: 500 }}>
                            Compose at {word.toLowerCase()} →
                        </a>
                        <SoundToggle accent={accent} />
                    </div>
                </div>
                {panel}
            </div>
        </div>
    )
}

export default function EnergyMixer(props: EnergyMixerProps) {
    return (
        <Safe name="EnergyMixer">
            <EnergyMixerInner {...props} />
        </Safe>
    )
}

addPropertyControls(EnergyMixer, {
    eyebrow: { type: ControlType.String, title: "Eyebrow", defaultValue: "03 — Find your energy" },
    heading: { type: ControlType.String, title: "Heading", defaultValue: "Slide it until it feels right." },
    body: { type: ControlType.String, title: "Body", displayTextArea: true, defaultValue: "Energy is the one dial that changes everything — tempo, texture, how hard the drums hit. Move the fader and hear how a playlist shifts." },
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
