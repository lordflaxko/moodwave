import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { api, C, Collage, duration, EASE, MONO, relativeTime, SANS, SERIF, signIn, useFinePointer, useSession, type Playlist, type PlaylistSummary, Safe, Btn } from "./MoodwaveAPI.tsx"

/**
 * Moodwave library (`/library`): every playlist you've made. Search (titles, prompts,
 * moods, artists, genres), mood and energy filters, sorting, and a per-card menu to
 * rename, duplicate or delete.
 */

interface LibraryProps {
    playlistPath: string
    createPath: string
    accent: string
    style?: CSSProperties
}

type Summary = PlaylistSummary & { artists?: string[]; genres?: string[] }
type SortKey = "new" | "old" | "songs" | "long" | "az"
type EnergyKey = "any" | "calm" | "steady" | "high"

const SORTS: { key: SortKey; label: string }[] = [
    { key: "new", label: "Newest" },
    { key: "old", label: "Oldest" },
    { key: "songs", label: "Most songs" },
    { key: "long", label: "Longest" },
    { key: "az", label: "A–Z" },
]
const ENERGIES: { key: EnergyKey; label: string; test: (e: number) => boolean }[] = [
    { key: "any", label: "Any energy", test: () => true },
    { key: "calm", label: "Calm", test: (e) => e < 0.38 },
    { key: "steady", label: "Steady", test: (e) => e >= 0.38 && e < 0.66 },
    { key: "high", label: "High", test: (e) => e >= 0.66 },
]

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

const chip = (active: boolean, accent: string): CSSProperties => ({
    height: 32,
    borderRadius: 100,
    padding: "0 13px",
    border: `1px solid ${active ? `color-mix(in srgb, ${accent} 55%, transparent)` : C.line2}`,
    background: active ? `color-mix(in srgb, ${accent} 14%, transparent)` : "transparent",
    color: active ? C.text : C.subtle,
    fontFamily: SANS,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
    textTransform: "capitalize",
    transition: "background 0.2s ease, color 0.2s ease, border-color 0.2s ease",
})

function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
    return (
        <div style={{ textAlign: "center", padding: "72px 16px", borderRadius: 28, border: `1px dashed ${C.line2}` }}>
            <h2 style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 34, letterSpacing: "-0.02em", margin: 0, color: C.text }}>{title}</h2>
            <p style={{ color: C.subtle, fontSize: 15, margin: children ? "10px auto 24px" : "10px auto 0", maxWidth: 420, lineHeight: 1.55 }}>{body}</p>
            {children ? <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>{children}</div> : null}
        </div>
    )
}

