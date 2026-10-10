import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState, type CSSProperties, useRef } from "react"
import { createPortal } from "react-dom"

import { C, EASE, MONO, SANS, SERIF, signIn, signOut, useSession, Safe, useDialogFocus } from "./MoodwaveAPI.tsx"

/** Phone navigation: a burger that opens a full-screen sheet of large, staggered links. */

interface MobileMenuProps {
    accent: string
    style?: CSSProperties
}

const LINKS = [
    { href: "/create", label: "Create", note: "Describe a moment" },
    { href: "/library", label: "Library", note: "Everything you’ve made" },
    { href: "/how-it-works", label: "How it works", note: "From words to records" },
    { href: "/", label: "Home", note: "Start again" },
]

function MobileMenuInner(props: MobileMenuProps) {
    const { accent = C.lilac } = props
    const isStatic = useIsStaticRenderer()
    const session = useSession(!isStatic)
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const sheet = useRef<HTMLDivElement>(null)
    useEffect(() => setMounted(true), [])
    useDialogFocus(open, sheet)

    useEffect(() => {
        if (!open) return
        const root = document.documentElement
        const previous = root.style.overflow
        root.style.overflow = "hidden"
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
        window.addEventListener("keydown", onKey)
        return () => {
            root.style.overflow = previous
            window.removeEventListener("keydown", onKey)
        }
    }, [open])

    const here = typeof window === "undefined" ? "" : window.location.pathname

    const burger = (
        <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={{ position: "relative", width: 44, height: 44, borderRadius: 100, border: `1px solid ${C.line2}`, background: "rgba(24,22,28,0.8)", cursor: "pointer", display: "grid", placeItems: "center", zIndex: 61 }}
        >
            {[0, 1].map((i) => (
                <motion.span
                    key={i}
                    animate={open ? { rotate: i ? -45 : 45, y: 0 } : { rotate: 0, y: i ? 3.5 : -3.5 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    style={{ position: "absolute", width: 16, height: 1.5, borderRadius: 2, background: C.text }}
                />
            ))}
        </button>
    )

    if (isStatic) return <div style={{ ...props.style }}>{burger}</div>

    return (
        <div style={{ position: "relative", ...props.style }}>
            {burger}
            {mounted && createPortal(
                <AnimatePresence>
                    {open ? (
                        <motion.div
                            key="sheet"
                            ref={sheet}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Menu"
                            initial={{ clipPath: "circle(0% at calc(100% - 38px) 38px)" }}
                            animate={{ clipPath: "circle(150% at calc(100% - 38px) 38px)" }}
                            exit={{ clipPath: "circle(0% at calc(100% - 38px) 38px)" }}
                            transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
                            style={{ position: "fixed", inset: 0, zIndex: 60, background: C.ink, display: "flex", flexDirection: "column", padding: "96px 24px 32px", fontFamily: SANS }}
                        >
                            <div aria-hidden style={{ position: "absolute", width: 520, height: 520, right: -220, top: -180, borderRadius: "50%", background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 28%, transparent), transparent)`, filter: "blur(30px)" }} />
                            <button
                                type="button"
                                aria-label="Close menu"
                                onClick={() => setOpen(false)}
                                style={{ position: "absolute", top: 20, right: 20, width: 44, height: 44, borderRadius: 100, border: `1px solid ${C.line2}`, background: "transparent", color: C.text, fontSize: 20, cursor: "pointer" }}
                            >
                                ×
                            </button>
                            <nav style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
                                {LINKS.map((link, i) => {
                                    const active = here === link.href
                                    return (
                                        <motion.a
                                            key={link.href}
                                            href={link.href}
                                            onClick={() => setOpen(false)}
                                            initial={{ opacity: 0, y: 28 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            transition={{ duration: 0.6, ease: EASE, delay: 0.18 + i * 0.07 }}
                                            style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: "14px 0", borderBottom: `1px solid ${C.line}`, textDecoration: "none" }}
                                        >
                                            <span style={{ fontFamily: SERIF, fontWeight: 300, fontSize: 42, lineHeight: 1, letterSpacing: "-0.03em", color: active ? accent : C.text, fontStyle: active ? "italic" : "normal" }}>{link.label}</span>
                                            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.faint }}>{link.note}</span>
                                        </motion.a>
                                    )
                                })}
                            </nav>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                style={{ position: "relative", marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: C.subtle, fontSize: 14 }}
                            >
                                {session.user ? (
                                    <>
                                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: 8, background: session.user.is_demo ? C.amber : "#1ed760" }} />
                                            {session.user.is_demo ? "Demo mode" : session.user.display_name}
                                        </span>
                                        <button type="button" onClick={() => signOut()} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer" }}>
                                            Sign out
                                        </button>
                                    </>
                                ) : session.config?.spotify_enabled ? (
                                    <button type="button" onClick={() => signIn()} style={{ width: "100%", height: 50, borderRadius: 100, border: "none", background: C.text, color: C.ink, fontSize: 15, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: 8, background: "#1ed760" }} /> Connect Spotify
                                    </button>
                                ) : null}
                            </motion.div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    )
}

/**
 * @framerIntrinsicWidth 44
 * @framerIntrinsicHeight 44
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function MobileMenu(props: MobileMenuProps) {
    return (
        <Safe name="MobileMenu">
            <MobileMenuInner {...props} />
        </Safe>
    )
}

addPropertyControls(MobileMenu, {
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
