import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion } from "framer-motion"
import { useEffect, useState, type CSSProperties } from "react"

import { API_URL, C, Collage, duration, EASE, Icon, MONO, PlayerDock, playQueue, SANS, SERIF, usePlayer, type QueueItem, type Track, Safe } from "./MoodwaveAPI.tsx"

/**
 * "Made with Moodwave": playlists the owner featured, as cards that open the shared page
 * (/p?s=…), with a quick ▶ that plays the whole playlist in the shared player. Renders
 * nothing until something is featured.
 */

interface FeaturedPlaylistsProps {
    sharePath: string
    heading: string
    accent: string
    style?: CSSProperties
}

interface Featured {
    slug: string
    title: string
    prompt: string
    moods: string[]
    track_count: number
    total_duration_ms: number
    cover_images: (string | null)[]
}

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }

async function queueFor(slug: string): Promise<QueueItem[]> {
    const res = await fetch(`${API_URL}/share/${encodeURIComponent(slug)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { tracks: Track[] }
    return data.tracks.filter((t) => t.uri.startsWith("spotify:track:")).map((t) => ({ id: t.uri.split(":").pop() ?? t.id, label: `${t.title} — ${t.artists.join(", ")}` }))
}

function FeaturedPlaylistsInner(props: FeaturedPlaylistsProps) {
    const { sharePath = "/p", heading = "Made with Moodwave", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const player = usePlayer()
    const [items, setItems] = useState<Featured[] | null>(null)
    const [loadingSlug, setLoadingSlug] = useState<string | null>(null)
    const [playingSlug, setPlayingSlug] = useState<string | null>(null)

    useEffect(() => {
        if (isStatic) return
        fetch(`${API_URL}/share/featured`)
            .then((r) => (r.ok ? r.json() : []))
            .then((d: Featured[]) => setItems(d))
            .catch(() => setItems([]))
    }, [isStatic])

    const play = async (slug: string) => {
        setLoadingSlug(slug)
        try {
            const queue = await queueFor(slug)
            if (queue.length) {
                playQueue(queue)
                setPlayingSlug(slug)
            }
        } finally {
            setLoadingSlug(null)
        }
    }

    if (isStatic) {
        return (
            <div style={{ ...props.style, fontFamily: SANS, color: C.subtle, padding: 24, border: `1px dashed ${C.line2}`, borderRadius: 20 }}>
                <div style={eyebrow}>{heading}</div>
                <p style={{ margin: "8px 0 0", fontSize: 14 }}>Featured playlists appear here on the live site (feature one with ★ on its page). Hidden while none are featured.</p>
            </div>
        )
    }
    if (!items || !items.length) return null

    return (
        <section aria-label={heading} style={{ position: "relative", width: "100%", ...props.style, height: "auto", padding: "72px 0 32px", boxSizing: "border-box", fontFamily: SANS, color: C.text }}>
            <div style={{ ...eyebrow, marginBottom: 10 }}>{heading}</div>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: "clamp(34px, 5vw, 56px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 28px" }}>
                Playlists people <em style={{ color: accent }}>actually</em> made.
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24 }}>
                {items.map((p, i) => {
                    const href = `${sharePath}?s=${encodeURIComponent(p.slug)}`
                    const playingThis = playingSlug === p.slug && Boolean(player.id)
                    return (
                        <motion.li key={p.slug} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6, ease: EASE, delay: Math.min(i, 6) * 0.06 }} style={{ position: "relative" }}>
                            <motion.a href={href} whileHover="hover" style={{ display: "block", textDecoration: "none", color: "inherit" }} aria-label={`${p.title}: open the playlist`}>
                                <motion.div variants={{ hover: { y: -6 } }} transition={{ duration: 0.5, ease: EASE }} style={{ borderRadius: 22, boxShadow: "0 30px 70px -36px rgba(0,0,0,0.95)" }}>
                                    <Collage images={p.cover_images} size="100%" radius={22} />
                                </motion.div>
                                <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 21, marginTop: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                                <div style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 14, color: C.subtle, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>“{p.prompt}”</div>
                                <div style={{ ...eyebrow, fontSize: 10, color: C.faint, marginTop: 10 }}>
                                    {p.track_count} songs · {duration(p.total_duration_ms, true)}
                                    {p.moods[0] ? ` · ${p.moods[0]}` : ""}
                                </div>
                            </motion.a>
                            <motion.button
                                type="button"
                                aria-label={`Play ${p.title}`}
                                onClick={() => void play(p.slug)}
                                whileHover={{ scale: 1.08 }}
                                whileTap={{ scale: 0.92 }}
                                style={{ position: "absolute", right: 12, top: 12, width: 44, height: 44, borderRadius: 44, border: "none", background: accent, color: C.ink, display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 12px 30px -10px rgba(0,0,0,0.8)" }}
                            >
                                {loadingSlug === p.slug ? (
                                    <motion.span aria-hidden animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderRightColor: "transparent" }} />
                                ) : (
                                    <Icon name={playingThis && player.playing ? "pause" : "play"} size={16} />
                                )}
                            </motion.button>
                        </motion.li>
                    )
                })}
            </ul>
            <PlayerDock accent={accent} />
        </section>
    )
}

/**
 * @framerIntrinsicWidth 1040
 * @framerIntrinsicHeight 520
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function FeaturedPlaylists(props: FeaturedPlaylistsProps) {
    return (
        <Safe name="FeaturedPlaylists">
            <FeaturedPlaylistsInner {...props} />
        </Safe>
    )
}

addPropertyControls(FeaturedPlaylists, {
    sharePath: { type: ControlType.String, title: "Shared page", defaultValue: "/p" },
    heading: { type: ControlType.String, title: "Eyebrow", defaultValue: "Made with Moodwave" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
