import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import {
    API_URL,
    C,
    Collage,
    duration,
    EASE,
    energyLabel,
    MONO,
    PlayerDock,
    playQueue,
    relativeTime,
    requestPlay,
    SANS,
    SERIF,
    usePlayer,
    type Intent,
    type PlaylistCoverChoice,
    type QueueItem,
    type Track,
    Safe,
} from "./MoodwaveAPI.tsx"

/**
 * A shared playlist (`/p?s=<slug>`), opened from a Moodwave share link. Read-only: the
 * cover, the mood, every song (playable in the shared player) and a "make your own" nudge.
 * Needs no sign-in.
 */

interface SharedPlaylistProps {
    createPath: string
    accent: string
    style?: CSSProperties
}

interface Shared {
    slug: string
    title: string
    description: string
    prompt: string
    intent: Intent
    tracks: Track[]
    stats: { track_count: number; total_duration_ms: number; artist_count: number; avg_energy: number | null }
    cover: PlaylistCoverChoice
    curator: string
    created_at: string
}

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }
const pill: CSSProperties = { height: 44, borderRadius: 100, padding: "0 20px", border: `1px solid ${C.line2}`, background: "transparent", color: C.muted, fontFamily: SANS, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", whiteSpace: "nowrap" }

const spotifyId = (t: Track) => t.uri.split(":").pop() ?? t.id
const isSpotify = (t: Track) => t.uri.startsWith("spotify:track:")

function useWidth() {
    const ref = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(1100)
    useEffect(() => {
        const el = ref.current
        if (!el || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width))
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])
    return [ref, width] as const
}

