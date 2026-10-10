import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion, Reorder, useDragControls } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

import {
    api,
    C,
    Collage,
    duration,
    EASE,
    energyLabel,
    MONO,
    relativeTime,
    SANS,
    SERIF,
    signIn,
    giveFeedback,
    PlayerDock,
    playQueue,
    requestPlay,
    useFeedback,
    usePlayer,
    useSession,
    type PlayerState,
    type Playlist,
    type QueueItem,
    type Track,
    type Verdict,
    Safe,
} from "./MoodwaveAPI.tsx"

/** Accent at an opacity; works for hex, rgb() or hsl() values from the colour control. */
const mix = (color: string, amount: string) => `color-mix(in srgb, ${color} ${amount}, transparent)`

/**
 * Moodwave playlist page (`/playlist?id=…`): cover collage, the AI's read on the mood,
 * every track with its reason, "make it more…" refinements, an embedded Spotify
 * player and saving to Spotify.
 */

interface PlaylistViewProps {
    libraryPath: string
    createPath: string
    accent: string
    style?: CSSProperties
}

const REFINEMENTS = ["More energetic", "Chiller", "More nostalgic", "Less mainstream", "More vocals", "More instrumental"]

/** Width of our own root element, for a two-column vs stacked layout. */
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

const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }

const pill: CSSProperties = {
    height: 36,
    borderRadius: 100,
    padding: "0 14px",
    border: `1px solid ${C.line2}`,
    background: "transparent",
    color: C.muted,
    fontFamily: SANS,
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
}

function isSpotifyTrack(t: Track) {
    return t.uri.startsWith("spotify:track:")
}

function EnergyCurve({ points, titles, accent }: { points: number[]; titles: string[]; accent: string }) {
    const [hover, setHover] = useState<number | null>(null)
    if (points.length < 2) return null
    const w = 240
    const h = 44
    const step = w / (points.length - 1)
    const yOf = (p: number) => h - 4 - p * (h - 8)
    const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${yOf(p).toFixed(1)}`).join(" ")
    return (
        <div
            style={{ position: "relative" }}
            onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setHover(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)))))
            }}
            onPointerLeave={() => setHover(null)}
        >
            <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label="Energy across the playlist" role="img" style={{ display: "block", cursor: "crosshair" }}>
                <path d={`${d} L${w},${h} L0,${h} Z`} style={{ fill: mix(accent, "12%") }} />
                <path d={d} fill="none" stroke={accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                {hover !== null ? <line x1={hover * step} x2={hover * step} y1={0} y2={h} stroke={C.line2} vectorEffect="non-scaling-stroke" /> : null}
            </svg>
            {hover !== null ? (
                <>
                    <span style={{ position: "absolute", left: `${(hover / (points.length - 1)) * 100}%`, top: yOf(points[hover]), width: 8, height: 8, margin: "-4px 0 0 -4px", borderRadius: 8, background: accent, boxShadow: `0 0 0 3px ${mix(accent, "30%")}` }} />
                    <span style={{ position: "absolute", bottom: "calc(100% + 6px)", left: `${(hover / (points.length - 1)) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", padding: "4px 8px", borderRadius: 8, background: C.surface3, border: `1px solid ${C.line2}`, fontFamily: SANS, fontSize: 11.5, color: C.text, pointerEvents: "none" }}>
                        {String(hover + 1).padStart(2, "0")} · {titles[hover] ?? ""}
                    </span>
                </>
            ) : null}
        </div>
    )
}

/** Three bars bouncing: shown on the track playing in the embed. */
function Equalizer({ color }: { color: string }) {
    return (
        <span aria-label="Playing" style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 12 }}>
            {[0, 1, 2].map((i) => (
                <motion.span key={i} animate={{ height: [3, 12, 5, 10, 3] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} style={{ width: 2, borderRadius: 2, background: color }} />
            ))}
        </span>
    )
}

const spotifyId = (t: Track) => t.uri.split(":").pop() ?? t.id
const label = (t: Track) => `${t.title} — ${t.artists.join(", ")}`

function queueOf(tracks: Track[]): QueueItem[] {
    return tracks.filter(isSpotifyTrack).map((t) => ({ id: spotifyId(t), label: label(t) }))
}

