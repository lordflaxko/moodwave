import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { C, EASE, SANS, signIn, signOut, useSession, Safe } from "./MoodwaveAPI.tsx"

/** Nav status pill: "Connect Spotify" when signed out, the account (with sign-out) when in. */

interface AccountChipProps {
    style?: CSSProperties
}

const chip: CSSProperties = {
    height: 40,
    borderRadius: 100,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 16px",
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
    return (
        <span style={{ position: "relative", width: 8, height: 8, display: "inline-block" }}>
            {pulse ? (
                <motion.span
                    animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    style={{ position: "absolute", inset: 0, borderRadius: 8, background: color }}
                />
            ) : null}
            <span style={{ position: "absolute", inset: 0, borderRadius: 8, background: color }} />
        </span>
    )
}

function AccountChipInner(props: AccountChipProps) {
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const close = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", close)
        return () => document.removeEventListener("mousedown", close)
    }, [open])

    const base: CSSProperties = { position: "relative", ...props.style, width: "max-content", height: "auto" }

    if (isStatic || !session.ready) {
        return (
            <div style={base}>
                <span style={{ ...chip, background: C.text, color: C.ink, cursor: "default" }}>
                    <Dot color={C.moss} /> Spotify
                </span>
            </div>
        )
    }

    const user = session.user
    if (!user) {
        return (
            <div style={base}>
                <button type="button" onClick={() => signIn()} style={{ ...chip, border: "none", background: C.text, color: C.ink }}>
                    <Dot color="#1ed760" /> Connect Spotify
                </button>
            </div>
        )
    }

    const live = !user.is_demo
    return (
        <div ref={ref} style={base}>
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={live ? "Spotify connected. Account menu" : "Demo mode. Account menu"}
                onClick={() => setOpen((o) => !o)}
                style={{ ...chip, border: `1px solid ${C.line2}`, background: "rgba(24, 22, 28, 0.8)", color: C.text, paddingLeft: user.avatar_url ? 5 : 14 }}
            >
                {user.avatar_url ? <img src={user.avatar_url} alt="" width={30} height={30} style={{ borderRadius: 30, objectFit: "cover" }} /> : null}
                <Dot color={live ? "#1ed760" : C.amber} pulse={live} />
                {live ? user.display_name.split(" ")[0] : "Demo mode"}
            </button>
            <AnimatePresence>
                {open ? (
                    <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        style={{ position: "absolute", right: 0, top: 48, minWidth: 220, padding: 8, borderRadius: 18, background: C.surface2, border: `1px solid ${C.line2}`, boxShadow: "0 30px 60px -20px rgba(0,0,0,0.9)", fontFamily: SANS, zIndex: 10 }}
                    >
                        <div style={{ padding: "8px 10px 10px", borderBottom: `1px solid ${C.line}`, marginBottom: 6 }}>
                            <div style={{ fontSize: 14, color: C.text }}>{user.display_name}</div>
                            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{live ? "Spotify connected" : "Sample catalogue, nothing saved to Spotify"}</div>
                        </div>
                        {!live && session.config?.spotify_enabled ? (
                            <button type="button" role="menuitem" onClick={() => signIn()} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 10, border: "none", background: "transparent", color: C.text, fontSize: 14, cursor: "pointer" }}>
                                Connect Spotify
                            </button>
                        ) : null}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                signOut()
                                setOpen(false)
                            }}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 10, border: "none", background: "transparent", color: C.muted, fontSize: 14, cursor: "pointer" }}
                        >
                            Sign out
                        </button>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}

/**
 * @framerSupportedLayoutWidth auto
 * @framerSupportedLayoutHeight auto
 */
export default function AccountChip(props: AccountChipProps) {
    return (
        <Safe name="AccountChip">
            <AccountChipInner {...props} />
        </Safe>
    )
}

addPropertyControls(AccountChip, {})
