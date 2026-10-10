import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion } from "framer-motion"
import {
    startTransition,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react"

import { registerComposer, Safe, useSession } from "./MoodwaveAPI.tsx"

/** Accent at an opacity; works for hex, rgb() or hsl() values from the colour control. */
const mix = (color: string, amount: string) => `color-mix(in srgb, ${color} ${amount}, transparent)`

/**
 * Moodwave composer: the floating prompt box. Submitting opens the studio page
 * (`/create?prompt=…&auto=1`), where the Studio component generates the playlist.
 */

type EnergyKey = "auto" | "calm" | "steady" | "lift" | "peak"

interface ComposerProps {
    target: string
    placeholderLead: string
    phrases: string[]
    accent: string
    style?: CSSProperties
}

const ENERGY: { key: EnergyKey; label: string; value: number | null }[] = [
    { key: "auto", label: "Auto", value: null },
    { key: "calm", label: "Calm", value: 0.2 },
    { key: "steady", label: "Steady", value: 0.45 },
    { key: "lift", label: "Lift", value: 0.68 },
    { key: "peak", label: "Peak", value: 0.9 },
]

// A pasted Spotify song or playlist link becomes the seed ("start from this").
const SPOTIFY_LINK = /(?:https?:\/\/)?open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|playlist)\/[A-Za-z0-9]+(?:\?\S*)?|spotify:(track|playlist):[A-Za-z0-9]+/i
const TASTE_KEY = "mw_blend_taste"

function readTaste(): boolean {
    try {
        return window.localStorage.getItem(TASTE_KEY) === "1"
    } catch {
        return false
    }
}

const MIN_SONGS = 15
const MAX_SONGS = 100
const clampSongs = (n: number) => Math.min(MAX_SONGS, Math.max(MIN_SONGS, Math.round(n)))

const SERIF = '"Fraunces", "Fraunces Placeholder", Georgia, serif'
const SANS = '"Inter", "Inter Placeholder", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "JetBrains Mono Placeholder", ui-monospace, monospace'

function useTypewriter(phrases: string[], active: boolean) {
    const [text, setText] = useState("")
    useEffect(() => {
        if (!active || phrases.length === 0) return
        let phrase = 0
        let char = 0
        let deleting = false
        let timer = 0
        const tick = () => {
            const current = phrases[phrase] ?? ""
            if (!deleting) {
                char++
                setText(current.slice(0, char))
                if (char >= current.length) {
                    deleting = true
                    timer = window.setTimeout(tick, 2400)
                    return
                }
                timer = window.setTimeout(tick, 42 + Math.random() * 45)
            } else {
                char -= 2
                setText(current.slice(0, Math.max(0, char)))
                if (char <= 0) {
                    deleting = false
                    phrase = (phrase + 1) % phrases.length
                    timer = window.setTimeout(tick, 380)
                    return
                }
                timer = window.setTimeout(tick, 16)
            }
        }
        timer = window.setTimeout(tick, 900)
        return () => window.clearTimeout(timer)
    }, [phrases, active])
    return text
}

/**
 * Song count: type any number from 15 to 100, or use − / + (hold to speed up).
 */
