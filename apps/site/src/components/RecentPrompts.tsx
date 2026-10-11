import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState, type CSSProperties } from "react"

import { api, C, EASE, MONO, prefillComposer, SANS, useSession, type PlaylistSummary, Safe } from "./MoodwaveAPI.tsx"

/**
 * "Recently": your last few distinct prompts, under the composer. Tap one to put it back in
 * the prompt box (tweak it, then compose); × hides it on this device. Signed-in only;
 * renders nothing until there's history.
 */

interface RecentPromptsProps {
    count: number
    createPath: string
    accent: string
    style?: CSSProperties
}

const HIDDEN_KEY = "mw_hidden_prompts"
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

function readHidden(): string[] {
    try {
        return JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[]
    } catch {
        return []
    }
}

function RecentPromptsInner(props: RecentPromptsProps) {
    const { count = 6, createPath = "/create", accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [prompts, setPrompts] = useState<string[]>([])
    const [hidden, setHidden] = useState<string[]>([])

    useEffect(() => {
        if (isStatic || !session.ready || !session.user) return
        setHidden(readHidden())
        api<PlaylistSummary[]>("/playlists")
            .then((items: PlaylistSummary[]) => {
                const seen = new Set<string>()
                const out: string[] = []
                for (const p of items) {
                    const key = norm(p.prompt)
                    if (!key || seen.has(key) || key === "more like this") continue
                    seen.add(key)
                    out.push(p.prompt.trim())
                }
                setPrompts(out)
            })
            .catch(() => setPrompts([]))
    }, [isStatic, session.ready, session.user])

    const hide = (prompt: string) => {
        const next = [...hidden, norm(prompt)].slice(-100)
        setHidden(next)
        try {
            window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
        } catch {
            // Storage blocked: hidden for this visit only.
        }
    }

    if (isStatic) {
        return (
            <div style={{ ...props.style, fontFamily: SANS, color: C.subtle, fontSize: 13 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>Recently</span> · your last prompts appear here
            </div>
        )
    }

    const shown = prompts.filter((p) => !hidden.includes(norm(p))).slice(0, count)
    if (!shown.length) return null

    return (
        <div style={{ position: "relative", width: "100%", ...props.style, height: "auto", fontFamily: SANS }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint, marginRight: 4 }}>Recently</span>
                <AnimatePresence initial={false}>
                    {shown.map((p, i) => (
                        <motion.span
                            key={p}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.4, ease: EASE, delay: i * 0.04 }}
                            style={{ display: "inline-flex", alignItems: "center", height: 34, borderRadius: 100, border: `1px solid ${C.line2}`, background: "rgba(18,16,21,0.6)", maxWidth: "100%" }}
                        >
                            <button
                                type="button"
                                onClick={() => prefillComposer(p, createPath)}
                                onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
                                onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
                                style={{ all: "unset", cursor: "pointer", padding: "0 6px 0 14px", fontSize: 13, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260, transition: "color 0.2s ease" }}
                            >
                                <span style={{ color: accent, marginRight: 6 }}>↺</span>
                                {p}
                            </button>
                            <button
                                type="button"
                                aria-label={`Hide “${p}”`}
                                onClick={() => hide(p)}
                                style={{ all: "unset", cursor: "pointer", width: 26, height: 26, marginRight: 4, borderRadius: 26, display: "grid", placeItems: "center", color: C.faint, fontSize: 13 }}
                            >
                                ×
                            </button>
                        </motion.span>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    )
}

export default function RecentPrompts(props: RecentPromptsProps) {
    return (
        <Safe name="RecentPrompts">
            <RecentPromptsInner {...props} />
        </Safe>
    )
}

addPropertyControls(RecentPrompts, {
    count: { type: ControlType.Number, title: "Prompts", min: 1, max: 12, step: 1, defaultValue: 6 },
    createPath: { type: ControlType.String, title: "Create page", defaultValue: "/create" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
