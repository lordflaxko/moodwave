import { addPropertyControls, useIsStaticRenderer } from "framer"
import { useEffect, useState, type CSSProperties } from "react"

import {
    api,
    C,
    MONO,
    relativeTime,
    Safe,
    SANS,
    SERIF,
    signIn,
    useSession,
    Btn,
} from "./MoodwaveAPI.tsx"

/**
 * Private error log (/errors): crashes reported by the site and unexpected API failures,
 * grouped by message. Only you (signed in with Spotify) can see it.
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

function ErrorsViewInner(props: ErrorsViewProps) {
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [groups, setGroups] = useState<ErrorGroup[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)

    const load = () => {
        setError(null)
        api<ErrorGroup[]>("/telemetry/errors")
            .then(setGroups)
            .catch((e: Error) => setError(e.message))
    }
    useEffect(() => {
        if (!isStatic && session.ready && session.user) load()
    }, [isStatic, session.ready, session.user])

    const root: CSSProperties = { position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS, color: C.text }
    const box: CSSProperties = { borderRadius: 18, border: `1px solid ${C.line2}`, background: C.surface, padding: 18 }

    if (isStatic) return <div style={{ ...root, ...box, color: C.subtle }}>Error log (live data appears on the published site)</div>
    if (!session.ready) return <div style={{ ...root, color: C.subtle }}>Loading…</div>
    if (!session.user)
        return (
            <div style={{ ...root, ...box }}>
                <p style={{ margin: "0 0 14px", color: C.muted }}>Sign in with Spotify to view the error log.</p>
                <Btn variant="spotify" icon="spotify" onClick={() => signIn()}>
                    Continue with Spotify
                </Btn>
            </div>
        )
    if (error) return <div style={{ ...root, ...box, color: C.amber }}>{error}</div>
    if (!groups) return <div style={{ ...root, color: C.subtle }}>Loading errors…</div>

    return (
        <div style={root}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.subtle }}>
                    {groups.length ? `${groups.reduce((n, g) => n + g.count, 0)} errors · ${groups.length} kinds` : "No errors"}
                </span>
                <Btn variant="ghost" size="sm" icon="refresh" onClick={load}>
                    Refresh
                </Btn>
            </div>
            {groups.length === 0 ? (
                <div style={{ ...box, textAlign: "center", padding: 40 }}>
                    <div style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 28 }}>All quiet.</div>
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

/**
 * @framerIntrinsicWidth 900
 * @framerIntrinsicHeight 400
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function ErrorsView(props: ErrorsViewProps) {
    return (
        <Safe name="ErrorsView">
            <ErrorsViewInner {...props} />
        </Safe>
    )
}

addPropertyControls(ErrorsView, {})