/** A small round icon button used on track rows. Clicks never reach the row (which plays). */
function RowButton({ label, onClick, active, color, children, disabled }: { label: string; onClick: () => void; active?: boolean; color?: string; children: ReactNode; disabled?: boolean }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
                width: 30,
                height: 30,
                borderRadius: 30,
                padding: 0,
                display: "grid",
                placeItems: "center",
                border: `1px solid ${active ? color ?? C.text : "transparent"}`,
                background: active ? `color-mix(in srgb, ${color ?? C.text} 14%, transparent)` : "transparent",
                color: active ? color ?? C.text : C.subtle,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.4 : 1,
                fontSize: 13,
                lineHeight: 1,
                transition: "color 0.2s ease, background 0.2s ease, border-color 0.2s ease",
            }}
        >
            {children}
        </button>
    )
}

const Thumb = ({ down }: { down?: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: down ? "scaleY(-1)" : undefined }}>
        <path d="M7 10v11H3V10h4zM7 10l4-8a3 3 0 0 1 3 3v4h6a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.6 21H7" />
    </svg>
)

interface RowProps {
    t: Track
    i: number
    narrow: boolean
    accent: string
    player: PlayerState
    queue: QueueItem[]
    isNew: boolean
    verdict: Verdict | undefined
    editable: boolean
    busy: boolean
    swapping: boolean
    onFeedback: (t: Track, v: Verdict) => void
    onSwap: (t: Track) => void
    onRemove: (t: Track) => void
    onMove: (t: Track, step: -1 | 1) => void
    onDragEnd: () => void
}

