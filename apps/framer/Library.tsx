import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { motion } from "framer-motion"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

import { api, C, Collage, duration, EASE, MONO, relativeTime, SANS, SERIF, signIn, useSession, type PlaylistSummary } from "./MoodwaveAPI.tsx"

/** Moodwave library (`/library`): every playlist you've made, newest first. */

interface LibraryProps {
    playlistPath: string
    createPath: string
    accent: string
    style?: CSSProperties
}

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }

const button = (solid: boolean): CSSProperties => ({
    height: 46,
    borderRadius: 100,
    padding: "0 22px",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    border: solid ? "none" : `1px solid ${C.line2}`,
    background: solid ? C.text : "transparent",
    color: solid ? C.ink : C.muted,
    fontFamily: SANS,
    fontSize: 15,
    fontWeight: solid ? 500 : 400,
    textDecoration: "none",
    cursor: "pointer",
})

function Empty({ title, body, children }: { title: string; body: string; children: ReactNode }) {
    return (
        <div style={{ textAlign: "center", padding: "72px 16px", borderRadius: 28, border: `1px dashed ${C.line2}` }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 34, letterSpacing: "-0.02em", margin: 0, color: C.text }}>{title}</h2>
            <p style={{ color: C.subtle, fontSize: 15, margin: "10px auto 24px", maxWidth: 420, lineHeight: 1.55 }}>{body}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>{children}</div>
        </div>
    )
}

/**
 * @framerIntrinsicWidth 1120
 * @framerIntrinsicHeight 640
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function Library(props: LibraryProps) {
    const { playlistPath = "/playlist", createPath = "/create", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [items, setItems] = useState<PlaylistSummary[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isStatic || !session.ready || !session.user) return
        api<PlaylistSummary[]>("/playlists")
            .then(setItems)
            .catch((e: Error) => setError(e.message))
    }, [isStatic, session.ready, session.user])

    const root: CSSProperties = { position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS, color: C.text }
    const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 28 }

    if (isStatic || (!session.ready && !isStatic) || (session.user && !items && !error)) {
        return (
            <div style={root} aria-busy={!isStatic}>
                <div style={grid}>
                    {Array.from({ length: isStatic ? 3 : 6 }).map((_, i) => (
                        <div key={i}>
                            <motion.div animate={isStatic ? undefined : { opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.1 }} style={{ aspectRatio: "1 / 1", borderRadius: 22, background: C.surface2 }} />
                            <div style={{ height: 18, width: "70%", borderRadius: 8, background: C.surface2, marginTop: 14 }} />
                            <div style={{ height: 12, width: "45%", borderRadius: 6, background: C.surface, marginTop: 8 }} />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    if (!session.user) {
        return (
            <div style={root}>
                <Empty title="Your library lives with your sign-in" body="Connect Spotify to see every playlist you’ve made here.">
                    {session.config?.spotify_enabled ? (
                        <button type="button" onClick={() => signIn()} style={button(true)}>
                            <span style={{ width: 8, height: 8, borderRadius: 8, background: "#1ed760" }} /> Continue with Spotify
                        </button>
                    ) : null}
                    <a href={createPath} style={button(false)}>
                        Make a playlist
                    </a>
                </Empty>
            </div>
        )
    }

    if (error) {
        return (
            <div style={root}>
                <Empty title="Couldn’t load your library" body={error}>
                    <button type="button" onClick={() => window.location.reload()} style={button(true)}>
                        Try again
                    </button>
                </Empty>
            </div>
        )
    }

    if (!items?.length) {
        return (
            <div style={root}>
                <Empty title="Nothing here yet" body="Describe a moment and your first playlist will land here.">
                    <a href={createPath} style={{ ...button(true), background: accent }}>
                        Start a playlist →
                    </a>
                </Empty>
            </div>
        )
    }

    return (
        <div style={root}>
            <div style={{ ...eyebrow, marginBottom: 20 }}>
                {items.length} {items.length === 1 ? "playlist" : "playlists"}
            </div>
            <ul style={{ ...grid, listStyle: "none", margin: 0, padding: 0 }}>
                {items.map((p, i) => (
                    <motion.li key={p.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE, delay: Math.min(i, 9) * 0.05 }}>
                        <motion.a href={`${playlistPath}?id=${encodeURIComponent(p.id)}`} whileHover="hover" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                            <motion.div variants={{ hover: { y: -6 } }} transition={{ duration: 0.5, ease: EASE }} style={{ position: "relative", borderRadius: 22, boxShadow: "0 30px 70px -36px rgba(0,0,0,0.95)" }}>
                                <Collage images={p.cover_images} size="100%" radius={22} />
                                {p.saved_to_spotify ? (
                                    <span style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 100, background: "rgba(11,10,13,0.75)", backdropFilter: "blur(8px)", fontSize: 11.5, color: C.text }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 6, background: "#1ed760" }} /> On Spotify
                                    </span>
                                ) : null}
                            </motion.div>
                            <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 21, letterSpacing: "-0.01em", marginTop: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 14, color: C.subtle, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>“{p.prompt}”</div>
                            <div style={{ ...eyebrow, fontSize: 10, color: C.faint, marginTop: 10 }}>
                                {p.track_count} songs · {duration(p.total_duration_ms, true)} · {relativeTime(p.created_at)}
                            </div>
                        </motion.a>
                    </motion.li>
                ))}
            </ul>
        </div>
    )
}

addPropertyControls(Library, {
    playlistPath: { type: ControlType.String, title: "Playlist page", defaultValue: "/playlist" },
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
