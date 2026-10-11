import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { C, PlayerDock, requestPlay, usePlayer, Safe, type QueueItem } from "./MoodwaveAPI.tsx"

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

// The dock is rendered by one row for the whole page (see PlayerDock in MoodwaveAPI).
let dockOwner: symbol | null = null

// Every row on the page, so playing one queues the rest in page order.
const rows = new Map<symbol, { el: HTMLElement; item: QueueItem }>()
function pageQueue(): QueueItem[] {
    return [...rows.values()]
        .filter((r) => r.el.isConnected)
        .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .map((r) => r.item)
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

function TrackPlayInner(props: TrackPlayProps) {
    const { spotifyId = "", title = "Track", artist = "", accent = C.lilac, indicatorRight = 52 } = props
    const isStatic = useIsStaticRenderer()
    const state = usePlayer()
    const [hover, setHover] = useState(false)
    const [owner, setOwner] = useState(false)
    const mine = Boolean(spotifyId) && state.id === spotifyId
    const label = artist ? `${title} — ${artist}` : title
    const button = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const el = button.current
        if (isStatic || !el || !spotifyId) return
        const key = Symbol("row")
        rows.set(key, { el, item: { id: spotifyId, label } })
        return () => {
            rows.delete(key)
        }
    }, [isStatic, spotifyId, label])

    useEffect(() => {
        if (isStatic) return
        const token = Symbol("dock")
        if (!dockOwner) {
            dockOwner = token
            setOwner(true)
        }
        return () => {
            if (dockOwner === token) dockOwner = null
        }
    }, [isStatic])

    if (isStatic) return <div style={{ ...props.style }} aria-hidden />

    return (
        <>
            <button
                ref={button}
                type="button"
                disabled={!spotifyId}
                aria-label={mine && state.playing ? `Pause ${label}` : `Play ${label}`}
                aria-pressed={mine && state.playing}
                onPointerEnter={() => setHover(true)}
                onPointerLeave={() => setHover(false)}
                onClick={() => spotifyId && requestPlay(spotifyId, label, pageQueue())}
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
            {owner ? <PlayerDock accent={accent} /> : null}
        </>
    )
}

export default function TrackPlay(props: TrackPlayProps) {
    return (
        <Safe name="TrackPlay">
            <TrackPlayInner {...props} />
        </Safe>
    )
}

addPropertyControls(TrackPlay, {
    spotifyId: { type: ControlType.String, title: "Spotify ID" },
    title: { type: ControlType.String, title: "Title", defaultValue: "Track" },
    artist: { type: ControlType.String, title: "Artist", defaultValue: "" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
    indicatorRight: { type: ControlType.Number, title: "Indicator right", min: 0, max: 200, unit: "px", defaultValue: 52 },
})
