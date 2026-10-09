import { useEffect, useState } from "react"

/**
 * Shared client for the Moodwave API: the API address, bearer-token session, types and
 * design constants used by the Studio, PlaylistView, Library and AccountChip components.
 */

// The deployed FastAPI service. Change this one line after deploying.
export const API_URL = "http://127.0.0.1:8000"

// --- Design tokens (match the site's colour styles) -------------------------------------
export const C = {
    ink: "#0b0a0d",
    surface: "#121015",
    surface2: "#18161c",
    surface3: "#1f1c24",
    text: "#f2efe9",
    muted: "#b3ada4",
    subtle: "#8a847c",
    faint: "#5d5852",
    line: "rgba(242, 239, 233, 0.07)",
    line2: "rgba(242, 239, 233, 0.13)",
    lilac: "#c6b1f0",
    amber: "#e8b86b",
    moss: "#8fbf8a",
}
export const SERIF = '"Fraunces", "Fraunces Placeholder", Georgia, serif'
export const SANS = '"Inter", "Inter Placeholder", system-ui, sans-serif'
export const MONO = '"JetBrains Mono", "JetBrains Mono Placeholder", ui-monospace, monospace'
export const EASE = [0.22, 1, 0.36, 1] as const

// --- Types (mirror apps/api/app/schemas.py) ------------------------------------------
export interface User {
    id: string
    display_name: string
    avatar_url: string | null
    is_demo: boolean
}
export interface AppConfig {
    demo_mode: boolean
    demo_allowed?: boolean
    spotify_enabled: boolean
    ai_enabled: boolean
    ai_model: string | null
}
export interface Track {
    id: string
    uri: string
    title: string
    artists: string[]
    album: string
    image_url: string | null
    duration_ms: number
    explicit: boolean
    external_url: string | null
    release_year: number | null
    energy: number | null
    reason: string | null
}
export interface Intent {
    title: string
    description: string
    moods: string[]
    genres: string[]
    energy: number
    era: string | null
    rationale: string
}
export interface Refinement {
    id: number
    instruction: string
    summary: string
    added: number
    removed: number
    created_at: string
}
export interface Playlist {
    id: string
    title: string
    description: string
    prompt: string
    intent: Intent
    tracks: Track[]
    stats: {
        track_count: number
        total_duration_ms: number
        artist_count: number
        avg_energy: number | null
        energy_curve: number[]
    }
    refinements: Refinement[]
    ai_source: "claude" | "heuristic"
    spotify_url: string | null
    notice?: string | null
    created_at: string
}
export interface PlaylistSummary {
    id: string
    title: string
    prompt: string
    moods: string[]
    energy: number
    cover_images: (string | null)[]
    track_count: number
    total_duration_ms: number
    saved_to_spotify: boolean
    spotify_url: string | null
    created_at: string
}
export interface GenerateInput {
    prompt: string
    length: number
    energy: number | null
    allow_explicit: boolean
    use_my_taste: boolean
}

// --- Token ------------------------------------------------------------------------------
const TOKEN_KEY = "mw_token"

export function getToken(): string | null {
    try {
        return window.localStorage.getItem(TOKEN_KEY)
    } catch {
        return null
    }
}

function setToken(token: string | null) {
    try {
        if (token) window.localStorage.setItem(TOKEN_KEY, token)
        else window.localStorage.removeItem(TOKEN_KEY)
    } catch {
        // Storage blocked (private mode): the session lasts for this page only.
    }
}

export class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
        super(message)
        this.status = status
    }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = { Accept: "application/json" }
    if (init.body) headers["Content-Type"] = "application/json"
    if (token) headers.Authorization = `Bearer ${token}`
    let res: Response
    try {
        res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } })
    } catch {
        throw new ApiError("Couldn’t reach Moodwave. If it’s been idle, it may be waking up — try again in a moment.", 0)
    }
    if (res.status === 401) {
        setToken(null)
        updateSession({ user: null })
    }
    if (!res.ok) {
        let detail = `Something went wrong (${res.status}).`
        try {
            const body = await res.json()
            if (typeof body?.detail === "string") detail = body.detail
        } catch {
            // Non-JSON error body.
        }
        throw new ApiError(detail, res.status)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
}

// --- Session store (shared across components on a page) -----------------------------
interface SessionState {
    ready: boolean
    user: User | null
    config: AppConfig | null
    error: string | null
}