function SharedPlaylistInner(props: SharedPlaylistProps) {
    const { createPath = "/create", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const [ref, width] = useWidth()
    const narrow = width < 760
    const player = usePlayer()
    const [data, setData] = useState<Shared | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isStatic) return
        const slug = new URLSearchParams(window.location.search).get("s")
        if (!slug) return setError("This link is missing its playlist.")
        fetch(`${API_URL}/share/${encodeURIComponent(slug)}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(res.status === 404 ? "This share link doesn’t exist or was turned off." : "Couldn’t open this playlist. Try again in a moment.")
                return (await res.json()) as Shared
            })
            .then((d) => {
                setData(d)
                document.title = `${d.title} · Moodwave`
            })
            .catch((e: Error) => setError(e.message))
    }, [isStatic])

    const root: CSSProperties = { position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS, color: C.text }

    if (isStatic || (!data && !error)) {
        return (
            <div ref={ref} style={root} aria-busy={!isStatic}>
                <div style={{ display: "flex", gap: 40, flexDirection: narrow ? "column" : "row" }}>
                    <motion.div animate={isStatic ? undefined : { opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ width: narrow ? "100%" : 320, aspectRatio: "1 / 1", borderRadius: 24, background: C.surface2 }} />
                    <div style={{ flex: 1 }}>
                        <div style={eyebrow}>{isStatic ? "Shared playlist (loads from the link on the live site)" : "Opening…"}</div>
                        <div style={{ width: "70%", height: 54, borderRadius: 14, background: C.surface2, marginTop: 16 }} />
                    </div>
                </div>
            </div>
        )
    }

    if (error || !data) {
        return (
            <div ref={ref} style={{ ...root, textAlign: "center", padding: "80px 0" }}>
                <div style={eyebrow}>Shared playlist</div>
                <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 40, letterSpacing: "-0.02em", margin: "14px 0 10px" }}>Nothing to play here</h2>
                <p style={{ color: C.subtle, margin: "0 0 24px" }}>{error}</p>
                <a href={createPath} style={{ ...pill, background: accent, color: C.ink, border: "none", fontWeight: 500 }}>
                    Make your own playlist →
                </a>
            </div>
        )
    }

    const queue: QueueItem[] = data.tracks.filter(isSpotify).map((t) => ({ id: spotifyId(t), label: `${t.title} — ${t.artists.join(", ")}` }))
    const playingHere = Boolean(player.id && queue.some((q) => q.id === player.id))
    const covers = data.cover?.images?.length ? data.cover.images : data.tracks.map((t) => t.image_url)
    const makeOwn = `${createPath}?prompt=${encodeURIComponent(data.prompt)}`

    return (
        <div ref={ref} style={root}>
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE }}
                style={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: narrow ? 28 : 48, alignItems: narrow ? "stretch" : "flex-end" }}
            >
                <div style={{ width: narrow ? "100%" : 320, flexShrink: 0, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)", borderRadius: 24 }}>
                    <Collage images={covers} size="100%" radius={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={eyebrow}>
                        Shared by {data.curator} · {relativeTime(data.created_at)}
                    </div>
                    <h1 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: narrow ? 44 : 64, lineHeight: 1, letterSpacing: "-0.03em", margin: "14px 0 14px" }}>{data.title}</h1>
                    <p style={{ fontSize: 16, lineHeight: 1.55, color: C.muted, margin: 0, maxWidth: 560 }}>{data.description}</p>
                    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 17, color: C.subtle, margin: "12px 0 0" }}>“{data.prompt}”</p>
                    <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, 1fr)" : "repeat(4, auto)", justifyContent: "start", gap: narrow ? 16 : 36, marginTop: 26 }}>
                        {[
                            ["Songs", String(data.stats.track_count)],
                            ["Duration", duration(data.stats.total_duration_ms, true)],
                            ["Mood", data.intent.moods[0] ?? "—"],
                            ["Energy", energyLabel(data.stats.avg_energy ?? data.intent.energy)],
                        ].map(([k, v]) => (
                            <div key={k}>
                                <div style={{ ...eyebrow, fontSize: 10 }}>{k}</div>
                                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 300, marginTop: 4, textTransform: "capitalize" }}>{v}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 22 }}>
                        {queue.length ? (
                            <button
                                type="button"
                                onClick={() => (playingHere ? requestPlay(player.id ?? "", player.label, queue) : playQueue(queue))}
                                style={{ ...pill, background: accent, color: C.ink, border: "none", fontWeight: 500 }}
                            >
                                {playingHere && player.playing ? "❚❚ Pause" : playingHere ? "▶ Resume" : "▶ Play all"}
                            </button>
                        ) : null}
                        <a href={makeOwn} style={{ ...pill, background: C.text, color: C.ink, border: "none", fontWeight: 500 }}>
                            Make your own →
                        </a>
                    </div>
                </div>
            </motion.section>

            <section style={{ marginTop: 48 }} aria-label="Tracks">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${C.line}`, paddingBottom: 12, marginBottom: 6 }}>
                    <div style={eyebrow}>Tracklist</div>
                    <div style={{ ...eyebrow, color: C.faint }}>{data.stats.artist_count} artists</div>
                </div>
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {data.tracks.map((t, i) => {
                        const playable = isSpotify(t)
                        const active = player.id === spotifyId(t)
                        return (
                            <motion.li
                                key={t.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 12) * 0.03 }}
                                whileHover={{ backgroundColor: C.surface2 }}
                                style={{ borderRadius: 14, background: active ? C.surface2 : "transparent" }}
                            >
                                <button
                                    type="button"
                                    disabled={!playable}
                                    aria-label={`${active && player.playing ? "Pause" : "Play"} ${t.title} by ${t.artists.join(", ")}`}
                                    onClick={() => requestPlay(spotifyId(t), `${t.title} — ${t.artists.join(", ")}`, queue)}
                                    style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: narrow ? "28px 44px minmax(0, 1fr)" : "32px 48px minmax(0, 1fr) auto", gap: 14, alignItems: "center", padding: 10, cursor: playable ? "pointer" : "default" }}
                                >
                                    <span style={{ fontFamily: MONO, fontSize: 12, color: active ? accent : C.faint, textAlign: "right" }}>{active ? (player.playing ? "♪" : "▶") : String(i + 1).padStart(2, "0")}</span>
                                    {t.image_url ? <img src={t.image_url} alt="" loading="lazy" decoding="async" width={narrow ? 44 : 48} height={narrow ? 44 : 48} style={{ borderRadius: 8, objectFit: "cover", display: "block" }} /> : <span style={{ width: 44, height: 44, borderRadius: 8, background: C.surface3 }} />}
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: "block", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                                        <span style={{ display: "block", fontSize: 13, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.artists.join(", ")}</span>
                                        {t.reason ? <span style={{ display: "block", fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 14, color: C.muted, marginTop: 3, whiteSpace: narrow ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.reason}</span> : null}
                                    </span>
                                    {!narrow ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.subtle }}>{duration(t.duration_ms)}</span> : null}
                                </button>
                            </motion.li>
                        )
                    })}
                </ol>
            </section>

            <section style={{ marginTop: 56, padding: narrow ? 22 : 32, borderRadius: 24, background: C.surface, border: `1px solid ${C.line2}`, display: "flex", flexDirection: narrow ? "column" : "row", gap: 20, alignItems: narrow ? "flex-start" : "center", justifyContent: "space-between" }}>
                <div>
                    <div style={eyebrow}>Moodwave</div>
                    <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 26, lineHeight: 1.25, margin: "10px 0 0", maxWidth: 520 }}>Describe a moment, get a playlist of real songs — then save it to Spotify.</p>
                </div>
                <a href={makeOwn} style={{ ...pill, background: accent, color: C.ink, border: "none", fontWeight: 500 }}>
                    Start from this mood →
                </a>
            </section>

            <PlayerDock accent={accent} />
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
export default function SharedPlaylist(props: SharedPlaylistProps) {
    return (
        <Safe name="SharedPlaylist">
            <SharedPlaylistInner {...props} />
        </Safe>
    )
}

addPropertyControls(SharedPlaylist, {
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
