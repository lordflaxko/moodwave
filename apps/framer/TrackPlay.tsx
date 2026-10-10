import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { C, EASE, SANS } from "./MoodwaveAPI.tsx"

/**
 * Makes a CMS track row playable. Placed over the row (absolute, full size), it is an
 * invisible button: click to play that song in a single shared Spotify player docked at
 * the bottom of the screen. A small indicator by the duration shows ▶ on hover and
 * bouncing bars while Spotify reports the song is actually playing.
 *
 * Uses Spotify's iFrame API (https://open.spotify.com/embed/iframe-api/v1). Listeners get
 * a 30-second preview, or the full track when signed in to Spotify in the browser.
 */

interface TrackPlayProps {
    spotifyId: string
    title: string
    artist: string
    accent: string
    indicatorRight: number
    style?: CSSProperties
}

// --- Shared player store (one player for every row on the page) ---------------------------
interface SpotifyController {
    loadUri: (uri: string) => void
    play: () => void
    togglePlay: () => void
    destroy?: () => void
    addListener: (event: string, cb: (e: { data: { isPaused: boolean; position: number; duration: number } }) => void) => void
}
interface PlayerState {
    id: string | null
    label: string
    playing: boolean
}
let player: PlayerState = { id: null, label: "", playing: false }
const listeners = new Set<(s: PlayerState) => void>()
const set = (patch: Partial<PlayerState>) => {
    player = { ...player, ...patch }
    listeners.forEach((fn) => fn(player))
}

let controller: SpotifyController | null = null
let apiPromise: Promise<{ createController: (el: HTMLElement, opts: object, cb: (c: SpotifyController) => void) => void }> | null = null

function loadIframeApi() {
    apiPromise ??= new Promise((resolve) => {
        const w = window as unknown as { onSpotifyIframeApiReady?: (api: never) => void }
        w.onSpotifyIframeApiReady = (api) => resolve(api)
        const script = document.createElement("script")
        script.src = "https://open.spotify.com/embed/iframe-api/v1"
        script.async = true
        document.body.appendChild(script)
    })
    return apiPromise
}

/** Called from a click, so the browser treats playback as user-initiated. */
async function playTrack(id: string, label: string, mount: HTMLElement | null) {
    const uri = `spotify:track:${id}`
    if (player.id === id && controller) {
        controller.togglePlay()
        return
    }
    set({ id, label, playing: player.playing && Boolean(controller) })
    if (controller) {
        controller.loadUri(uri)
        controller.play()
        return
    }
    if (!mount) return
    const api = await loadIframeApi()
    api.createController(mount, { uri, width: "100%", height: 80, theme: "dark" }, (c) => {
        controller = c
        c.addListener("ready", () => c.play())
        c.addListener("playback_update", (e) => set({ playing: !e.data.isPaused }))
    })
}

function closePlayer() {
    controller?.destroy?.()
    controller = null
    set({ id: null, label: "", playing: false })
}

function usePlayer() {
    const [state, setState] = useState(player)
    useEffect(() => {
        listeners.add(setState)
        return () => {
            listeners.delete(setState)
        }
    }, [])
    return state
}