function LengthField({ value, onChange, pill }: { value: number; onChange: (n: number) => void; pill: CSSProperties }) {
    const [draft, setDraft] = useState(String(value))
    const latest = useRef(value)
    const timer = useRef(0)
    latest.current = value

    useEffect(() => setDraft(String(value)), [value])
    useEffect(() => () => window.clearTimeout(timer.current), [])

    const commit = () => {
        const n = Number(draft)
        const next = Number.isFinite(n) && draft.trim() ? clampSongs(n) : value
        onChange(next)
        setDraft(String(next))
    }

    // Press: step once; keep holding: repeat, getting faster.
    const startHold = (dir: 1 | -1) => {
        let delay = 380
        const tick = () => {
            const next = clampSongs(latest.current + dir)
            if (next === latest.current) return
            latest.current = next
            onChange(next)
            delay = Math.max(40, delay * 0.8)
            timer.current = window.setTimeout(tick, delay)
        }
        tick()
    }
    const stopHold = () => window.clearTimeout(timer.current)

    const button = (dir: 1 | -1) => {
        const atEdge = dir === 1 ? value >= MAX_SONGS : value <= MIN_SONGS
        return (
            <button
                type="button"
                aria-label={dir === 1 ? "More songs" : "Fewer songs"}
                disabled={atEdge}
                onPointerDown={(e) => {
                    e.preventDefault()
                    startHold(dir)
                }}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onChange(clampSongs(value + dir))
                    }
                }}
                style={{ ...pill, border: "none", padding: "0 10px", opacity: atEdge ? 0.35 : 1, touchAction: "manipulation" }}
            >
                {dir === 1 ? "+" : "−"}
            </button>
        )
    }

    return (
        <div role="group" aria-label="Playlist length" style={{ ...pill, padding: 0, gap: 0, cursor: "default" }}>
            {button(-1)}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#b3ada4" }}>
                <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={`Number of songs, ${MIN_SONGS} to ${MAX_SONGS}`}
                    value={draft}
                    maxLength={3}
                    onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
                    onFocus={(e) => e.target.select()}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault()
                            commit()
                            ;(e.target as HTMLInputElement).blur()
                        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault()
                            onChange(clampSongs(value + (e.key === "ArrowUp" ? 1 : -1)))
                        }
                    }}
                    style={{
                        width: "3ch",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px dashed rgba(242,239,233,0.2)",
                        outline: "none",
                        padding: "2px 0",
                        textAlign: "center",
                        color: "#f2efe9",
                        font: "inherit",
                        letterSpacing: "0.04em",
                        fontVariantNumeric: "tabular-nums",
                    }}
                />
                songs
            </label>
            {button(1)}
        </div>
    )
}

