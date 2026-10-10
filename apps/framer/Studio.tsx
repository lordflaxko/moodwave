import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import {
    api,
    C,
    EASE,
    MONO,
    SANS,
    SERIF,
    signIn,
    sized,
    startDemo,
    StreamUnavailable,
    streamGenerate,
    useFeaturedCovers,
    useSession,
    useWarming,
    type GenerateEvent,
    type GenerateInput,
    type Playlist,
    Safe,
} from "./MoodwaveAPI.tsx"

/** Accent at an opacity; works for hex, rgb() or hsl() values from the colour control. */
const mix = (color: string, amount: string) => `color-mix(in srgb, ${color} ${amount}, transparent)`

/**
 * Moodwave studio: the engine behind /create. The Composer links here with
 * `?prompt=…&auto=1&length=…&energy=…`; Studio makes sure there's a session (Spotify
 * sign-in, or the demo when allowed), generates with a progress overlay, then opens
 * the new playlist.
 */

interface StudioProps {
    playlistPath: string
    accent: string
    style?: CSSProperties
}

type Phase =
    | { kind: "idle" }
    | { kind: "auth"; input: GenerateInput }
    | { kind: "running"; input: GenerateInput }
    | { kind: "error"; message: string; input: GenerateInput }

const STEPS = ["Reading the vibe", "Sketching the arc", "Finding real records", "Checking every track", "Sequencing the flow"]

/** What the live stream has told us so far (null when generating without the stream). */
interface Live {
    events: number
    stage: "planning" | "verifying" | "filling" | "finishing"
    title: string | null
    moods: string[]
    done: number
    total: number
    have: number
    found: { title: string; artist: string; cover: string | null }[]
}
const EMPTY_LIVE: Live = { events: 0, stage: "planning", title: null, moods: [], done: 0, total: 0, have: 0, found: [] }

function applyEvent(live: Live, e: GenerateEvent): Live {
    const next = { ...live, events: live.events + 1 }
    if (e.type === "stage") return { ...next, stage: e.stage, have: e.have ?? live.have }
    if (e.type === "intent") return { ...next, title: e.title, moods: e.moods }
    if (e.type === "verifying") return { ...next, stage: "verifying", done: e.done, total: e.total }
    if (e.type === "track") return { ...next, found: [...live.found, { title: e.title, artist: e.artist, cover: e.cover }].slice(-40) }
    return next
}

function liveStep(live: Live, length: number): string {
    if (live.stage === "planning") return live.title ? `Sketching “${live.title}”` : "Reading the vibe"
    if (live.stage === "verifying") return `Checking every track · ${live.done} / ${live.total}`
    if (live.stage === "filling") return `Finding a few more that fit · ${live.have} / ${length}`
    return "Sequencing the flow"
}

function liveProgress(live: Live, elapsed: number): number {
    if (live.stage === "planning") return Math.min(0.3, 0.3 * (1 - Math.exp(-elapsed / 25)))
    if (live.stage === "verifying") return 0.3 + 0.5 * (live.total ? live.done / live.total : 0)
    if (live.stage === "filling") return 0.85
    return 0.95
}

function readRequest(): GenerateInput | null {
    const params = new URLSearchParams(window.location.search)
    const prompt = params.get("prompt")?.trim()
    if (params.get("auto") !== "1" || !prompt || prompt.length < 3) return null
    const rawLength = params.get("length")
    const rawEnergy = params.get("energy")
    const length = rawLength === null ? NaN : Number(rawLength)
    const energy = rawEnergy === null ? NaN : Number(rawEnergy)
    return {
        prompt: prompt.slice(0, 500),
        length: Number.isFinite(length) ? Math.min(100, Math.max(15, Math.round(length))) : 25,
        energy: Number.isFinite(energy) && energy >= 0 && energy <= 1 ? energy : null,
        allow_explicit: true,
        use_my_taste: false,
    }
}

/** Drop the trigger so a refresh doesn't compose a second playlist (the prompt stays). */
function clearTrigger() {
    const url = new URL(window.location.href)
    for (const key of ["auto", "length", "energy"]) url.searchParams.delete(key)
    history.replaceState(null, "", url.pathname + url.search)
}

