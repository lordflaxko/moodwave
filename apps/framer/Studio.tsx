import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
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
    startDemo,
    useSession,
    type GenerateInput,
    type Playlist,
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
        length: Number.isFinite(length) ? Math.min(30, Math.max(15, Math.round(length))) : 24,
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

function Overlay({ prompt, accent }: { prompt: string; accent: string }) {
    const [step, setStep] = useState(0)
    useEffect(() => {
        const id = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2600)
        return () => window.clearInterval(id)
    }, [])
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
                background: "rgba(11, 10, 13, 0.94)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
            }}
        >
            <motion.div
                aria-hidden
                animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.6, 0.35] }}
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
                    {Array.from({ length: 7 }).map((_, i) => (
                        <motion.span
                            key={i}
                            animate={{ height: [8, 34, 14, 28, 8] }}
                            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                            style={{ width: 4, borderRadius: 4, background: i % 2 ? C.text : accent, opacity: 0.85 }}
                        />
                    ))}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.subtle }}>
                    Composing your playlist
                </div>
                <p style={{ fontFamily: SERIF, fontWeight: 300, fontStyle: "italic", fontSize: 28, lineHeight: 1.3, color: C.text, margin: "16px 0 28px" }}>
                    “{prompt}”
                </p>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.45, ease: EASE }}
                        style={{ fontFamily: SANS, fontSize: 15, color: C.muted }}
                    >
                        {STEPS[step]}…
                    </motion.div>
                </AnimatePresence>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 18 }}>
                    {STEPS.map((_, i) => (
                        <span key={i} style={{ width: 18, height: 2, borderRadius: 2, background: i <= step ? accent : C.line2, transition: "background 0.5s ease" }} />
                    ))}
                </div>
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

/**
 * @framerIntrinsicWidth 600
 * @framerIntrinsicHeight 120
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function Studio(props: StudioProps) {
    const { playlistPath = "/playlist", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const sessionState = useSession(!isStatic)
    const [phase, setPhase] = useState<Phase>({ kind: "idle" })
    const started = useRef(false)

    const run = async (input: GenerateInput) => {
        setPhase({ kind: "running", input })
        const startedAt = Date.now()
        try {
            const playlist = await api<Playlist>("/playlists/generate", { method: "POST", body: JSON.stringify(input) })
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
            <AnimatePresence>{phase.kind === "running" ? <Overlay key="overlay" prompt={phase.input.prompt} accent={accent} /> : null}</AnimatePresence>

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

addPropertyControls(Studio, {
    playlistPath: { type: ControlType.String, title: "Playlist page", defaultValue: "/playlist" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
