import { addPropertyControls, useIsStaticRenderer } from "framer"
import { useEffect, useState, type CSSProperties } from "react"

import { api, Btn, C, MONO, relativeTime, Safe, SANS, SERIF, signIn, useSession } from "./MoodwaveAPI.tsx"

/**
 * The owner dashboard (/admin): usage, AI spend and the error log in one private page.
 * Only the site owner (signed in with Spotify) can see it.
 */

interface ErrorsViewProps {
    style?: CSSProperties
}

interface ErrorGroup {
    message: string
    source: "web" | "api"
    count: number
    last_seen: string
    sample: { page: string; stack: string; user_agent: string; created_at: string }
}

interface Stats {
    playlists_today: number
    playlists_7d: number
    playlists_30d: number
    playlists_by_day: { day: string; ai: number; offline: number }[]
    spotify_users: number
    guests_total: number
    active_users_7d: number
    guest_ai_used_today: number
    guest_ai_limit: number
    ai: {
        calls_today: number
        tokens_today: number
        calls_month: number
        input_tokens_month: number
        output_tokens_month: number
        est_cost_month_usd: number
        price_input_per_mtok: number
        price_output_per_mtok: number
        model: string
    }
    shared_playlists: number
    featured_playlists: number
    errors_7d: number
}

const box: CSSProperties = { borderRadius: 18, border: `1px solid ${C.line2}`, background: C.surface, padding: 18, boxSizing: "border-box" }
const eyebrow: CSSProperties = { fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
    return (
        <div style={{ ...box, padding: 16 }}>
            <div style={eyebrow}>{label}</div>
            <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 32, lineHeight: 1.1, marginTop: 8, color: tone ?? C.text }}>{value}</div>
            {note ? <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 6, lineHeight: 1.4 }}>{note}</div> : null}
        </div>
    )
}

function DayBars({ days }: { days: Stats["playlists_by_day"] }) {
    const max = Math.max(1, ...days.map((d) => d.ai + d.offline))
    return (
        <div style={{ ...box, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <div style={eyebrow}>Playlists · last 14 days</div>
                <div style={{ fontSize: 12, color: C.subtle, display: "flex", gap: 12 }}>
                    <span>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.lilac, marginRight: 5 }} />
                        AI
                    </span>
                    <span>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: C.surface3, border: `1px solid ${C.line2}`, marginRight: 5 }} />
                        Offline
                    </span>
                </div>
            </div>
            <div role="img" aria-label={`Playlists per day: ${days.map((d) => `${d.day.slice(5)} ${d.ai + d.offline}`).join(", ")}`} style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110, marginTop: 14 }}>
                {days.map((d) => {
                    const total = d.ai + d.offline
                    return (
                        <div key={d.day} title={`${d.day}: ${d.ai} AI, ${d.offline} offline`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 }}>
                            <div style={{ height: `${(d.offline / max) * 100}%`, minHeight: d.offline ? 3 : 0, background: C.surface3, border: d.offline ? `1px solid ${C.line2}` : "none", borderRadius: 3, boxSizing: "border-box" }} />
                            <div style={{ height: `${(d.ai / max) * 100}%`, minHeight: d.ai ? 3 : 0, background: C.lilac, borderRadius: 3 }} />
                            {!total ? <div style={{ height: 2, background: C.line, borderRadius: 2 }} /> : null}
                        </div>
                    )
                })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 8 }}>
                <span>{days[0]?.day.slice(5)}</span>
                <span>today</span>
            </div>
        </div>
    )
}