function TrackRow({ t, i, narrow, accent, player, queue, isNew, verdict, editable, busy, swapping, onFeedback, onSwap, onRemove, onMove, onDragEnd }: RowProps) {
    const controls = useDragControls()
    const [hovered, setHovered] = useState(false)
    const playable = isSpotifyTrack(t)
    const active = player.id === spotifyId(t)
    const showTools = narrow || hovered
    return (
        <Reorder.Item
            value={t}
            dragListener={false}
            dragControls={controls}
            onDragEnd={onDragEnd}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: swapping ? 0.45 : 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 12) * 0.03 }}
            onClick={() => playable && requestPlay(spotifyId(t), label(t), queue)}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={(e: FocusEvent<HTMLLIElement>) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false)
            }}
            whileDrag={{ scale: 1.015, backgroundColor: C.surface3, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.9)", zIndex: 5 }}
            style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: narrow ? "28px 44px minmax(0, 1fr) auto" : "18px 32px 48px minmax(0, 1fr) auto auto",
                gap: narrow ? 12 : 14,
                alignItems: "center",
                padding: "10px 10px",
                borderRadius: 14,
                cursor: playable ? "pointer" : "default",
                listStyle: "none",
                background: active || hovered ? C.surface2 : isNew ? `color-mix(in srgb, ${accent} 7%, transparent)` : "transparent",
                boxShadow: isNew ? `inset 2px 0 0 ${accent}` : "none",
            }}
        >
            {!narrow ? (
                <span
                    aria-hidden={!editable}
                    title={editable ? "Drag to reorder (or Alt + ↑ / ↓)" : undefined}
                    tabIndex={editable ? 0 : -1}
                    role={editable ? "button" : undefined}
                    aria-label={editable ? `Move ${t.title}` : undefined}
                    onPointerDown={(e) => {
                        if (!editable) return
                        e.preventDefault()
                        e.stopPropagation()
                        controls.start(e)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (!editable || !e.altKey) return
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault()
                            onMove(t, e.key === "ArrowUp" ? -1 : 1)
                        }
                    }}
                    style={{ cursor: editable ? "grab" : "default", color: C.faint, opacity: editable && showTools ? 1 : 0, transition: "opacity 0.2s ease", touchAction: "none", fontSize: 14, lineHeight: 1, userSelect: "none" }}
                >
                    ⠿
                </span>
            ) : null}
            <span style={{ fontFamily: MONO, fontSize: 12, color: active ? accent : C.faint, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {active && player.playing ? <Equalizer color={accent} /> : active ? <span style={{ color: accent }}>▶</span> : hovered && playable ? <span style={{ color: C.text }}>▶</span> : String(i + 1).padStart(2, "0")}
            </span>
            {t.image_url ? (
                <img src={t.image_url} alt="" loading="lazy" decoding="async" draggable={false} width={narrow ? 44 : 48} height={narrow ? 44 : 48} style={{ borderRadius: 8, objectFit: "cover", display: "block" }} />
            ) : (
                <span style={{ width: narrow ? 44 : 48, height: narrow ? 44 : 48, borderRadius: 8, background: C.surface3 }} />
            )}
            <span style={{ minWidth: 0 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                    {t.similar ? <span title="Added from a similar artist" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, border: `1px solid ${C.line2}`, borderRadius: 4, padding: "0 5px" }}>Similar</span> : null}
                    {isNew ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: C.ink, background: accent, borderRadius: 4, padding: "1px 5px" }}>New</span> : null}
                    {t.explicit ? <span style={{ fontFamily: MONO, fontSize: 9, color: C.subtle, border: `1px solid ${C.line2}`, borderRadius: 3, padding: "0 3px" }}>E</span> : null}
                    {!narrow ? <span style={{ fontSize: 13, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.artists.join(", ")}</span> : null}
                </span>
                {narrow ? <span style={{ display: "block", fontSize: 13, color: C.subtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.artists.join(", ")}</span> : null}
                {t.reason ? (
                    <span style={{ display: "block", fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 14, color: C.muted, marginTop: 3, whiteSpace: narrow ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.reason}</span>
                ) : null}
            </span>
            <span style={{ display: "flex", gap: 2, alignItems: "center", gridColumn: narrow ? "2 / -1" : undefined, justifyContent: narrow ? "flex-start" : "flex-end", opacity: showTools || verdict ? 1 : 0, transition: "opacity 0.2s ease", marginTop: narrow ? -4 : 0 }}>
                <RowButton label={verdict === "up" ? "Liked (undo)" : "More like this"} active={verdict === "up"} color={C.moss} onClick={() => onFeedback(t, "up")}>
                    <Thumb />
                </RowButton>
                <RowButton label={verdict === "down" ? "Disliked (undo)" : "Not for me"} active={verdict === "down"} color={C.amber} onClick={() => onFeedback(t, "down")}>
                    <Thumb down />
                </RowButton>
                {editable ? (
                    <>
                        <RowButton label={swapping ? "Swapping…" : "Swap for a different song"} disabled={busy} onClick={() => onSwap(t)}>
                            <motion.span animate={swapping ? { rotate: 360 } : { rotate: 0 }} transition={swapping ? { duration: 0.9, repeat: Infinity, ease: "linear" } : { duration: 0 }} style={{ display: "inline-block" }}>
                                ↻
                            </motion.span>
                        </RowButton>
                        <RowButton label="Remove from playlist" disabled={busy} onClick={() => onRemove(t)}>
                            ×
                        </RowButton>
                    </>
                ) : null}
            </span>
            {!narrow ? <span style={{ fontFamily: MONO, fontSize: 12, color: C.subtle, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>{duration(t.duration_ms)}</span> : null}
        </Reorder.Item>
    )
}

interface Toast {
    message: string
    action?: { label: string; run: () => void }
}

function Skeleton({ narrow }: { narrow: boolean }) {
    const block = (w: number | string, h: number, r = 10): CSSProperties => ({ width: w, height: h, borderRadius: r, background: C.surface2 })
    return (
        <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: 40 }} aria-busy="true" aria-label="Loading playlist">
            <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }} style={block(narrow ? "100%" : 320, narrow ? 300 : 320, 24)} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={block(140, 12)} />
                <div style={block("70%", 54, 14)} />
                <div style={block("90%", 16)} />
                <div style={block("60%", 16)} />
            </div>
        </div>
    )
}

