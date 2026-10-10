import { useEffect, useState } from "react"

/**
 * Shared client for the Moodwave API: the API address, bearer-token session, types and
 * design constants used by the Studio, PlaylistView, Library and AccountChip components.
 */

// The deployed FastAPI service. Change this one line after deploying.
export const API_URL = "https://moodwave-api.onrender.com"

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

// --- Shared motion helpers --------------------------------------------------------------

/** Real covers used when the API is asleep or unreachable. */
export const FALLBACK_COVERS = [
    "https://cdn-images.dzcdn.net/images/cover/fd00ebd6d30d7253f813dba3bb1c66a9/1000x1000-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/f798a866107715dd6dc1049e498ce21f/1000x1000-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/4dff56488d13d0b5e96d93d895c9624b/1000x1000-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/d5232fcff85db84e212da2265dd70866/1000x1000-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/8f0187ad83cdd1f47f1c55420f9df227/1000x1000-000000-80-0-0.jpg",
    "https://is1-ssl.mzstatic.com/image/thumb/Music113/v4/12/9c/4d/129c4dd1-3ba4-05bd-487d-c4eb1e0eec89/27485.jpg/600x600bb.jpg",
]

export interface FeaturedTrack {
    title: string
    artists: string[]
    image_url: string | null
    energy: number | null
}

let featuredCache: FeaturedTrack[] | null = null
let featuredRequest: Promise<FeaturedTrack[]> | null = null

function loadFeatured(): Promise<FeaturedTrack[]> {
    if (featuredCache) return Promise.resolve(featuredCache)
    featuredRequest ??= fetch(`${API_URL}/catalog/featured`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { tracks?: FeaturedTrack[] } | null) => {
            const tracks = (data?.tracks ?? []).filter((t) => Boolean(t.image_url))
            if (tracks.length >= 6) featuredCache = tracks
            return tracks
        })
        .catch(() => [])
    return featuredRequest
}

/** Real tracks (with artwork and energy) from the public showcase endpoint, cached per page. */
export function useFeaturedTracks(): FeaturedTrack[] {
    const [tracks, setTracks] = useState<FeaturedTrack[]>(featuredCache ?? [])
    useEffect(() => {
        let alive = true
        loadFeatured().then((t) => {
            if (alive && t.length) setTracks(t)
        })
        return () => {
            alive = false
        }
    }, [])
    return tracks
}

/** Album covers from the showcase endpoint, falling back to a fixed set. */
export function useFeaturedCovers(count = 12): string[] {
    const tracks = useFeaturedTracks()
    const urls = Array.from(new Set(tracks.map((t) => t.image_url).filter((u): u is string => Boolean(u))))
    return (urls.length >= 6 ? urls : FALLBACK_COVERS).slice(0, count)
}

/** True on devices with a precise pointer (mouse/trackpad): hover-only effects are off elsewhere. */
export function useFinePointer(): boolean {
    const [fine, setFine] = useState(false)
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return
        const mq = window.matchMedia("(pointer: fine)")
        const update = () => setFine(mq.matches)
        update()
        mq.addEventListener("change", update)
        return () => mq.removeEventListener("change", update)
    }, [])
    return fine
}

// --- Sound (opt-in) ---------------------------------------------------------------------
// Off by default. The audio graph is only created after a click on a sound toggle, which
// is also what browsers require before any audio can play.

let audioCtx: AudioContext | null = null
let master: GainNode | null = null
let analyser: AnalyserNode | null = null
let noise: AudioBuffer | null = null
let soundOn = false
const soundListeners = new Set<(on: boolean) => void>()

function ensureAudio() {
    if (audioCtx || typeof window === "undefined") return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioCtx = new Ctor()
    master = audioCtx.createGain()
    master.gain.value = 0.12
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 128
    master.connect(analyser)
    analyser.connect(audioCtx.destination)
    noise = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
}

export function setSound(on: boolean) {
    soundOn = on
    if (on) {
        ensureAudio()
        void audioCtx?.resume()
    } else {
        stopPad()
        void audioCtx?.suspend()
    }
    soundListeners.forEach((fn) => fn(on))
}

export function useSound() {
    const [enabled, setEnabled] = useState(soundOn)
    useEffect(() => {
        soundListeners.add(setEnabled)
        return () => {
            soundListeners.delete(setEnabled)
        }
    }, [])
    return { enabled, toggle: () => setSound(!soundOn) }
}