function ErrorsViewInner(props: ErrorsViewProps) {
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [groups, setGroups] = useState<ErrorGroup[] | null>(null)
    const [stats, setStats] = useState<Stats | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const load = () => {
        setError(null)
        setLoading(true)
        Promise.all([api<Stats>("/admin/stats"), api<ErrorGroup[]>("/telemetry/errors")])
            .then(([s, g]) => {
                setStats(s)
                setGroups(g)
            })
            .catch((e: Error) => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(() => {
        if (!isStatic && session.ready && session.user) load()
    }, [isStatic, session.ready, session.user])

    const root: CSSProperties = { position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS, color: C.text }

    if (isStatic) return <div style={{ ...root, ...box, color: C.subtle }}>Owner dashboard (live data appears on the published site)</div>
    if (!session.ready) return <div style={{ ...root, color: C.subtle }}>Loading…</div>
    if (!session.user)
        return (
            <div style={{ ...root, ...box }}>
                <p style={{ margin: "0 0 14px", color: C.muted }}>This page is private. Sign in with Spotify as the site owner.</p>
                <Btn variant="spotify" icon="spotify" onClick={() => signIn()}>
                    Continue with Spotify
                </Btn>
            </div>
        )
    if (error) return <div style={{ ...root, ...box, color: C.amber }}>{error}</div>
    if (!groups || !stats) return <div style={{ ...root, color: C.subtle }}>Loading the dashboard…</div>

    const guestPct = stats.guest_ai_limit ? Math.round((stats.guest_ai_used_today / stats.guest_ai_limit) * 100) : 0
    const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }

    return (
        <div style={root}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
                <div style={eyebrow}>Owner dashboard · {stats.ai.model}</div>
                <Btn variant="ghost" size="sm" icon="refresh" busy={loading} onClick={load}>
                    Refresh
                </Btn>
            </div>

            <div style={grid}>
                <Stat label="Playlists today" value={String(stats.playlists_today)} note={`${stats.playlists_7d} this week · ${stats.playlists_30d} in 30 days`} />
                <Stat
                    label="AI spend this month"
                    value={`$${stats.ai.est_cost_month_usd.toFixed(2)}`}
                    note={`Estimate · ${compact(stats.ai.input_tokens_month)} in / ${compact(stats.ai.output_tokens_month)} out tokens at $${stats.ai.price_input_per_mtok} / $${stats.ai.price_output_per_mtok} per million`}
                    tone={C.lilac}
                />
                <Stat label="AI calls today" value={String(stats.ai.calls_today)} note={`${compact(stats.ai.tokens_today)} tokens · ${stats.ai.calls_month} calls this month`} />
                <Stat label="Guest AI budget" value={`${stats.guest_ai_used_today} / ${stats.guest_ai_limit}`} note={guestPct >= 100 ? "Used up today: guests get the offline curator" : `${guestPct}% used today`} tone={guestPct >= 80 ? C.amber : undefined} />
                <Stat label="Listeners" value={String(stats.active_users_7d)} note={`active this week · ${stats.spotify_users} Spotify accounts · ${stats.guests_total} guests`} />
                <Stat label="Sharing" value={String(stats.shared_playlists)} note={`shared playlists · ${stats.featured_playlists} featured on Home`} />
                <Stat label="Errors this week" value={String(stats.errors_7d)} tone={stats.errors_7d ? C.amber : C.moss} note={stats.errors_7d ? "See the log below" : "All quiet"} />
            </div>

            <div style={{ marginTop: 10 }}>
                <DayBars days={stats.playlists_by_day} />
            </div>

            <div style={{ ...eyebrow, margin: "28px 0 12px" }}>{groups.length ? `Error log · ${groups.reduce((n, g) => n + g.count, 0)} errors · ${groups.length} kinds` : "Error log"}</div>
            {groups.length === 0 ? (
                <div style={{ ...box, textAlign: "center", padding: 32 }}>
                    <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 26 }}>All quiet.</div>
                    <p style={{ color: C.subtle, margin: "8px 0 0" }}>Nothing has broken since the log started.</p>
                </div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {groups.map((g) => {
                        const id = `${g.source}:${g.message}`
                        const expanded = open === id
                        return (
                            <li key={id} style={box}>
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => setOpen(expanded ? null : id)}
                                    style={{ all: "unset", cursor: "pointer", display: "flex", gap: 12, alignItems: "baseline", width: "100%" }}
                                >
                                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: g.source === "api" ? C.amber : C.lilac, flexShrink: 0 }}>{g.source}</span>
                                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: expanded ? "normal" : "nowrap" }}>{g.message}</span>
                                    <span style={{ fontFamily: MONO, fontSize: 12, color: C.subtle, flexShrink: 0 }}>×{g.count}</span>
                                    <span style={{ fontSize: 12.5, color: C.faint, flexShrink: 0 }}>{relativeTime(g.last_seen)}</span>
                                </button>
                                {expanded ? (
                                    <div style={{ marginTop: 12, fontSize: 12.5, color: C.subtle }}>
                                        <div>Page: {g.sample.page || "—"}</div>
                                        <div style={{ marginTop: 4 }}>Browser: {g.sample.user_agent || "—"}</div>
                                        {g.sample.stack ? (
                                            <pre style={{ marginTop: 10, padding: 12, borderRadius: 10, background: C.ink, color: C.muted, fontFamily: MONO, fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflow: "auto" }}>{g.sample.stack}</pre>
                                        ) : null}
                                    </div>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}

export default function ErrorsView(props: ErrorsViewProps) {
    return (
        <Safe name="ErrorsView">
            <ErrorsViewInner {...props} />
        </Safe>
    )
}

addPropertyControls(ErrorsView, {})