function PlaylistViewInner(props: PlaylistViewProps) {
    const { libraryPath = "/library", createPath = "/create", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [ref, width] = useWidth()
    const narrow = width < 760
    const [playlist, setPlaylist] = useState<Playlist | null>(null)
    const [error, setError] = useState<{ message: string; status: number } | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [custom, setCustom] = useState("")
    const player = usePlayer()
    const [toast, setToast] = useState<Toast | null>(null)
    const setFlash = (message: string | null) => setToast(message ? { message } : null)
    const [fresh, setFresh] = useState<Set<string>>(new Set())
    const [order, setOrder] = useState<Track[]>([])
    const [swapping, setSwapping] = useState<string | null>(null)
    const [renaming, setRenaming] = useState(false)
    const [draftTitle, setDraftTitle] = useState("")
    const feedback = useFeedback(Boolean(session.user))
    const saveTimer = useRef(0)
    const [showMini, setShowMini] = useState(false)
    const headerRef = useRef<HTMLElement>(null)

    const id = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id")

    useEffect(() => {
        if (isStatic || !session.ready) return
        const params = new URLSearchParams(window.location.search)
        const n = params.get("notice")
        if (n) {
            setNotice(n)
            params.delete("notice")
            history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`)
        }
        if (!id) {
            setError({ message: "No playlist selected.", status: 404 })
            return
        }
        if (!session.user) {
            setError({ message: "Sign in to see your playlists.", status: 401 })
            return
        }
        setError(null)
        api<Playlist>(`/playlists/${encodeURIComponent(id)}`)
            .then(setPlaylist)
            .catch((e: Error & { status?: number }) => setError({ message: e.message, status: e.status ?? 0 }))
    }, [isStatic, session.ready, session.user, id])

    useEffect(() => {
        if (!toast) return
        const t = window.setTimeout(() => setToast(null), toast.action ? 7000 : 4200)
        return () => window.clearTimeout(t)
    }, [toast])

    // The editable order follows the server copy whenever it changes.
    useEffect(() => {
        if (playlist) setOrder(playlist.tracks)
    }, [playlist])

    const putTracks = async (tracks: Track[]) => {
        if (!playlist) return
        try {
            const next = await api<Playlist>(`/playlists/${playlist.id}/tracks`, { method: "PUT", body: JSON.stringify({ tracks }) })
            setPlaylist(next)
        } catch (e) {
            setFlash((e as Error).message)
            setOrder(playlist.tracks)
        }
    }

    const saveOrderSoon = (tracks: Track[]) => {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
            if (playlist && tracks.map((t) => t.id).join() !== playlist.tracks.map((t: Track) => t.id).join()) void putTracks(tracks)
        }, 500)
    }

    const move = (t: Track, step: -1 | 1) => {
        const i = order.findIndex((x) => x.id === t.id)
        const j = i + step
        if (i < 0 || j < 0 || j >= order.length) return
        const next = [...order]
        ;[next[i], next[j]] = [next[j], next[i]]
        setOrder(next)
        saveOrderSoon(next)
    }

    const removeTrack = (t: Track) => {
        if (!playlist || order.length <= 1) return
        const index = order.findIndex((x) => x.id === t.id)
        const next = order.filter((x) => x.id !== t.id)
        setOrder(next)
        void putTracks(next)
        setToast({
            message: `Removed “${t.title}”`,
            action: {
                label: "Undo",
                run: () => {
                    setOrder((cur) => {
                        if (cur.some((x) => x.id === t.id)) return cur
                        const restored = [...cur]
                        restored.splice(Math.min(index, restored.length), 0, t)
                        void putTracks(restored)
                        return restored
                    })
                    setToast(null)
                },
            },
        })
    }

    const swap = async (t: Track) => {
        if (!playlist || swapping) return
        setSwapping(t.id)
        try {
            const next = await api<Playlist>(`/playlists/${playlist.id}/tracks/${encodeURIComponent(t.id)}/replace`, { method: "POST" })
            const before = new Set(order.map((x) => x.id))
            const added = next.tracks.find((x: Track) => !before.has(x.id))
            if (added) setFresh((f) => new Set([...f, added.id]))
            setPlaylist(next)
            setFlash(added ? `Swapped in “${added.title}”` : "Swapped.")
        } catch (e) {
            setFlash((e as Error).message)
        } finally {
            setSwapping(null)
        }
    }

    const rate = async (t: Track, v: Verdict) => {
        try {
            const result = await giveFeedback(t, v)
            if (result === "down" && editable)
                setToast({ message: "Noted — future playlists will steer clear.", action: { label: "Swap it now", run: () => { setToast(null); void swap(t) } } })
            else if (result === "up") setFlash("Noted — more like this next time.")
        } catch (e) {
            setFlash((e as Error).message)
        }
    }

    const rename = async () => {
        setRenaming(false)
        const title = draftTitle.trim()
        if (!playlist || !title || title === playlist.title) return
        const previous = playlist
        setPlaylist({ ...playlist, title })
        try {
            setPlaylist(await api<Playlist>(`/playlists/${playlist.id}`, { method: "PATCH", body: JSON.stringify({ title: title.slice(0, 100) }) }))
        } catch (e) {
            setPlaylist(previous)
            setFlash((e as Error).message)
        }
    }

    useEffect(() => {
        const el = headerRef.current
        if (!el || typeof IntersectionObserver === "undefined") return
        const io = new IntersectionObserver(([entry]) => setShowMini(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 })
        io.observe(el)
        return () => io.disconnect()
    }, [playlist?.id])

    const refine = async (instruction: string) => {
        if (!playlist || busy || instruction.trim().length < 2) return
        setBusy(instruction)
        try {
            const next = await api<Playlist>(`/playlists/${playlist.id}/refine`, { method: "POST", body: JSON.stringify({ instruction: instruction.trim() }) })
            const before = new Set(playlist.tracks.map((t: Track) => t.id))
            setFresh(new Set(next.tracks.filter((t: Track) => !before.has(t.id)).map((t: Track) => t.id)))
            setPlaylist(next)
            setCustom("")
            setFlash(next.refinements[next.refinements.length - 1]?.summary ?? "Updated.")
        } catch (e) {
            setFlash((e as Error).message)
        } finally {
            setBusy(null)
        }
    }

    const save = async () => {
        if (!playlist || busy) return
        setBusy("save")
        try {
            const next = await api<Playlist>(`/playlists/${playlist.id}/save`, { method: "POST" })
            setPlaylist(next)
            setFlash(next.notice ?? "Saved to your Spotify — with its own cover.")
        } catch (e) {
            setFlash((e as Error).message)
        } finally {
            setBusy(null)
        }
    }

    const sync = async () => {
        if (!playlist || busy) return
        setBusy("sync")
        try {
            const next = await api<Playlist>(`/playlists/${playlist.id}/sync`, { method: "POST" })
            setPlaylist(next)
            setFlash(next.notice ?? "Your Spotify copy is up to date.")
        } catch (e) {
            setFlash((e as Error).message)
        } finally {
            setBusy(null)
        }
    }

    const remove = async () => {
        if (!playlist || busy || !window.confirm(`Delete “${playlist.title}” from your library?`)) return
        setBusy("delete")
        try {
            await api<void>(`/playlists/${playlist.id}`, { method: "DELETE" })
            window.location.href = libraryPath
        } catch (e) {
            setFlash((e as Error).message)
            setBusy(null)
        }
    }

    const root: CSSProperties = { position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS, color: C.text }

    if (isStatic) {
        return (
            <div style={root}>
                <div style={{ ...eyebrow, marginBottom: 12 }}>Playlist view</div>
                <Skeleton narrow={false} />
            </div>
        )
    }

    if (error) {
        return (
            <div ref={ref} style={{ ...root, textAlign: "center", padding: "80px 0" }}>
                <div style={eyebrow}>{error.status === 401 ? "Signed out" : "Not found"}</div>
                <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 40, letterSpacing: "-0.02em", margin: "14px 0 10px" }}>
                    {error.status === 401 ? "Sign in to open this playlist" : "This playlist isn’t here"}
                </h2>
                <p style={{ color: C.subtle, margin: "0 0 24px" }}>{error.status === 401 ? "Your playlists live with your Spotify sign-in." : error.message}</p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                    {error.status === 401 && session.config?.spotify_enabled ? (
                        <button type="button" onClick={() => signIn()} style={{ ...pill, background: C.text, color: C.ink, border: "none", height: 46, padding: "0 22px", fontWeight: 500 }}>
                            Continue with Spotify
                        </button>
                    ) : null}
                    <a href={createPath} style={{ ...pill, height: 46, padding: "0 22px", textDecoration: "none" }}>
                        Make a new one
                    </a>
                </div>
            </div>
        )
    }

    if (!playlist) {
        return (
            <div ref={ref} style={root}>
                <Skeleton narrow={narrow} />
            </div>
        )
    }

    const canSave = session.user && !session.user.is_demo && session.config?.spotify_enabled
    const covers = playlist.tracks.map((t: Track) => t.image_url)
    const editable = Boolean(session.user)
    const queue = queueOf(order)
    const playingHere = Boolean(player.id && queue.some((q) => q.id === player.id))

    return (
        <div ref={ref} style={root}>
            <AnimatePresence>
                {notice ? (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{ marginBottom: 24, padding: "12px 16px", borderRadius: 14, border: `1px solid ${C.amber}55`, background: `${C.amber}10`, color: C.amber, fontSize: 14, display: "flex", justifyContent: "space-between", gap: 12 }}
                    >
                        <span>{notice}</span>
                        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ background: "none", border: "none", color: C.amber, cursor: "pointer" }}>
                            ×
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {/* Header */}
            <motion.section
                ref={headerRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE }}
                style={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: narrow ? 28 : 48, alignItems: narrow ? "stretch" : "flex-end" }}
            >
                <div style={{ width: narrow ? "100%" : 320, boxShadow: "0 40px 90px -30px rgba(0,0,0,0.9)", borderRadius: 24 }}>
                    <Collage images={covers} size="100%" radius={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={eyebrow}>
                        AI playlist · {relativeTime(playlist.created_at)} · {playlist.ai_source === "claude" ? "Moodwave AI" : "Quick mix"}
                        {playlist.intent.focus_artists?.length ? ` · Only ${playlist.intent.focus_artists.join(" & ")}` : ""}
                    </div>
                    {renaming ? (
                        <input
                            autoFocus
                            value={draftTitle}
                            maxLength={100}
                            aria-label="Playlist name"
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onBlur={() => void rename()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur()
                                if (e.key === "Escape") {
                                    setDraftTitle(playlist.title)
                                    setRenaming(false)
                                }
                            }}
                            style={{ display: "block", width: "100%", fontFamily: SERIF, fontWeight: 300, fontSize: narrow ? 44 : 64, lineHeight: 1, letterSpacing: "-0.03em", margin: "14px 0 14px", padding: 0, background: "transparent", color: C.text, border: "none", borderBottom: `1px solid ${accent}`, outline: "none" }}
                        />
                    ) : (
                        <h1 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: narrow ? 44 : 64, lineHeight: 1, letterSpacing: "-0.03em", margin: "14px 0 14px" }}>
                            <button
                                type="button"
                                title="Rename"
                                onClick={() => {
                                    setDraftTitle(playlist.title)
                                    setRenaming(true)
                                }}
                                style={{ all: "unset", cursor: "text" }}
                            >
                                {playlist.title}
                                <span aria-hidden style={{ fontFamily: SANS, fontSize: 14, color: C.faint, marginLeft: 12, verticalAlign: "middle" }}>
                                    ✎
                                </span>
                            </button>
                        </h1>
                    )}
                    <p style={{ fontSize: 16, lineHeight: 1.55, color: C.muted, margin: 0, maxWidth: 560 }}>{playlist.description}</p>
                    <p style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 17, color: C.subtle, margin: "12px 0 0" }}>“{playlist.prompt}”</p>

                    <div style={{ display: "grid", gridTemplateColumns: narrow ? "repeat(2, 1fr)" : "repeat(4, auto)", justifyContent: "start", gap: narrow ? 16 : 36, marginTop: 26 }}>
                        {[
                            ["Songs", String(playlist.stats.track_count)],
                            ["Duration", duration(playlist.stats.total_duration_ms, true)],
                            ["Mood", playlist.intent.moods[0] ?? "—"],
                            ["Energy", energyLabel(playlist.stats.avg_energy ?? playlist.intent.energy)],
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
                                style={{ ...pill, background: accent, color: C.ink, border: "none", fontWeight: 500, height: 42, padding: "0 18px" }}
                            >
                                {playingHere && player.playing ? "❚❚ Pause" : playingHere ? "▶ Resume" : "▶ Play all"}
                            </button>
                        ) : null}
                        {canSave ? (
                            playlist.spotify_url ? (
                                <>
                                    <a href={playlist.spotify_url} target="_blank" rel="noreferrer" style={{ ...pill, background: C.text, color: C.ink, border: "none", textDecoration: "none", fontWeight: 500, height: 42, padding: "0 18px" }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 8, background: "#1ed760" }} /> Open in Spotify
                                    </a>
                                    <AnimatePresence>
                                        {playlist.needs_sync || busy === "sync" ? (
                                            <motion.button
                                                key="sync"
                                                type="button"
                                                onClick={sync}
                                                disabled={Boolean(busy)}
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                title="You've changed this playlist since saving it"
                                                style={{ ...pill, height: 42, padding: "0 16px", color: C.text, borderColor: `color-mix(in srgb, ${accent} 55%, transparent)` }}
                                            >
                                                <span style={{ width: 6, height: 6, borderRadius: 6, background: accent }} /> {busy === "sync" ? "Updating…" : "Update on Spotify"}
                                            </motion.button>
                                        ) : null}
                                    </AnimatePresence>
                                </>
                            ) : (
                                <button type="button" onClick={save} disabled={Boolean(busy)} style={{ ...pill, background: C.text, color: C.ink, border: "none", fontWeight: 500, height: 42, padding: "0 18px", opacity: busy && busy !== "save" ? 0.5 : 1 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 8, background: "#1ed760" }} /> {busy === "save" ? "Saving…" : "Save to Spotify"}
                                </button>
                            )
                        ) : null}
                        <a href={createPath} style={{ ...pill, height: 42, textDecoration: "none" }}>
                            New playlist
                        </a>
                        <button
                            type="button"
                            onClick={remove}
                            disabled={Boolean(busy)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = C.amber
                                e.currentTarget.style.borderColor = `color-mix(in srgb, ${C.amber} 45%, transparent)`
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = C.muted
                                e.currentTarget.style.borderColor = C.line2
                            }}
                            style={{ ...pill, height: 42, color: C.muted, transition: "color 0.2s ease, border-color 0.2s ease" }}
                        >
                            {busy === "delete" ? "Deleting…" : "Delete"}
                        </button>
                    </div>
                </div>
            </motion.section>

            {/* Refine */}
            <section style={{ marginTop: 56, padding: narrow ? 18 : 24, borderRadius: 24, background: C.surface, border: `1px solid ${C.line2}` }} aria-label="Refine this playlist">
                <div style={{ display: "flex", flexDirection: narrow ? "column" : "row", gap: 20, alignItems: narrow ? "stretch" : "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={eyebrow}>Make it more…</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                            {REFINEMENTS.map((r) => (
                                <button key={r} type="button" disabled={Boolean(busy)} onClick={() => void refine(r)} style={{ ...pill, borderColor: busy === r ? accent : C.line2, color: busy === r ? accent : C.muted, opacity: busy && busy !== r ? 0.45 : 1 }}>
                                    {busy === r ? "Reworking…" : r}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ width: narrow ? "100%" : 220, flexShrink: 0 }}>
                        <div style={{ ...eyebrow, fontSize: 10, marginBottom: 6 }}>Energy arc</div>
                        <EnergyCurve points={playlist.stats.energy_curve} titles={playlist.tracks.map((t: Track) => t.title)} accent={accent} />
                    </div>
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void refine(custom)
                    }}
                    style={{ display: "flex", gap: 8, marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}
                >
                    <input
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        maxLength={300}
                        placeholder="Or say it yourself — e.g. “swap the slow ones for something upbeat”"
                        aria-label="Describe a change"
                        style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 100, border: `1px solid ${C.line2}`, background: C.ink, color: C.text, padding: "0 16px", fontFamily: SANS, fontSize: 14, outline: "none" }}
                    />
                    <button type="submit" disabled={Boolean(busy) || custom.trim().length < 2} style={{ ...pill, height: 42, background: custom.trim().length >= 2 ? accent : "transparent", color: custom.trim().length >= 2 ? C.ink : C.faint, border: "none" }}>
                        {busy === custom && custom ? "Working…" : "Refine"}
                    </button>
                </form>
            </section>

            {/* Tracks */}
            <section style={{ marginTop: 40 }} aria-label="Tracks">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${C.line}`, paddingBottom: 12, marginBottom: 6 }}>
                    <div style={eyebrow}>Tracklist</div>
                    <div style={{ ...eyebrow, color: C.faint }}>
                        {playlist.stats.artist_count} artists{editable && !narrow ? " · drag ⠿ to reorder" : ""}
                    </div>
                </div>
                <Reorder.Group
                    as="ol"
                    axis="y"
                    values={order}
                    onReorder={setOrder}
                    style={{ listStyle: "none", margin: 0, padding: 0 }}
                >
                    {order.map((t: Track, i: number) => (
                        <TrackRow
                            key={t.id}
                            t={t}
                            i={i}
                            narrow={narrow}
                            accent={accent}
                            player={player}
                            queue={queue}
                            isNew={fresh.has(t.id)}
                            verdict={feedback[t.id]}
                            editable={editable}
                            busy={Boolean(busy) || Boolean(swapping)}
                            swapping={swapping === t.id}
                            onFeedback={(track, v) => void rate(track, v)}
                            onSwap={(track) => void swap(track)}
                            onRemove={removeTrack}
                            onMove={move}
                            onDragEnd={() => saveOrderSoon(order)}
                        />
                    ))}
                </Reorder.Group>
            </section>

            {/* Why it works + history */}
            <section style={{ marginTop: 48, display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 32 }}>
                <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 20 }}>
                    <div style={eyebrow}>Why it fits</div>
                    <p style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 19, lineHeight: 1.5, color: C.muted, margin: "12px 0 0" }}>{playlist.intent.rationale}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
                        {[...playlist.intent.genres, ...(playlist.intent.era ? [playlist.intent.era] : [])].map((g) => (
                            <span key={g} style={{ ...pill, height: 28, fontSize: 12, cursor: "default", textTransform: "capitalize" }}>
                                {g}
                            </span>
                        ))}
                    </div>
                </div>
                {playlist.refinements.length ? (
                    <div style={{ borderTop: `1px solid ${C.line2}`, paddingTop: 20 }}>
                        <div style={eyebrow}>Changes</div>
                        <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                            {[...playlist.refinements].reverse().map((r) => (
                                <li key={r.id}>
                                    <div style={{ fontSize: 14, color: C.text }}>“{r.instruction}”</div>
                                    <div style={{ fontSize: 13, color: C.subtle, marginTop: 2 }}>
                                        {r.summary} <span style={{ color: C.faint }}>+{r.added} / −{r.removed}</span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                ) : null}
            </section>

            {createPortal(
                <AnimatePresence>
                    {showMini ? (
                        <motion.div
                            key="mini"
                            initial={{ y: -16, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -16, opacity: 0 }}
                            transition={{ duration: 0.4, ease: EASE }}
                            style={{ position: "fixed", top: narrow ? 72 : 84, left: 16, right: 16, zIndex: 30, display: "flex", justifyContent: "center", pointerEvents: "none" }}
                        >
                            <div style={{ pointerEvents: "auto", width: "100%", maxWidth: 760, display: "flex", alignItems: "center", gap: 12, padding: "8px 8px 8px 8px", borderRadius: 18, background: "rgba(18,16,21,0.86)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: `1px solid ${C.line2}`, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.9)", fontFamily: SANS }}>
                                <Collage images={covers} size={40} radius={10} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 18, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playlist.title}</div>
                                    <div style={{ fontSize: 12, color: C.subtle }}>
                                        {playlist.stats.track_count} songs · {duration(playlist.stats.total_duration_ms, true)}
                                    </div>
                                </div>
                                {canSave ? (
                                    playlist.spotify_url ? (
                                        <a href={playlist.spotify_url} target="_blank" rel="noreferrer" style={{ ...pill, height: 38, background: C.text, color: C.ink, border: "none", textDecoration: "none", fontWeight: 500 }}>
                                            Open in Spotify
                                        </a>
                                    ) : (
                                        <button type="button" onClick={save} disabled={Boolean(busy)} style={{ ...pill, height: 38, background: C.text, color: C.ink, border: "none", fontWeight: 500 }}>
                                            {busy === "save" ? "Saving…" : "Save to Spotify"}
                                        </button>
                                    )
                                ) : null}
                                <button type="button" aria-label="Back to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={{ ...pill, height: 38, width: 38, padding: 0, justifyContent: "center" }}>
                                    ↑
                                </button>
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>,
                document.body,
            )}

            <PlayerDock accent={accent} />

            {createPortal(
                <AnimatePresence>
                    {toast ? (
                        <motion.div
                            key={toast.message}
                            role="status"
                            aria-live="polite"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 12 }}
                            transition={{ duration: 0.3, ease: EASE }}
                            style={{ position: "fixed", left: 16, right: 16, bottom: player.id ? 140 : 24, zIndex: 45, display: "flex", justifyContent: "center", pointerEvents: "none" }}
                        >
                            <span style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 14, padding: toast.action ? "8px 8px 8px 18px" : "12px 18px", borderRadius: 100, background: C.surface3, border: `1px solid ${C.line2}`, color: C.text, fontFamily: SANS, fontSize: 14, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.9)", maxWidth: "100%" }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.message}</span>
                                {toast.action ? (
                                    <button type="button" onClick={toast.action.run} style={{ ...pill, height: 32, background: accent, color: C.ink, border: "none", fontWeight: 500 }}>
                                        {toast.action.label}
                                    </button>
                                ) : null}
                            </span>
                        </motion.div>
                    ) : null}
                </AnimatePresence>,
                document.body,
            )}
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
export default function PlaylistView(props: PlaylistViewProps) {
    return (
        <Safe name="PlaylistView">
            <PlaylistViewInner {...props} />
        </Safe>
    )
}

addPropertyControls(PlaylistView, {
    libraryPath: { type: ControlType.String, title: "Library page", defaultValue: "/library" },
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