function CardMenu({ onRename, onDuplicate, onDelete, busy }: { onRename: () => void; onDuplicate: () => void; onDelete: () => void; busy: boolean }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) return
        const close = (e: PointerEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
        window.addEventListener("pointerdown", close)
        window.addEventListener("keydown", key)
        return () => {
            window.removeEventListener("pointerdown", close)
            window.removeEventListener("keydown", key)
        }
    }, [open])
    const pick = (fn: () => void) => () => {
        setOpen(false)
        fn()
    }
    return (
        <div ref={ref} style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}>
            <button
                type="button"
                aria-label="Playlist options"
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={busy}
                onClick={() => setOpen((o) => !o)}
                style={{ width: 34, height: 34, borderRadius: 34, border: `1px solid ${C.line2}`, background: "rgba(11,10,13,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: C.text, cursor: "pointer", fontSize: 16, lineHeight: 1, display: "grid", placeItems: "center", padding: 0 }}
            >
                {busy ? "…" : "⋯"}
            </button>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        style={{ position: "absolute", top: 40, right: 0, minWidth: 160, padding: 6, borderRadius: 14, background: C.surface3, border: `1px solid ${C.line2}`, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.95)" }}
                    >
                        <Btn variant="quiet" size="sm" role="menuitem" icon="pencil" onClick={pick(onRename)} style={{ width: "100%", justifyContent: "flex-start", borderRadius: 10, height: 38, padding: "0 12px" }}>
                            Rename
                        </Btn>
                        <Btn variant="quiet" size="sm" role="menuitem" icon="copy" onClick={pick(onDuplicate)} style={{ width: "100%", justifyContent: "flex-start", borderRadius: 10, height: 38, padding: "0 12px" }}>
                            Duplicate
                        </Btn>
                        <Btn variant="danger" size="sm" role="menuitem" icon="trash" onClick={pick(onDelete)} style={{ width: "100%", justifyContent: "flex-start", borderRadius: 10, height: 38, padding: "0 12px", borderColor: "transparent" }}>
                            Delete
                        </Btn>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}

function LibraryInner(props: LibraryProps) {
    const { playlistPath = "/playlist", createPath = "/create", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [items, setItems] = useState<Summary[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [query, setQuery] = useState("")
    const [sort, setSort] = useState<SortKey>("new")
    const [energy, setEnergy] = useState<EnergyKey>("any")
    const [moods, setMoods] = useState<string[]>([])
    const [renaming, setRenaming] = useState<string | null>(null)
    const [draft, setDraft] = useState("")
    const [busy, setBusy] = useState<string | null>(null)
    const [flash, setFlash] = useState<string | null>(null)
    // Touch screens have no hover: the first tap shows a card's prompt, the second opens it.
    const fine = useFinePointer()
    const [revealed, setRevealed] = useState<string | null>(null)

    useEffect(() => {
        if (!revealed) return
        const away = (e: PointerEvent) => {
            const card = (e.target as Element | null)?.closest?.("[data-card]")
            if (card?.getAttribute("data-card") !== revealed) setRevealed(null)
        }
        window.addEventListener("pointerdown", away)
        return () => window.removeEventListener("pointerdown", away)
    }, [revealed])

    const load = () =>
        api<Summary[]>("/playlists")
            .then(setItems)
            .catch((e: Error) => setError(e.message))

    useEffect(() => {
        if (isStatic || !session.ready || !session.user) return
        void load()
    }, [isStatic, session.ready, session.user])

    useEffect(() => {
        if (!flash) return
        const t = window.setTimeout(() => setFlash(null), 3600)
        return () => window.clearTimeout(t)
    }, [flash])

    const rename = async (p: Summary) => {
        setRenaming(null)
        const title = draft.trim().slice(0, 100)
        if (!title || title === p.title) return
        setItems((all) => all?.map((x) => (x.id === p.id ? { ...x, title } : x)) ?? null)
        try {
            await api<Playlist>(`/playlists/${p.id}`, { method: "PATCH", body: JSON.stringify({ title }) })
        } catch (e) {
            setItems((all) => all?.map((x) => (x.id === p.id ? { ...x, title: p.title } : x)) ?? null)
            setFlash((e as Error).message)
        }
    }

    const duplicate = async (p: Summary) => {
        setBusy(p.id)
        try {
            await api<Playlist>(`/playlists/${p.id}/duplicate`, { method: "POST" })
            await load()
            setSort("new")
            setFlash(`Made a copy of “${p.title}”`)
        } catch (e) {
            setFlash((e as Error).message)
        } finally {
            setBusy(null)
        }
    }

    const remove = async (p: Summary) => {
        if (!window.confirm(`Delete “${p.title}” from your library?`)) return
        setBusy(p.id)
        try {
            await api<void>(`/playlists/${p.id}`, { method: "DELETE" })
            setItems((all) => all?.filter((x) => x.id !== p.id) ?? null)
            setFlash(`Deleted “${p.title}”`)
        } catch (e) {
            setFlash((e as Error).message)
        } finally {
            setBusy(null)
        }
    }

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
                        <Btn variant="spotify" size="lg" icon="spotify" onClick={() => signIn()}>
                            Continue with Spotify
                        </Btn>
                    ) : null}
                </Empty>
            </div>
        )
    }

    if (error) {
        return (
            <div style={root}>
                <Empty title="Couldn’t load your library" body={error}>
                    <Btn variant="accent" accent={accent} size="lg" icon="refresh" onClick={() => window.location.reload()}>
                        Try again
                    </Btn>
                </Empty>
            </div>
        )
    }

    if (!items?.length) {
        return (
            <div style={root}>
                <Empty title="Nothing here yet" body="Use New playlist above to describe a moment. Your first playlist will land here." />
            </div>
        )
    }

    // Mood chips: the most common moods across the library.
    const moodCounts = new Map<string, number>()
    for (const p of items) for (const m of p.moods) moodCounts.set(m.toLowerCase(), (moodCounts.get(m.toLowerCase()) ?? 0) + 1)
    const topMoods = [...moodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m]) => m)

    const needle = query.trim().toLowerCase()
    const energyTest = ENERGIES.find((e) => e.key === energy)?.test ?? (() => true)
    const matches = (p: Summary) =>
        !needle ||
        [p.title, p.prompt, ...p.moods, ...(p.artists ?? []), ...(p.genres ?? [])].some((s) => s.toLowerCase().includes(needle))
    const shown = items
        .filter((p) => matches(p) && energyTest(p.energy) && (!moods.length || p.moods.some((m: string) => moods.includes(m.toLowerCase()))))
        .sort((a, b) => {
            if (sort === "old") return a.created_at.localeCompare(b.created_at)
            if (sort === "songs") return b.track_count - a.track_count
            if (sort === "long") return b.total_duration_ms - a.total_duration_ms
            if (sort === "az") return a.title.localeCompare(b.title)
            return b.created_at.localeCompare(a.created_at)
        })
    const filtered = Boolean(needle || moods.length || energy !== "any")
    const artistHit = (p: Summary) => (needle ? (p.artists ?? []).find((a: string) => a.toLowerCase().includes(needle)) : undefined)

    return (
        <div style={root}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div style={eyebrow} aria-live="polite">
                    {shown.length === items.length ? `${items.length} ${items.length === 1 ? "playlist" : "playlists"}` : `${shown.length} of ${items.length}`}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ position: "relative", display: "block", width: 280, maxWidth: "100%" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.faint, fontSize: 14, pointerEvents: "none" }}>⌕</span>
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search titles, moods or artists"
                            aria-label="Search your playlists"
                            style={{ width: "100%", height: 42, borderRadius: 100, border: `1px solid ${C.line2}`, background: C.surface, color: C.text, padding: "0 16px 0 36px", fontFamily: SANS, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                        />
                    </label>
                    <label style={{ position: "relative" }}>
                        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Sort by</span>
                        <select
                            value={sort}
                            onChange={(e) => setSort(e.target.value as SortKey)}
                            style={{ height: 42, borderRadius: 100, border: `1px solid ${C.line2}`, background: C.surface, color: C.muted, padding: "0 34px 0 16px", fontFamily: SANS, fontSize: 14, outline: "none", appearance: "none", WebkitAppearance: "none", cursor: "pointer" }}
                        >
                            {SORTS.map((s) => (
                                <option key={s.key} value={s.key}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                        <span aria-hidden style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: C.faint, fontSize: 11, pointerEvents: "none" }}>
                            ▾
                        </span>
                    </label>
                </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 26 }}>
                <div role="radiogroup" aria-label="Energy" style={{ display: "flex", gap: 6 }}>
                    {ENERGIES.map((e) => (
                        <button key={e.key} type="button" role="radio" aria-checked={energy === e.key} onClick={() => setEnergy(e.key)} style={chip(energy === e.key, accent)}>
                            {e.label}
                        </button>
                    ))}
                </div>
                {topMoods.length > 1 ? <span aria-hidden style={{ width: 1, height: 20, background: C.line2, margin: "0 4px" }} /> : null}
                {topMoods.length > 1
                    ? topMoods.map((m) => {
                          const on = moods.includes(m)
                          return (
                              <button key={m} type="button" aria-pressed={on} onClick={() => setMoods((all) => (on ? all.filter((x) => x !== m) : [...all, m]))} style={chip(on, accent)}>
                                  {m}
                              </button>
                          )
                      })
                    : null}
                {filtered ? (
                    <button
                        type="button"
                        onClick={() => {
                            setQuery("")
                            setMoods([])
                            setEnergy("any")
                        }}
                        style={{ ...chip(false, accent), border: "none", color: C.faint, textTransform: "none" }}
                    >
                        Clear
                    </button>
                ) : null}
            </div>

            {shown.length === 0 ? <p style={{ color: C.subtle, fontSize: 15, padding: "40px 0", textAlign: "center" }}>Nothing matches those filters.</p> : null}
            <ul style={{ ...grid, listStyle: "none", margin: 0, padding: 0 }}>
                <AnimatePresence initial={false}>
                    {shown.map((p: Summary, i: number) => {
                        const href = `${playlistPath}?id=${encodeURIComponent(p.id)}`
                        const hit = artistHit(p)
                        return (
                            <motion.li
                                key={p.id}
                                layout
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: busy === p.id ? 0.6 : 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ duration: 0.5, ease: EASE, delay: Math.min(i, 9) * 0.03 }}
                                style={{ position: "relative" }}
                            >
                                <CardMenu
                                    busy={busy === p.id}
                                    onRename={() => {
                                        setDraft(p.title)
                                        setRenaming(p.id)
                                    }}
                                    onDuplicate={() => void duplicate(p)}
                                    onDelete={() => void remove(p)}
                                />
                                <motion.a
                                    href={href}
                                    data-card={p.id}
                                    tabIndex={-1}
                                    aria-hidden
                                    initial="rest"
                                    animate={revealed === p.id ? "hover" : "rest"}
                                    whileHover={fine ? "hover" : undefined}
                                    onClick={(e) => {
                                        if (fine || revealed === p.id) return
                                        e.preventDefault()
                                        setRevealed(p.id)
                                    }}
                                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                                >
                                    <motion.div variants={{ rest: { y: 0 }, hover: { y: -6 } }} transition={{ duration: 0.5, ease: EASE }} style={{ position: "relative", borderRadius: 22, boxShadow: "0 30px 70px -36px rgba(0,0,0,0.95)" }}>
                                        <Collage images={p.cover_images} size="100%" radius={22} />
                                        <motion.div
                                            variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                                            transition={{ duration: 0.35 }}
                                            style={{ position: "absolute", inset: 0, borderRadius: 22, background: "linear-gradient(180deg, rgba(11,10,13,0.1) 0%, rgba(11,10,13,0.88) 100%)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 18, gap: 10 }}
                                        >
                                            <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 300, fontSize: 16, lineHeight: 1.35, color: C.text, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>“{p.prompt}”</span>
                                            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: accent }}>{fine ? "Open →" : "Tap again to open →"}</span>
                                        </motion.div>
                                        {p.saved_to_spotify ? (
                                            <span style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 100, background: "rgba(11,10,13,0.75)", backdropFilter: "blur(8px)", fontSize: 11.5, color: C.text }}>
                                                <span style={{ width: 6, height: 6, borderRadius: 6, background: "#1ed760" }} /> On Spotify
                                            </span>
                                        ) : null}
                                    </motion.div>
                                </motion.a>
                                {renaming === p.id ? (
                                    <input
                                        autoFocus
                                        value={draft}
                                        maxLength={100}
                                        aria-label="Playlist name"
                                        onChange={(e) => setDraft(e.target.value)}
                                        onBlur={() => void rename(p)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") e.currentTarget.blur()
                                            if (e.key === "Escape") setRenaming(null)
                                        }}
                                        style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 14, fontFamily: SERIF, fontWeight: 300, fontSize: 21, letterSpacing: "-0.01em", color: C.text, background: "transparent", border: "none", borderBottom: `1px solid ${accent}`, outline: "none", padding: "2px 0" }}
                                    />
                                ) : (
                                    <a href={href} style={{ display: "block", textDecoration: "none", color: "inherit", fontFamily: SERIF, fontWeight: 300, fontSize: 21, letterSpacing: "-0.01em", marginTop: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {p.title}
                                    </a>
                                )}
                                {/* The prompt shows on the cover (hover); an artist search says why the card matched. */}
                                {hit ? <div style={{ fontFamily: SANS, fontSize: 13, color: accent, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Features {hit}</div> : null}
                                <div style={{ ...eyebrow, fontSize: 10, color: C.faint, marginTop: 10 }}>
                                    {p.track_count} songs · {duration(p.total_duration_ms, true)} · {relativeTime(p.created_at)}
                                </div>
                            </motion.li>
                        )
                    })}
                </AnimatePresence>
            </ul>

            {flash && typeof document !== "undefined"
                ? createPortal(
                      <motion.div role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ position: "fixed", left: 16, right: 16, bottom: 24, zIndex: 45, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
                          <span style={{ padding: "12px 18px", borderRadius: 100, background: C.surface3, border: `1px solid ${C.line2}`, color: C.text, fontFamily: SANS, fontSize: 14, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.9)" }}>{flash}</span>
                      </motion.div>,
                      document.body,
                  )
                : null}
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
    return (
        <Safe name="Library">
            <LibraryInner {...props} />
        </Safe>
    )
}

addPropertyControls(Library, {
    playlistPath: { type: ControlType.String, title: "Playlist page", defaultValue: "/playlist" },
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