let session: SessionState = { ready: false, user: null, config: null, error: null }
const listeners = new Set<(s: SessionState) => void>()
let booting: Promise<void> | null = null

function updateSession(patch: Partial<SessionState>) {
    session = { ...session, ...patch }
    listeners.forEach((fn) => fn(session))
}

async function boot() {
    // Coming back from Spotify sign-in: swap the one-time code in the fragment for a token.
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const code = hash.get("mw_code")
    if (code) {
        history.replaceState(null, "", window.location.pathname + window.location.search)
        try {
            const out = await api<{ token: string; user: User }>("/auth/exchange", {
                method: "POST",
                body: JSON.stringify({ code }),
            })
            setToken(out.token)
        } catch (e) {
            updateSession({ error: (e as Error).message })
        }
    }
    const authError = new URLSearchParams(window.location.search).get("auth_error")
    if (authError) {
        updateSession({ error: AUTH_ERRORS[authError] ?? "Spotify sign-in didn’t complete." })
    }
    try {
        const [config, user] = await Promise.all([
            api<AppConfig>("/auth/config"),
            getToken() ? api<User | null>("/auth/me") : Promise.resolve(null),
        ])
        updateSession({ ready: true, config, user })
    } catch (e) {
        updateSession({ ready: true, error: session.error ?? (e as Error).message })
    }
}

const AUTH_ERRORS: Record<string, string> = {
    access_denied: "Spotify sign-in was cancelled.",
    not_allowlisted: "This Spotify account isn’t on the app’s allow-list yet.",
    invalid_state: "That sign-in link expired. Please try again.",
    token_exchange_failed: "Spotify didn’t accept the sign-in. Please try again.",
}

export function useSession(enabled = true) {
    const [state, setState] = useState(session)
    useEffect(() => {
        if (!enabled || typeof window === "undefined") return
        listeners.add(setState)
        if (!booting) booting = boot()
        setState(session)
        return () => {
            listeners.delete(setState)
        }
    }, [enabled])
    return state
}

/** Send the browser to Spotify, coming back to `returnTo` (defaults to this page). */
export function signIn(returnTo?: string) {
    const target = returnTo ?? window.location.href.split("#")[0]
    window.location.href = `${API_URL}/auth/login?${new URLSearchParams({ return_to: target })}`
}

export async function startDemo(): Promise<User> {
    const out = await api<{ token: string; user: User }>("/auth/demo/token", { method: "POST" })
    setToken(out.token)
    updateSession({ user: out.user })
    return out.user
}

export function signOut() {
    setToken(null)
    updateSession({ user: null })
}

// --- Formatting -------------------------------------------------------------------------
export function duration(ms: number, long = false): string {
    const totalMin = Math.round(ms / 60000)
    if (long) {
        const h = Math.floor(totalMin / 60)
        return h ? `${h} hr ${totalMin % 60} min` : `${totalMin} min`
    }
    const s = Math.round(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function relativeTime(iso: string): string {
    const diff = (Date.now() - new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime()) / 1000
    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    const days = Math.floor(diff / 86400)
    return days === 1 ? "yesterday" : `${days} days ago`
}

export function energyLabel(value: number | null | undefined): string {
    if (value == null) return "Auto"
    if (value < 0.33) return "Calm"
    if (value < 0.56) return "Steady"
    if (value < 0.78) return "Lift"
    return "Peak"
}

/** Up to four distinct covers for a 2×2 collage. */
export function collageCovers(images: (string | null | undefined)[]): string[] {
    return Array.from(new Set(images.filter((src): src is string => Boolean(src)))).slice(0, 4)
}

/** Internal site links; path-only so they work on the canvas, preview and live site. */
export function go(path: string) {
    window.location.href = path
}

/** 2×2 album-art collage (falls back to a single cover or a soft gradient). */
export function Collage({ images, size, radius = 16 }: { images: (string | null | undefined)[]; size: number | string; radius?: number }) {
    const covers = collageCovers(images)
    const box = {
        width: size,
        height: size,
        aspectRatio: "1 / 1",
        borderRadius: radius,
        overflow: "hidden",
        flexShrink: 0,
        background: `linear-gradient(135deg, ${C.surface3}, #2a2233)`,
    } as const
    if (covers.length < 4) {
        return (
            <div style={box}>
                {covers[0] ? <img src={covers[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
            </div>
        )
    }
    return (
        <div style={{ ...box, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {covers.map((src) => (
                <img key={src} src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ))}
        </div>
    )
}