/** Fills `into` with live frequency data while sound is on; returns false otherwise. */
export function readSpectrum(into: Uint8Array<ArrayBuffer>): boolean {
    if (!soundOn || !analyser) return false
    analyser.getByteFrequencyData(into)
    return true
}

interface Pad {
    oscs: OscillatorNode[]
    filter: BiquadFilterNode
    gain: GainNode
    pulse: number
    bpm: number
}
let pad: Pad | null = null

const CHORDS = [
    [110, 130.81, 164.81], // A minor, low: calm
    [130.81, 164.81, 196.0], // C major
    [146.83, 185.0, 220.0], // D major
    [164.81, 207.65, 246.94], // E major, bright: peak
]

function kick(time: number, strength: number) {
    if (!audioCtx || !master) return
    const osc = audioCtx.createOscillator()
    const g = audioCtx.createGain()
    osc.frequency.setValueAtTime(120, time)
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.18)
    g.gain.setValueAtTime(0.55 * strength, time)
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.22)
    osc.connect(g)
    g.connect(master)
    osc.start(time)
    osc.stop(time + 0.25)
}

/** A soft pad, with a pulse at the matching tempo, that follows an energy value 0–1. */
export function playPad(energy: number) {
    if (!soundOn) return
    ensureAudio()
    const ctx = audioCtx
    if (!ctx || !master) return
    const e = Math.max(0, Math.min(1, energy))
    const chord = CHORDS[Math.min(CHORDS.length - 1, Math.floor(e * CHORDS.length))]
    const now = ctx.currentTime
    const bpm = Math.round(60 + e * 110)
    if (!pad) {
        const filter = ctx.createBiquadFilter()
        filter.type = "lowpass"
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.5, now + 0.6)
        filter.connect(gain)
        gain.connect(master)
        const oscs = chord.flatMap((f) =>
            [-6, 6].map((detune) => {
                const o = ctx.createOscillator()
                o.type = "sawtooth"
                o.frequency.value = f
                o.detune.value = detune
                o.connect(filter)
                o.start()
                return o
            }),
        )
        pad = { oscs, filter, gain, pulse: 0, bpm: 0 }
    }
    const current = pad
    chord.forEach((f, i) => {
        current.oscs[i * 2]?.frequency.setTargetAtTime(f, now, 0.15)
        current.oscs[i * 2 + 1]?.frequency.setTargetAtTime(f, now, 0.15)
    })
    current.filter.frequency.setTargetAtTime(380 + e * 2600, now, 0.2)
    if (current.bpm !== bpm) {
        window.clearInterval(current.pulse)
        current.bpm = bpm
        current.pulse = window.setInterval(() => kick(ctx.currentTime + 0.02, 0.4 + e * 0.6), (60 / bpm) * 1000)
    }
}

export function stopPad() {
    if (!pad || !audioCtx) return
    const p = pad
    pad = null
    window.clearInterval(p.pulse)
    p.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15)
    window.setTimeout(() => p.oscs.forEach((o) => o.stop()), 800)
}

/** A short vinyl scratch whose pitch follows how fast the record is moving. */
export function scratch(velocity: number) {
    if (!soundOn || !audioCtx || !master || !noise) return
    const v = Math.min(1, Math.abs(velocity))
    if (v < 0.02) return
    const now = audioCtx.currentTime
    const src = audioCtx.createBufferSource()
    src.buffer = noise
    const band = audioCtx.createBiquadFilter()
    band.type = "bandpass"
    band.Q.value = 6
    band.frequency.value = 300 + v * 2400
    const g = audioCtx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.25 * v + 0.02, now + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
    src.connect(band)
    band.connect(g)
    g.connect(master)
    src.start(now, Math.random() * 0.8, 0.08)
}

/** The small "♪ Sound" pill shared by the mixer and the record. */
export function SoundToggle({ accent = C.lilac }: { accent?: string }) {
    const { enabled, toggle } = useSound()
    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={enabled}
            style={{ height: 34, borderRadius: 100, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${enabled ? accent : C.line2}`, background: enabled ? `color-mix(in srgb, ${accent} 14%, transparent)` : "transparent", color: enabled ? C.text : C.subtle, fontFamily: SANS, fontSize: 12.5, cursor: "pointer" }}
        >
            <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 10 }}>
                {[6, 10, 4].map((h, i) => (
                    <span key={i} style={{ width: 2, height: enabled ? h : 3, borderRadius: 2, background: enabled ? accent : C.subtle, transition: "height 0.3s ease" }} />
                ))}
            </span>
            Sound {enabled ? "on" : "off"}
        </button>
    )
}