// The dock (and the Spotify iframe inside it) is rendered by one row for the whole page,
// so switching songs reuses the same player instead of tearing it down.
let dockOwner: symbol | null = null
function Dock({ label, accent }: { label: string; accent: string }) {
    return createPortal(
        <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 40, display: "flex", justifyContent: "center", pointerEvents: "none" }}
        >
            <div style={{ pointerEvents: "auto", width: "100%", maxWidth: 560, borderRadius: 16, overflow: "hidden", background: C.surface, border: `1px solid ${C.line2}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.9)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", fontFamily: SANS, fontSize: 12.5, color: C.subtle }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 6, background: accent, flexShrink: 0 }} />
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Now playing · {label}</span>
                    </span>
                    <button type="button" onClick={closePlayer} aria-label="Close player" style={{ width: 24, height: 24, borderRadius: 24, border: "none", background: C.surface3, color: C.text, cursor: "pointer" }}>
                        ×
                    </button>
                </div>
                <div id="mw-spotify-mount" />
            </div>
        </motion.div>,
        document.body,
    )
}

function Bars({ color, playing }: { color: string; playing: boolean }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12 }}>
            {[0, 1, 2].map((i) => (
                <motion.span
                    key={i}
                    animate={playing ? { height: [3, 12, 5, 10, 3] } : { height: 4 }}
                    transition={playing ? { duration: 0.9, repeat: Infinity, delay: i * 0.15 } : { duration: 0.3 }}
                    style={{ width: 3, borderRadius: 2, background: color }}
                />
            ))}
        </span>
    )
}

/**
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 60
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function TrackPlay(props: TrackPlayProps) {
    const { spotifyId = "", title = "Track", artist = "", accent = C.lilac, indicatorRight = 52 } = props
    const isStatic = useIsStaticRenderer()
    const state = usePlayer()
    const [hover, setHover] = useState(false)
    const [owner, setOwner] = useState(false)
    const mine = Boolean(spotifyId) && state.id === spotifyId
    const label = artist ? `${title} — ${artist}` : title

    useEffect(() => {
        if (isStatic) return
        const token = Symbol("dock")
        if (!dockOwner) {
            dockOwner = token
            setOwner(true)
        }
        return () => {
            if (dockOwner === token) {
                dockOwner = null
                closePlayer()
            }
        }
    }, [isStatic])

    // First play: once the dock has rendered its mount node, create the Spotify player there.
    useEffect(() => {
        if (!owner || !state.id || controller) return
        const mount = document.getElementById("mw-spotify-mount")
        if (mount) void playTrack(state.id, state.label, mount)
    }, [owner, state.id, state.label])

    if (isStatic) return <div style={{ ...props.style }} aria-hidden />

    return (
        <>
            <button
                type="button"
                disabled={!spotifyId}
                aria-label={mine && state.playing ? `Pause ${label}` : `Play ${label}`}
                aria-pressed={mine && state.playing}
                onPointerEnter={() => setHover(true)}
                onPointerLeave={() => setHover(false)}
                onClick={() => {
                    if (!spotifyId) return
                    // With a player already open this plays straight away (inside the click);
                    // otherwise it opens the dock and the owner row creates the player.
                    if (controller) void playTrack(spotifyId, label, null)
                    else set({ id: spotifyId, label, playing: false })
                }}
                style={{ ...props.style, position: "relative", display: "block", border: "none", padding: 0, margin: 0, background: "transparent", cursor: spotifyId ? "pointer" : "default", borderRadius: 14 }}
            >
                <span
                    aria-hidden
                    style={{
                        position: "absolute",
                        right: indicatorRight,
                        top: "50%",
                        transform: "translateY(-50%)",
                        display: "grid",
                        placeItems: "center",
                        width: 22,
                        height: 22,
                        opacity: mine || hover ? 1 : 0,
                        transition: "opacity 0.25s ease",
                        color: C.text,
                        fontSize: 11,
                    }}
                >
                    {mine ? <Bars color={accent} playing={state.playing} /> : "▶"}
                </span>
            </button>
            <AnimatePresence>{owner && state.id ? <Dock key="dock" label={state.label} accent={accent} /> : null}</AnimatePresence>
        </>
    )
}

addPropertyControls(TrackPlay, {
    spotifyId: { type: ControlType.String, title: "Spotify ID" },
    title: { type: ControlType.String, title: "Title", defaultValue: "Track" },
    artist: { type: ControlType.String, title: "Artist", defaultValue: "" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    indicatorRight: { type: ControlType.Number, title: "Indicator right", min: 0, max: 200, unit: "px", defaultValue: 52 },
})