/** Orbit of real album covers behind the prompt; each cover counter-rotates to stay upright. */
function CoverOrbit({ covers, reduced }: { covers: string[]; reduced: boolean }) {
    const n = Math.min(10, covers.length)
    return (
        <motion.div
            aria-hidden
            animate={reduced ? undefined : { rotate: 360 }}
            transition={{ duration: 80, ease: "linear", repeat: Infinity }}
            style={{ position: "absolute", width: "min(900px, 140vw)", aspectRatio: "1 / 1", pointerEvents: "none" }}
        >
            {covers.slice(0, n).map((src, i) => {
                const angle = (i / n) * Math.PI * 2
                const ring = i % 2 ? 46 : 38
                const size = i % 3 === 0 ? 92 : 72
                return (
                    <motion.img
                        key={src}
                        src={sized(src, 256)}
                        alt=""
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={reduced ? { opacity: 0.28, scale: 1 } : { opacity: [0.18, 0.42, 0.18], scale: 1, rotate: -360 }}
                        transition={{
                            opacity: { duration: 4 + (i % 4), repeat: Infinity, ease: "easeInOut", delay: i * 0.3 },
                            scale: { duration: 0.8, ease: EASE, delay: i * 0.06 },
                            rotate: { duration: 80, ease: "linear", repeat: Infinity },
                        }}
                        style={{
                            position: "absolute",
                            left: `${50 + Math.cos(angle) * ring}%`,
                            top: `${50 + Math.sin(angle) * ring}%`,
                            width: size,
                            height: size,
                            marginLeft: -size / 2,
                            marginTop: -size / 2,
                            borderRadius: 14,
                            objectFit: "cover",
                            filter: `blur(${i % 3 === 1 ? 2 : 0}px) saturate(0.85)`,
                            boxShadow: "0 20px 50px -20px rgba(0,0,0,0.9)",
                        }}
                    />
                )
            })}
        </motion.div>
    )
}

