import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"

import { C, EASE, SANS, signIn, signOut, useSession, Safe, startGuest, clearAuthError, deleteAccount } from "./MoodwaveAPI.tsx"

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

/** Sign-in problems (e.g. not on the Spotify allow-list), shown on whichever page you land. */
function AuthNotice({ message, canGuest }: { message: string; canGuest: boolean }) {
    const [busy, setBusy] = useState(false)
    if (typeof document === "undefined") return null
    return createPortal(
        <motion.div
            role="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ position: "fixed", top: 84, left: 16, right: 16, zIndex: 55, display: "flex", justifyContent: "center", pointerEvents: "none" }}
        >
            <div style={{ pointerEvents: "auto", maxWidth: 560, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 12px 12px 18px", borderRadius: 18, background: C.surface3, border: `1px solid color-mix(in srgb, ${C.amber} 40%, transparent)`, boxShadow: "0 24px 60px -20px rgba(0,0,0,0.95)", fontFamily: SANS, fontSize: 14, lineHeight: 1.45, color: C.text }}>
                <span style={{ flex: "1 1 260px" }}>{message}</span>
                <span style={{ display: "flex", gap: 6 }}>
                    {canGuest ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                                setBusy(true)
                                try {
                                    await startGuest()
                                } catch {
                                    setBusy(false)
                                }
                            }}
                            style={{ ...chip, height: 36, border: "none", background: C.lilac, color: C.ink }}
                        >
                            {busy ? "Starting…" : "Try as a guest"}
                        </button>
                    ) : null}
                    <button type="button" aria-label="Dismiss" onClick={clearAuthError} style={{ ...chip, height: 36, padding: "0 12px", border: `1px solid ${C.line2}`, background: "transparent", color: C.muted }}>
                        ×
                    </button>
                </span>
            </div>
        </motion.div>,
        document.body,
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
    const notice = session.error ? <AuthNotice message={session.error} canGuest={Boolean(session.config?.guest_allowed) && !user} /> : null
    if (!user) {
        return (
            <div style={base}>
                {notice}
                <button type="button" onClick={() => signIn()} style={{ ...chip, border: "none", background: C.text, color: C.ink }}>
                    <Dot color="#1ed760" /> Connect Spotify
                </button>
            </div>
        )
    }

    const guest = Boolean(user.is_guest)
    const live = !user.is_demo && !guest
    const perDay = session.config?.guest_playlists_per_day ?? 5
    return (
        <div ref={ref} style={base}>
            {notice}
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={live ? "Spotify connected. Account menu" : guest ? "Guest. Account menu" : "Demo mode. Account menu"}
                onClick={() => setOpen((o) => !o)}
                style={{ ...chip, border: `1px solid ${C.line2}`, background: "rgba(24, 22, 28, 0.8)", color: C.text, paddingLeft: user.avatar_url ? 5 : 14 }}
            >
                {user.avatar_url ? <img src={user.avatar_url} alt="" width={30} height={30} style={{ borderRadius: 30, objectFit: "cover" }} /> : null}
                <Dot color={live ? "#1ed760" : C.amber} pulse={live} />
                {live ? user.display_name.split(" ")[0] : guest ? "Guest" : "Demo mode"}
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
                            <div style={{ fontSize: 14, color: C.text }}>{guest ? "Guest" : user.display_name}</div>
                            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2, maxWidth: 220, lineHeight: 1.4 }}>
                                {live ? "Spotify connected" : guest ? `Up to ${perDay} playlists a day. Connect Spotify to save them — they come with you.` : "Sample catalogue, nothing saved to Spotify"}
                            </div>
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
                            {guest ? "Leave guest mode" : "Sign out"}
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false)
                                void deleteAccount().catch((e: Error) => window.alert(e.message))
                            }}
                            style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 10, border: "none", background: "transparent", color: C.amber, fontSize: 13, cursor: "pointer" }}
                        >
                            Delete my account and data
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