function ComposerInner(props: ComposerProps) {
    const {
        target = "/create",
        placeholderLead = "Music for",
        phrases = ["the drive home after a long week…"],
        accent = "#c6b1f0",
    } = props
    const isStatic = useIsStaticRenderer()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [value, setValue] = useState("")
    const [focused, setFocused] = useState(false)
    const [length, setLength] = useState(25)
    const [energy, setEnergy] = useState<EnergyKey>("auto")
    const [seed, setSeed] = useState<{ url: string; kind: string } | null>(null)
    const [taste, setTaste] = useState(false)
    const session = useSession(!isStatic)
    const canBlend = Boolean(session.user && !session.user.is_demo)
    const typed = useTypewriter(phrases, !isStatic && !value && !focused)
    const ready = value.trim().length >= 3 || Boolean(seed)

    useEffect(() => setTaste(readTaste()), [])

    // Suggestion chips elsewhere on the page fill this box (see prefillComposer).
    useEffect(() => {
        if (isStatic) return
        const unregister = registerComposer()
        const onPrefill = (e: Event) => {
            const prompt = (e as CustomEvent<{ prompt: string }>).detail?.prompt
            if (!prompt) return
            setValue(prompt.slice(0, 500))
            const el = textareaRef.current
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" })
                el.focus({ preventScroll: true })
                window.setTimeout(() => el.setSelectionRange(el.value.length, el.value.length), 0)
            }
        }
        window.addEventListener("mw:prefill", onPrefill)
        return () => {
            unregister()
            window.removeEventListener("mw:prefill", onPrefill)
        }
    }, [isStatic])

    const toggleTaste = () => {
        const next = !taste
        setTaste(next)
        try {
            window.localStorage.setItem(TASTE_KEY, next ? "1" : "0")
        } catch {
            // Storage blocked: the choice lasts for this page.
        }
    }

    /** Pull a Spotify link out of the text into the seed chip. */
    const takeLink = (text: string) => {
        const match = text.match(SPOTIFY_LINK)
        if (!match) return text
        const url = match[0].startsWith("spotify:") || match[0].startsWith("http") ? match[0] : `https://${match[0]}`
        setSeed({ url, kind: (match[1] || match[2] || "track").toLowerCase() })
        return text.replace(match[0], "").replace(/\s{2,}/g, " ").trimStart()
    }

    // On the studio page, show the prompt you arrived with (after mount, so hydration matches).
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const prompt = params.get("prompt")
        if (prompt) setValue(prompt.slice(0, 500))
        const seedUrl = params.get("seed")
        if (seedUrl) takeLink(seedUrl)
        // Arriving from the energy mixer: preset the nearest energy level.
        const level = Number(params.get("energy"))
        if (params.get("energy") !== null && Number.isFinite(level)) {
            const nearest = ENERGY.filter((e) => e.value !== null).reduce((best, e) => (Math.abs((e.value ?? 0) - level) < Math.abs((best.value ?? 0) - level) ? e : best))
            setEnergy(nearest.key)
        }
    }, [])

    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = "auto"
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }, [value])

    function submit() {
        if (!ready || typeof window === "undefined") return
        const prompt = value.trim().length >= 3 ? value.trim() : "More like this"
        const params = new URLSearchParams({ prompt, auto: "1", length: String(length) })
        const level = ENERGY.find((e) => e.key === energy)?.value
        if (level != null) params.set("energy", String(level))
        if (seed) params.set("seed", seed.url)
        if (canBlend && taste) params.set("taste", "1")
        window.location.href = `${target}?${params.toString()}`
    }

    const pill: CSSProperties = {
        height: 32,
        borderRadius: 100,
        border: "1px solid rgba(242, 239, 233, 0.13)",
        background: "transparent",
        color: "#8a847c",
        fontFamily: SANS,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 12px",
        cursor: "pointer",
    }

    return (
        <motion.form
            onSubmit={(e) => {
                e.preventDefault()
                submit()
            }}
            aria-label="Describe your playlist"
            animate={{ scale: focused ? 1.012 : 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: "relative", width: "100%", ...props.style, height: "auto" }}
        >
            {/* Halo: blooms when the composer has focus */}
            <motion.div
                aria-hidden
                animate={{ opacity: focused ? 0.9 : 0.35, scale: focused ? 1.04 : 0.96 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                style={{
                    position: "absolute",
                    inset: -40,
                    borderRadius: 64,
                    background: `radial-gradient(closest-side, ${mix(accent, "28%")}, transparent)`,
                    filter: "blur(28px)",
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            />
            <div
                style={{
                    position: "relative",
                    zIndex: 1,
                    borderRadius: 32,
                    padding: 8,
                    background: "rgba(18, 16, 21, 0.86)",
                    border: `1px solid ${focused ? `${mix(accent, "36%")}` : "rgba(242, 239, 233, 0.13)"}`,
                    boxShadow: "0 40px 120px -40px rgba(0,0,0,0.9)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    transition: "border-color 0.5s ease",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 20px 0" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8a847c", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 6, background: accent }} />
                        New playlist
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#5d5852" }}>
                        {value.length > 0 ? `${value.length}/500` : "Enter ↵ to compose"}
                    </span>
                </div>

                <div style={{ position: "relative", padding: "12px 20px 8px" }}>
                    <label htmlFor="mw-prompt" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                        Describe a moment, a feeling, or a place
                    </label>
                    <textarea
                        id="mw-prompt"
                        ref={textareaRef}
                        value={value}
                        rows={2}
                        maxLength={500}
                        onChange={(e) => {
                            const next = takeLink(e.target.value)
                            startTransition(() => setValue(next))
                        }}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                submit()
                            }
                        }}
                        style={{
                            display: "block",
                            width: "100%",
                            minHeight: 76,
                            resize: "none",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "#f2efe9",
                            fontFamily: SERIF,
                            fontWeight: 300,
                            fontSize: 30,
                            lineHeight: 1.3,
                            letterSpacing: "-0.02em",
                            padding: 0,
                            margin: 0,
                        }}
                    />
                    {!value ? (
                        <div
                            aria-hidden
                            style={{
                                position: "absolute",
                                top: 12,
                                left: 20,
                                right: 20,
                                pointerEvents: "none",
                                fontFamily: SERIF,
                                fontWeight: 300,
                                fontSize: 30,
                                lineHeight: 1.3,
                                letterSpacing: "-0.02em",
                                color: "#5d5852",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                            }}
                        >
                            {seed ? (
                                "Add a mood, or just press Compose…"
                            ) : focused ? (
                                "Describe a moment, a feeling, or a place — or paste a Spotify link…"
                            ) : (
                                <>
                                    <span style={{ fontStyle: "italic", color: "#8a847c" }}>{placeholderLead} </span>
                                    {isStatic ? phrases[0] : typed}
                                    <span style={{ display: "inline-block", width: 1, height: "0.9em", marginLeft: 2, transform: "translateY(0.12em)", background: accent }} />
                                </>
                            )}
                        </div>
                    ) : null}
                </div>

                {seed ? (
                    <div style={{ padding: "0 20px 10px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 30, padding: "0 6px 0 12px", borderRadius: 100, background: mix(accent, "14%"), border: `1px solid ${mix(accent, "40%")}`, color: "#f2efe9", fontFamily: SANS, fontSize: 13 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 7, background: "#1ed760" }} />
                            Starting from a Spotify {seed.kind === "playlist" ? "playlist" : "song"}
                            <button type="button" aria-label="Remove the Spotify link" onClick={() => setSeed(null)} style={{ width: 22, height: 22, borderRadius: 22, border: "none", background: "rgba(242,239,233,0.08)", color: "#f2efe9", cursor: "pointer", lineHeight: 1 }}>
                                ×
                            </button>
                        </span>
                    </div>
                ) : null}

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        borderTop: "1px solid rgba(242, 239, 233, 0.07)",
                        padding: "12px 12px 6px",
                    }}
                >
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                        <LengthField value={length} onChange={setLength} pill={pill} />
                        {canBlend ? (
                            <button
                                type="button"
                                role="switch"
                                aria-checked={taste}
                                onClick={toggleTaste}
                                title="Lightly mix in the artists you listen to most on Spotify"
                                style={{ ...pill, borderColor: taste ? mix(accent, "55%") : "rgba(242, 239, 233, 0.13)", color: taste ? "#f2efe9" : "#8a847c", background: taste ? mix(accent, "12%") : "transparent" }}
                            >
                                <span aria-hidden style={{ position: "relative", width: 24, height: 14, borderRadius: 14, background: taste ? accent : "rgba(242,239,233,0.14)", transition: "background 0.25s ease" }}>
                                    <span style={{ position: "absolute", top: 2, left: taste ? 12 : 2, width: 10, height: 10, borderRadius: 10, background: taste ? "#0b0a0d" : "#8a847c", transition: "left 0.25s ease" }} />
                                </span>
                                Blend my taste
                            </button>
                        ) : null}
                        <div role="radiogroup" aria-label="Energy" style={{ display: "flex", borderRadius: 100, background: "rgba(242,239,233,0.04)", padding: 3 }}>
                            {ENERGY.map((e) => {
                                const active = e.key === energy
                                return (
                                    <button
                                        key={e.key}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setEnergy(e.key)}
                                        style={{
                                            border: "none",
                                            borderRadius: 100,
                                            padding: "6px 10px",
                                            fontFamily: SANS,
                                            fontSize: 12.5,
                                            cursor: "pointer",
                                            background: active ? "#f2efe9" : "transparent",
                                            color: active ? "#0b0a0d" : "#8a847c",
                                            transition: "background 0.3s ease, color 0.3s ease",
                                        }}
                                    >
                                        {e.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <motion.button
                        type="submit"
                        disabled={!ready}
                        whileTap={{ scale: 0.92 }}
                        style={{
                            height: 44,
                            border: "none",
                            borderRadius: 100,
                            padding: "0 6px 0 18px",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            fontFamily: SANS,
                            fontWeight: 500,
                            fontSize: 14,
                            cursor: ready ? "pointer" : "default",
                            background: ready ? accent : "rgba(242,239,233,0.06)",
                            color: ready ? "#0b0a0d" : "#5d5852",
                            boxShadow: ready ? `0 12px 40px -10px ${accent}` : "none",
                            transition: "background 0.5s ease, color 0.5s ease, box-shadow 0.5s ease",
                        }}
                    >
                        Compose
                        <span style={{ width: 32, height: 32, borderRadius: 32, display: "grid", placeItems: "center", background: ready ? "#0b0a0d" : "rgba(242,239,233,0.05)", color: ready ? accent : "#5d5852" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M12 19V5M5 12l7-7 7 7" />
                            </svg>
                        </span>
                    </motion.button>
                </div>
            </div>
        </motion.form>
    )
}

/**
 * @framerIntrinsicWidth 680
 * @framerIntrinsicHeight 230
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function Composer(props: ComposerProps) {
    return (
        <Safe name="Composer">
            <ComposerInner {...props} />
        </Safe>
    )
}

addPropertyControls(Composer, {
    target: {
        type: ControlType.String,
        title: "Studio page",
        defaultValue: "/create",
    },
    placeholderLead: {
        type: ControlType.String,
        title: "Lead",
        defaultValue: "Music for",
    },
    phrases: {
        type: ControlType.Array,
        title: "Typewriter",
        control: { type: ControlType.String },
        defaultValue: [
            "the drive home after a long week…",
            "a rainy afternoon with a good book…",
            "the last hour of a house party…",
            "cooking pasta for friends, windows open…",
            "a 2 AM walk through an empty city…",
            "the first warm day of spring…",
        ],
    },
    accent: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: "#c6b1f0",
    },
})