function Overlay({ prompt, accent, length, live }: { prompt: string; accent: string; length: number; live: Live | null }) {
    const reduced = Boolean(useReducedMotion())
    const featured = useFeaturedCovers(10)
    // Verified covers fly into the orbit as they're found.
    const foundCovers = live ? [...new Set(live.found.map((f) => f.cover).filter((c): c is string => Boolean(c)))].reverse() : []
    const covers = foundCovers.length >= 3 ? [...foundCovers, ...featured].slice(0, 10) : featured
    const latest = live?.found[live.found.length - 1]
    const warming = useWarming()
    const [step, setStep] = useState(0)
    const [elapsed, setElapsed] = useState(0)
    // A rough estimate so the line keeps moving; it never claims to finish early.
    const estimate = 8 + length * 0.55
    useEffect(() => {
        const started = Date.now()
        const id = window.setInterval(() => {
            const secs = (Date.now() - started) / 1000
            setElapsed(secs)
            setStep(Math.min(STEPS.length - 1, Math.floor((secs / estimate) * STEPS.length)))
        }, 200)
        return () => window.clearInterval(id)
    }, [estimate])
    const streaming = Boolean(live && live.events > 0)
    const progress = live && streaming ? liveProgress(live, elapsed) : Math.min(0.95, 1 - Math.exp(-elapsed / (estimate * 0.6)))
    const stepText = live && streaming ? liveStep(live, length) : STEPS[step]
    const slowStart = Boolean(live && live.events === 0 && elapsed > 6)
    const words = prompt.split(/\s+/)
    const beat = Math.max(0.7, 1.6 - step * 0.2)

    return createPortal(
        <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 50,
                display: "grid",
                placeItems: "center",
                padding: 24,
                overflow: "hidden",
                background: "rgba(11, 10, 13, 0.95)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
            }}
        >
            <CoverOrbit covers={covers} reduced={reduced} />
            <motion.div
                aria-hidden
                animate={reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.35, 0.6, 0.35] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                style={{
                    position: "absolute",
                    width: 620,
                    height: 620,
                    maxWidth: "120vw",
                    borderRadius: "50%",
                    background: `radial-gradient(closest-side, ${mix(accent, "25%")}, transparent)`,
                    filter: "blur(40px)",
                }}
            />
            <div style={{ position: "relative", maxWidth: 560, textAlign: "center" }}>
                <div style={{ display: "flex", justifyContent: "center", gap: 5, height: 40, alignItems: "end", marginBottom: 32 }}>
                    {Array.from({ length: 9 }).map((_, i) => (
                        <motion.span
                            key={`${i}-${beat}`}
                            animate={reduced ? { height: 12 } : { height: [8, 34, 14, 28, 8] }}
                            transition={{ duration: beat, repeat: Infinity, delay: i * (beat / 12), ease: "easeInOut" }}
                            style={{ width: 4, borderRadius: 4, background: i % 2 ? C.text : accent, opacity: 0.85 }}
                        />
                    ))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.subtle }}>
                    Composing {length} songs
                </div>
                <p style={{ fontFamily: SERIF, fontWeight: 300, fontStyle: "italic", fontSize: 28, lineHeight: 1.3, color: C.text, margin: "16px 0 28px" }}>
                    {words.map((w, i) => (
                        <motion.span
                            key={`${w}-${i}`}
                            initial={reduced ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ duration: 0.5, ease: EASE, delay: 0.2 + i * 0.07 }}
                            style={{ display: "inline-block", whiteSpace: "pre" }}
                        >
                            {(i === 0 ? "“" : "") + w + (i === words.length - 1 ? "”" : " ")}
                        </motion.span>
                    ))}
                </p>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={live && streaming ? live.stage + (live.title ?? "") : step}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.45, ease: EASE }}
                        style={{ fontFamily: SANS, fontSize: 15, color: C.muted }}
                    >
                        {stepText}…
                    </motion.div>
                </AnimatePresence>
                <div style={{ height: 22, marginTop: 10 }}>
                    <AnimatePresence mode="popLayout">
                        {latest ? (
                            <motion.div
                                key={`${latest.title}-${live?.found.length}`}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.3, ease: EASE }}
                                style={{ fontFamily: SANS, fontSize: 13, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420, margin: "0 auto" }}
                            >
                                <span style={{ color: accent }}>✓</span> {latest.title} — {latest.artist}
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
                <div style={{ width: 220, height: 2, borderRadius: 2, background: C.line2, margin: "12px auto 0", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progress * 100}%`, background: accent, transition: "width 0.4s ease-out" }} />
                </div>
                {warming || slowStart ? (
                    <p style={{ fontFamily: SANS, fontSize: 13, color: C.subtle, margin: "14px 0 0" }}>Waking up the studio… the first request after a quiet spell takes a moment.</p>
                ) : null}
                {length > 40 ? (
                    <p style={{ fontFamily: SANS, fontSize: 13, color: C.faint, margin: "14px 0 0" }}>
                        {length} songs is a big one — this can take a minute or two.
                    </p>
                ) : null}
            </div>
        </motion.div>,
        document.body,
    )
}

const card: CSSProperties = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    borderRadius: 28,
    padding: 28,
    background: C.surface,
    border: `1px solid ${C.line2}`,
    boxShadow: "0 40px 90px -40px rgba(0,0,0,0.9)",
    textAlign: "center",
    fontFamily: SANS,
}

const primaryButton = (accent: string): CSSProperties => ({
    height: 48,
    border: "none",
    borderRadius: 100,
    padding: "0 24px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
    background: accent,
    color: C.ink,
})

const ghostButton: CSSProperties = {
    height: 44,
    borderRadius: 100,
    padding: "0 20px",
    border: `1px solid ${C.line2}`,
    background: "transparent",
    color: C.muted,
    fontFamily: SANS,
    fontSize: 14,
    cursor: "pointer",
}

function StudioInner(props: StudioProps) {
    const { playlistPath = "/playlist", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const sessionState = useSession(!isStatic)
    const [phase, setPhase] = useState<Phase>({ kind: "idle" })
    const [live, setLive] = useState<Live | null>(null)
    const started = useRef(false)

    const generate = async (input: GenerateInput): Promise<Playlist> => {
        setLive(EMPTY_LIVE)
        try {
            return await streamGenerate(input, (e: GenerateEvent) => setLive((l) => applyEvent(l ?? EMPTY_LIVE, e)))
        } catch (e) {
            if (!(e instanceof StreamUnavailable)) throw e
            // No stream (older API or a blocking proxy): the plain request, with timed steps.
            setLive(null)
            return api<Playlist>("/playlists/generate", { method: "POST", body: JSON.stringify(input) })
        }
    }

    const run = async (input: GenerateInput) => {
        setPhase({ kind: "running", input })
        const startedAt = Date.now()
        try {
            const playlist = await generate(input)
            // Keep the overlay up long enough to read, even when generation is instant.
            const remaining = 2400 - (Date.now() - startedAt)
            if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
            const notice = playlist.notice ? `&notice=${encodeURIComponent(playlist.notice)}` : ""
            window.location.href = `${playlistPath}?id=${encodeURIComponent(playlist.id)}${notice}`
        } catch (e) {
            const err = e as Error & { status?: number }
            if (err.status === 401) setPhase({ kind: "auth", input })
            else setPhase({ kind: "error", message: err.message, input })
        }
    }

    // Arrived from the composer: compose once, as soon as we know who's signed in.
    useEffect(() => {
        if (isStatic || started.current || !sessionState.ready) return
        const input = readRequest()
        if (!input) return
        started.current = true
        if (sessionState.user) {
            clearTrigger()
            void run(input)
        } else {
            // Keep the trigger in the URL so Spotify sign-in brings us straight back here.
            setPhase({ kind: "auth", input })
        }
    }, [isStatic, sessionState.ready, sessionState.user])

    if (isStatic) {
        return (
            <div style={{ ...card, ...props.style, height: "auto" }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }}>Studio</div>
                <p style={{ color: C.muted, fontSize: 14, margin: "10px 0 0" }}>Sign-in, generation progress and errors appear here.</p>
            </div>
        )
    }

    const demoAllowed = Boolean(sessionState.config?.demo_allowed ?? true)
    const spotifyEnabled = Boolean(sessionState.config?.spotify_enabled)

    return (
        <div style={{ position: "relative", width: "100%", ...props.style, height: "auto" }}>
            <AnimatePresence>{phase.kind === "running" ? <Overlay key="overlay" prompt={phase.input.prompt} accent={accent} length={phase.input.length} live={live} /> : null}</AnimatePresence>

            <AnimatePresence mode="wait">
                {phase.kind === "auth" ? (
                    <motion.div key="auth" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }} style={card}>
                        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }}>One step first</div>
                        <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 32, letterSpacing: "-0.02em", color: C.text, margin: "12px 0 8px" }}>
                            Connect to start <em style={{ color: accent }}>generating</em>
                        </h2>
                        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: C.subtle, margin: "0 0 22px" }}>
                            Sign in with Spotify to build playlists from the real catalogue and save them to your account.
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                            {spotifyEnabled ? (
                                <button type="button" onClick={() => signIn()} style={{ ...primaryButton(C.text), width: "100%" }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 8, background: "#1ed760" }} /> Continue with Spotify
                                </button>
                            ) : null}
                            {demoAllowed ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            await startDemo()
                                            clearTrigger()
                                            void run(phase.input)
                                        } catch (e) {
                                            setPhase({ kind: "error", message: (e as Error).message, input: phase.input })
                                        }
                                    }}
                                    style={{ ...ghostButton, width: "100%" }}
                                >
                                    Try the demo instead
                                </button>
                            ) : null}
                        </div>
                        {sessionState.error ? <p style={{ color: C.amber, fontSize: 13, margin: "16px 0 0" }}>{sessionState.error}</p> : null}
                    </motion.div>
                ) : phase.kind === "error" ? (
                    <motion.div key="error" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.6, ease: EASE }} style={card}>
                        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.amber }}>That didn’t work</div>
                        <p style={{ fontSize: 15, lineHeight: 1.55, color: C.muted, margin: "12px 0 20px" }}>{phase.message}</p>
                        <button type="button" onClick={() => void run(phase.input)} style={primaryButton(accent)}>
                            Try again
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}

/**
 * @framerIntrinsicWidth 600
 * @framerIntrinsicHeight 120
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function Studio(props: StudioProps) {
    return (
        <Safe name="Studio">
            <StudioInner {...props} />
        </Safe>
    )
}

addPropertyControls(Studio, {
    playlistPath: { type: ControlType.String, title: "Playlist page", defaultValue: "/playlist" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
