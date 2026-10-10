import { AnimatePresence, motion, MotionGlobalConfig } from "framer-motion"
import { Component, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

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
    subtle: "#99938a",
    faint: "#858079",
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
    /** Trying Moodwave without Spotify: limits apply, nothing saves to Spotify. */
    is_guest?: boolean
}
export interface AppConfig {
    demo_mode: boolean
    demo_allowed?: boolean
    spotify_enabled: boolean
    ai_enabled: boolean
    guest_allowed?: boolean
    guest_playlists_per_day?: number
    guest_max_tracks?: number
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
    /** From a similar artist, added when an artist-only request ran out of fitting songs. */
    similar?: boolean
}
export interface Intent {
    title: string
    description: string
    moods: string[]
    genres: string[]
    energy: number
    era: string | null
    rationale: string
    /** Artists the listener asked to hear exclusively (songs by or featuring them). */
    focus_artists?: string[]
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
    updated_at?: string
    synced_at?: string | null
    /** Saved to Spotify, then edited here since. */
    needs_sync?: boolean
    cover?: PlaylistCoverChoice
    /** Public read-only link is `${API_URL}/s/${share_slug}`; null when sharing is off. */
    share_slug?: string | null
}
export interface PlaylistCoverChoice {
    mode: "auto" | "grid" | "single" | "upload"
    track_ids: string[]
    /** What the cover shows: 4 images (grid) or 1 (single/upload). */
    images: (string | null)[]
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
    /** A Spotify song or playlist link to start from. */
    seed_url?: string | null
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
    // A request that takes more than 4s is almost always the API waking up.
    const slow = typeof window !== "undefined" ? window.setTimeout(() => setWarming(true), 4000) : 0
    let res: Response | null = null
    try {
        for (let attempt = 0; attempt < 2 && !res; attempt++) {
            try {
                res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } })
            } catch {
                // Connection refused while the host spins up: wait and try once more.
                if (attempt === 0) {
                    setWarming(true)
                    await new Promise((r) => setTimeout(r, 3500))
                }
            }
        }
    } finally {
        if (slow) window.clearTimeout(slow)
        setWarming(false)
    }
    if (!res) throw new ApiError("Couldn’t reach Moodwave. It may still be waking up — try again in a moment.", 0)
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
        if (res.status >= 500) reportError(`API ${res.status} on ${init.method ?? "GET"} ${path}: ${detail}`)
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
    wakeApi()
    // Coming back from Spotify sign-in: swap the one-time code in the fragment for a token.
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const code = hash.get("mw_code")
    if (code) {
        history.replaceState(null, "", window.location.pathname + window.location.search)
        try {
            const out = await api<{ token: string; user: User }>("/auth/exchange", {
                method: "POST",
                // A guest session in this browser hands its playlists to the account.
                body: JSON.stringify({ code, guest_token: getToken() }),
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
    not_allowlisted: "Moodwave is invite-only on Spotify for now, so that account can’t sign in yet. You can still try it as a guest.",
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

/** Try Moodwave without Spotify (real catalogue and AI, daily limits, nothing saved). */
export async function startGuest(): Promise<User> {
    const out = await api<{ token: string; user: User }>("/auth/guest/token", { method: "POST" })
    setToken(out.token)
    updateSession({ user: out.user, error: null })
    return out.user
}

export function clearAuthError() {
    updateSession({ error: null })
    const url = new URL(window.location.href)
    if (url.searchParams.has("auth_error")) {
        url.searchParams.delete("auth_error")
        history.replaceState(null, "", url.pathname + url.search)
    }
}

/**
 * Delete this account and everything stored for it (asks first). Spotify access can also be
 * removed at spotify.com/account/apps. Returns true when deleted.
 */
export async function deleteAccount(): Promise<boolean> {
    const guest = Boolean(session.user?.is_guest)
    const ok = window.confirm(
        guest
            ? "Delete this guest session and every playlist made in it? This can’t be undone."
            : "Delete your Moodwave account and everything in it — playlists, covers, share links and thumbs? Playlists already saved to Spotify stay in Spotify. This can’t be undone."
    )
    if (!ok) return false
    await api<void>("/auth/me", { method: "DELETE" })
    signOut()
    window.location.href = "/"
    return true
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


/**
 * Ask the image CDN for a version near `px` wide instead of the full original. Framer,
 * Deezer and Apple artwork URLs can all be resized; anything else is returned unchanged.
 */
export function sized(url: string | null | undefined, px: number): string {
    if (!url) return ""
    // Uploaded covers are served by the API (paths like /playlists/{id}/cover.jpg?v=…).
    if (url.startsWith("/")) return `${API_URL}${url}`
    if (url.includes("framerusercontent.com/images/")) return `${url.split("?")[0]}?scale-down-to=${px <= 256 ? 256 : px <= 512 ? 512 : 1024}`
    if (url.includes("dzcdn.net")) {
        const s = px <= 250 ? 250 : px <= 500 ? 500 : 1000
        return url.replace(/\/\d+x\d+-/, `/${s}x${s}-`)
    }
    if (url.includes("mzstatic.com")) return url.replace(/\/\d+x\d+bb\./, `/${px}x${px}bb.`)
    return url
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
                {covers[0] ? <img src={sized(covers[0], 512)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
            </div>
        )
    }
    return (
        <div style={{ ...box, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {covers.map((src) => (
                <img key={src} src={sized(src, 256)} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ))}
        </div>
    )
}

// --- Shared motion helpers --------------------------------------------------------------

/** Real covers used when the API is asleep or unreachable. */
export const FALLBACK_COVERS = [
    "https://cdn-images.dzcdn.net/images/cover/fd00ebd6d30d7253f813dba3bb1c66a9/500x500-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/f798a866107715dd6dc1049e498ce21f/500x500-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/4dff56488d13d0b5e96d93d895c9624b/500x500-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/d5232fcff85db84e212da2265dd70866/500x500-000000-80-0-0.jpg",
    "https://cdn-images.dzcdn.net/images/cover/8f0187ad83cdd1f47f1c55420f9df227/500x500-000000-80-0-0.jpg",
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
        stopSpinTone()
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

/** A vinyl scratch whose pitch and loudness follow how fast the record is moving. */
export function scratch(velocity: number) {
    if (!soundOn || !audioCtx || !master || !noise) return
    const v = Math.min(1, Math.abs(velocity))
    if (v < 0.03) return
    const now = audioCtx.currentTime
    const src = audioCtx.createBufferSource()
    src.buffer = noise
    const band = audioCtx.createBiquadFilter()
    band.type = "bandpass"
    band.Q.value = 1.4
    band.frequency.setValueAtTime(500 + v * 2600, now)
    // The "wick-wick": pitch slides down over the burst, like a hand pulling the record.
    band.frequency.exponentialRampToValueAtTime(250 + v * 900, now + 0.11)
    const g = audioCtx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(1.1 * v + 0.15, now + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    src.connect(band)
    band.connect(g)
    g.connect(master)
    src.start(now, Math.random() * 0.8, 0.13)
}

interface SpinVoice {
    oscs: OscillatorNode[]
    filter: BiquadFilterNode
    gain: GainNode
}
let spinVoice: SpinVoice | null = null
const SPIN_NOTES = [196.0, 246.94, 293.66] // G major: a warm chord the platter "plays"

/**
 * The record "playing": a chord whose pitch and volume follow the platter's speed, so a
 * fling sounds like a turntable winding down (tape stop). `rate` ≈ 1 is full speed.
 */
export function spinTone(rate: number) {
    if (!soundOn) return
    ensureAudio()
    const ctx = audioCtx
    if (!ctx || !master) return
    const r = Math.max(0, Math.min(1.3, rate))
    const now = ctx.currentTime
    if (!spinVoice) {
        const filter = ctx.createBiquadFilter()
        filter.type = "lowpass"
        filter.frequency.value = 1400
        const gain = ctx.createGain()
        gain.gain.value = 0
        filter.connect(gain)
        gain.connect(master)
        const oscs = SPIN_NOTES.map((f, i) => {
            const o = ctx.createOscillator()
            o.type = i === 0 ? "sawtooth" : "triangle"
            o.frequency.value = f
            o.connect(filter)
            o.start()
            return o
        })
        spinVoice = { oscs, filter, gain }
    }
    const voice = spinVoice
    voice.oscs.forEach((o, i) => o.frequency.setTargetAtTime(SPIN_NOTES[i] * (0.3 + 0.7 * Math.min(1, r)), now, 0.04))
    voice.filter.frequency.setTargetAtTime(500 + 1500 * Math.min(1, r), now, 0.05)
    voice.gain.gain.setTargetAtTime(0.42 * Math.min(1, r * 1.4), now, 0.05)
}

export function stopSpinTone() {
    if (!spinVoice || !audioCtx) return
    const voice = spinVoice
    spinVoice = null
    voice.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.08)
    window.setTimeout(() => voice.oscs.forEach((o) => o.stop()), 600)
}

/** The needle landing: a soft thump and a little surface crackle. */
export function needleDrop() {
    if (!soundOn || !audioCtx || !master || !noise) return
    const now = audioCtx.currentTime
    kick(now + 0.01, 0.9)
    const src = audioCtx.createBufferSource()
    src.buffer = noise
    const lp = audioCtx.createBiquadFilter()
    lp.type = "highpass"
    lp.frequency.value = 2500
    const g = audioCtx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
    src.connect(lp)
    lp.connect(g)
    g.connect(master)
    src.start(now, Math.random() * 0.4, 0.6)
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

// --- Shared Spotify player ------------------------------------------------------------------
// One Spotify iFrame-API player per page, docked at the bottom. The showcase rows
// (TrackPlay) and the playlist page both drive it. Signed-out listeners get previews;
// listeners signed in to Spotify in the browser get full tracks.

interface SpotifyController {
    loadUri: (uri: string) => void
    play: () => void
    togglePlay: () => void
    destroy?: () => void
    addListener: (event: string, cb: (e: { data: { isPaused: boolean; position?: number; duration?: number } }) => void) => void
}
type SpotifyIframeApi = { createController: (el: HTMLElement, opts: object, cb: (c: SpotifyController) => void) => void }

export interface QueueItem {
    id: string
    label: string
}
export interface PlayerState {
    id: string | null
    label: string
    playing: boolean
    /** What plays next: a playlist, or the showcase songs. Empty for a single song. */
    queue: QueueItem[]
    index: number
}
let playerState: PlayerState = { id: null, label: "", playing: false, queue: [], index: -1 }
const playerListeners = new Set<(s: PlayerState) => void>()
const setPlayer = (patch: Partial<PlayerState>) => {
    playerState = { ...playerState, ...patch }
    playerListeners.forEach((fn) => fn(playerState))
}
let spotifyController: SpotifyController | null = null
let iframeApi: Promise<SpotifyIframeApi> | null = null

function loadIframeApi(): Promise<SpotifyIframeApi> {
    iframeApi ??= new Promise((resolve) => {
        const w = window as unknown as { onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void }
        w.onSpotifyIframeApiReady = (api) => resolve(api)
        const script = document.createElement("script")
        script.src = "https://open.spotify.com/embed/iframe-api/v1"
        script.async = true
        document.body.appendChild(script)
    })
    return iframeApi
}

export function usePlayer(): PlayerState {
    const [state, setState] = useState(playerState)
    useEffect(() => {
        playerListeners.add(setState)
        setState(playerState)
        return () => {
            playerListeners.delete(setState)
        }
    }, [])
    return state
}

/**
 * Play a track (call from a click). The same track toggles play/pause; another track swaps
 * in place. The first play opens the dock, which creates the player.
 */
export function requestPlay(id: string, label: string, queue?: QueueItem[]) {
    if (queue) {
        const index = queue.findIndex((q) => q.id === id)
        setPlayer(index >= 0 ? { queue, index } : { queue: [], index: -1 })
    } else if (playerState.id !== id) {
        setPlayer({ queue: [], index: -1 })
    }
    if (playerState.id === id && spotifyController) {
        spotifyController.togglePlay()
        return
    }
    load(id, label)
}

function load(id: string, label: string) {
    advancedFor = null
    setPlayer({ id, label, playing: false })
    if (spotifyController) {
        spotifyController.loadUri(`spotify:track:${id}`)
        spotifyController.play()
    }
}

/** Play a whole list from the top (or from `start`). */
export function playQueue(queue: QueueItem[], start = 0) {
    if (!queue.length) return
    const item = queue[Math.max(0, Math.min(start, queue.length - 1))]
    setPlayer({ queue, index: queue.indexOf(item) })
    load(item.id, item.label)
}

export function skipTrack(step: 1 | -1) {
    const { queue, index } = playerState
    const next = index + step
    if (!queue.length || next < 0 || next >= queue.length) return false
    setPlayer({ index: next })
    load(queue[next].id, queue[next].label)
    return true
}

// Auto-advance: the embed reports position/duration; near the end, move on once per song.
let advancedFor: string | null = null
let lastPosition = 0
function onPlayback(data: { isPaused: boolean; position?: number; duration?: number }) {
    setPlayer({ playing: !data.isPaused })
    const { position = 0, duration = 0 } = data
    const nearEnd = duration > 0 && position >= duration - 400
    // Some embeds jump back to 0 and pause when a song finishes.
    const wrapped = data.isPaused && duration > 0 && position === 0 && lastPosition >= duration - 1500
    lastPosition = position
    if ((nearEnd || wrapped) && playerState.id && advancedFor !== playerState.id && playerState.queue.length > 1) {
        advancedFor = playerState.id
        window.setTimeout(() => skipTrack(1), nearEnd && !data.isPaused ? 450 : 0)
    }
}

export function closePlayer() {
    spotifyController?.destroy?.()
    spotifyController = null
    setPlayer({ id: null, label: "", playing: false, queue: [], index: -1 })
}

function DockButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 26, border: "none", background: C.surface3, color: C.text, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, lineHeight: 1, fontSize: 11, display: "grid", placeItems: "center", padding: 0 }}
        >
            {children}
        </button>
    )
}

/** Render once per page. Shows while something is playing; owns the Spotify iframe. */
export function PlayerDock({ accent = C.lilac, bottom = 16 }: { accent?: string; bottom?: number }) {
    const state = usePlayer()
    const [mounted, setMounted] = useState(false)
    const mount = useRef<HTMLDivElement>(null)
    useEffect(() => setMounted(true), [])
    useEffect(() => () => closePlayer(), [])

    // First play: create the player inside the dock once it has rendered.
    useEffect(() => {
        if (!state.id || spotifyController || !mount.current) return
        const el = mount.current
        const uri = `spotify:track:${state.id}`
        let cancelled = false
        loadIframeApi().then((api) => {
            if (cancelled || spotifyController) return
            api.createController(el, { uri, width: "100%", height: 80, theme: "dark" }, (c) => {
                spotifyController = c
                c.addListener("ready", () => c.play())
                c.addListener("playback_update", (e) => onPlayback(e.data))
            })
        })
        return () => {
            cancelled = true
        }
    }, [state.id])

    if (!mounted) return null
    return createPortal(
        <AnimatePresence>
            {state.id ? (
                <motion.div
                    key="dock"
                    initial={{ y: 120, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 120, opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    style={{ position: "fixed", left: 16, right: 16, bottom, zIndex: 40, display: "flex", justifyContent: "center", pointerEvents: "none" }}
                >
                    <div style={{ pointerEvents: "auto", width: "100%", maxWidth: 560, borderRadius: 16, overflow: "hidden", background: C.surface, border: `1px solid ${C.line2}`, boxShadow: "0 30px 80px -20px rgba(0,0,0,0.9)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 10px 8px 14px", fontFamily: SANS, fontSize: 12.5, color: C.subtle }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 6, background: state.playing ? accent : C.faint, flexShrink: 0, transition: "background 0.3s ease" }} />
                                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {state.playing ? "Now playing" : "Ready"} · {state.label}
                                </span>
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                {state.queue.length > 1 ? (
                                    <>
                                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginRight: 2 }} aria-live="polite">
                                            {state.index + 1} / {state.queue.length}
                                        </span>
                                        <DockButton label="Previous song" disabled={state.index <= 0} onClick={() => skipTrack(-1)}>
                                            ⏮
                                        </DockButton>
                                        <DockButton label="Next song" disabled={state.index >= state.queue.length - 1} onClick={() => skipTrack(1)}>
                                            ⏭
                                        </DockButton>
                                    </>
                                ) : null}
                                <DockButton label="Close player" onClick={closePlayer}>
                                    ×
                                </DockButton>
                            </span>
                        </div>
                        <div ref={mount} />
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    )
}

// --- Prefill the composer ----------------------------------------------------------------
// Suggestion chips (recent prompts, "for right now") fill the prompt box on the same page;
// with no composer on the page they open the create page with the prompt instead.

let composersMounted = 0
export function registerComposer(): () => void {
    composersMounted++
    return () => {
        composersMounted--
    }
}

export function prefillComposer(prompt: string, createPath = "/create") {
    if (typeof window === "undefined") return
    if (composersMounted > 0) {
        window.dispatchEvent(new CustomEvent("mw:prefill", { detail: { prompt } }))
        return
    }
    window.location.href = `${createPath}?prompt=${encodeURIComponent(prompt)}`
}

// --- Track feedback (thumbs up/down) -------------------------------------------------------
// Liked songs steer future playlists; disliked ones (and artists disliked twice) are avoided.

export type Verdict = "up" | "down"
let feedback: Record<string, Verdict> = {}
let feedbackLoaded: Promise<void> | null = null
const feedbackListeners = new Set<(f: Record<string, Verdict>) => void>()
const emitFeedback = () => feedbackListeners.forEach((fn) => fn(feedback))

export function useFeedback(enabled: boolean): Record<string, Verdict> {
    const [state, setState] = useState(feedback)
    useEffect(() => {
        feedbackListeners.add(setState)
        if (enabled && getToken()) {
            feedbackLoaded ??= api<{ track_id: string; verdict: Verdict }[]>("/feedback")
                .then((rows) => {
                    feedback = Object.fromEntries(rows.map((r) => [r.track_id, r.verdict]))
                    emitFeedback()
                })
                .catch(() => {
                    feedbackLoaded = null
                })
        }
        setState(feedback)
        return () => {
            feedbackListeners.delete(setState)
        }
    }, [enabled])
    return state
}

/** Toggle a verdict (same verdict again clears it). Optimistic; rolls back on failure. */
export async function giveFeedback(track: Track, verdict: Verdict): Promise<Verdict | null> {
    const before = feedback[track.id]
    const next = before === verdict ? null : verdict
    feedback = { ...feedback }
    if (next) feedback[track.id] = next
    else delete feedback[track.id]
    emitFeedback()
    try {
        await api("/feedback", {
            method: "POST",
            body: JSON.stringify({ track_id: track.id, title: track.title, artist: track.artists[0] ?? "", verdict: next ?? "clear" }),
        })
    } catch (e) {
        feedback = { ...feedback }
        if (before) feedback[track.id] = before
        else delete feedback[track.id]
        emitFeedback()
        throw e
    }
    return next
}

// --- Streamed generation -------------------------------------------------------------------
// POST /playlists/generate/stream sends Server-Sent Events while the playlist is built.

export type GenerateEvent =
    | { type: "stage"; stage: "planning" | "filling" | "finishing"; have?: number; target?: number }
    | { type: "intent"; title: string; moods: string[]; energy: number }
    | { type: "verifying"; done: number; total: number }
    | { type: "track"; title: string; artist: string; cover: string | null }
    | { type: "done"; playlist: Playlist }
    | { type: "error"; status: number; detail: string }

/**
 * Generate with live progress. Resolves with the saved playlist. Throws `ApiError`; a
 * `StreamUnavailable` error means the stream never started, so the caller can fall back.
 */
export class StreamUnavailable extends Error {}

export async function streamGenerate(input: GenerateInput, onEvent: (e: GenerateEvent) => void): Promise<Playlist> {
    const token = getToken()
    const headers: Record<string, string> = { Accept: "text/event-stream", "Content-Type": "application/json" }
    if (token) headers.Authorization = `Bearer ${token}`
    let res: Response
    try {
        res = await fetch(`${API_URL}/playlists/generate/stream`, { method: "POST", headers, body: JSON.stringify(input) })
    } catch {
        throw new StreamUnavailable("network")
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
        if (res.status === 404 || res.status === 405) throw new StreamUnavailable(detail)
        throw new ApiError(detail, res.status)
    }
    if (!res.body) throw new StreamUnavailable("no body")

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let cut: number
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
            const chunk = buffer.slice(0, cut)
            buffer = buffer.slice(cut + 2)
            const data = chunk
                .split("\n")
                .filter((l) => l.startsWith("data: "))
                .map((l) => l.slice(6))
                .join("\n")
            if (!data) continue
            const event = JSON.parse(data) as GenerateEvent
            if (event.type === "done") return event.playlist
            if (event.type === "error") {
                if (event.status >= 500) reportError(`API ${event.status} on streamed generate: ${event.detail}`)
                throw new ApiError(event.detail, event.status)
            }
            onEvent(event)
        }
    }
    throw new ApiError("The connection dropped before the playlist was ready. Check your library in a moment.", 0)
}

// --- Error reporting -----------------------------------------------------------------------
// Crashes go to the API's built-in log (POST /telemetry/error), visible on /errors.

const reported = new Set<string>()
let reportsThisLoad = 0

export function reportError(message: string, stack = "") {
    if (typeof window === "undefined" || !message) return
    const key = message.slice(0, 200)
    if (reported.has(key) || reportsThisLoad >= 10) return
    reported.add(key)
    reportsThisLoad++
    try {
        void fetch(`${API_URL}/telemetry/error`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: message.slice(0, 1000), stack: stack.slice(0, 4000), page: window.location.pathname + window.location.search }),
            keepalive: true,
        }).catch(() => undefined)
    } catch {
        // Reporting must never break the page.
    }
}

let handlersInstalled = false
function installErrorHandlers() {
    if (handlersInstalled || typeof window === "undefined") return
    handlersInstalled = true
    window.addEventListener("error", (e) => {
        // Third-party scripts (analytics, Spotify embed) report as "Script error." — skip those.
        if (!e.message || e.message === "Script error.") return
        reportError(e.message, e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`)
    })
    window.addEventListener("unhandledrejection", (e) => {
        const reason = e.reason as { message?: string; stack?: string } | string | undefined
        const message = typeof reason === "string" ? reason : reason?.message
        if (message && !/Couldn’t reach Moodwave/.test(message)) reportError(`Unhandled promise: ${message}`, typeof reason === "object" ? reason?.stack ?? "" : "")
    })
}
installErrorHandlers()

// --- Accessibility: focus rings and reduced motion ------------------------------------------
// One stylesheet for the whole site: a clear lilac ring on whatever the keyboard focuses
// (mouse clicks don't show it). `!important` beats inline `outline: none` / `all: unset`.
// Add data-focus-ring="off" to an element that draws its own focus state.

let a11yInstalled = false
function installA11y() {
    if (a11yInstalled || typeof document === "undefined") return
    a11yInstalled = true
    const style = document.createElement("style")
    style.id = "mw-a11y"
    style.textContent = `
:where(a, button, input, select, textarea, summary, [tabindex], [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="menuitem"]):focus-visible:not([data-focus-ring="off"]) {
  outline: 2px solid ${C.lilac} !important;
  outline-offset: 3px !important;
  border-radius: 6px;
}
:where(input[type="search"], input[type="text"], input:not([type]), textarea, select):focus-visible:not([data-focus-ring="off"]) {
  outline-offset: 1px !important;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; }
}`
    document.head.appendChild(style)

    // Reduced motion: let Framer Motion jump every animation (ours and the site's) to its end.
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    const apply = () => {
        MotionGlobalConfig.skipAnimations = Boolean(query?.matches)
    }
    apply()
    query?.addEventListener?.("change", apply)
}
installA11y()

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal focus: while `open`, move focus into `ref` (its first control), keep Tab inside it,
 * and give focus back to whatever had it (the opening button) when it closes.
 */
export function useDialogFocus(open: boolean, ref: { current: HTMLElement | null }) {
    useEffect(() => {
        if (!open || typeof document === "undefined") return
        const opener = document.activeElement as HTMLElement | null
        const focusFirst = () => {
            const el = ref.current
            if (!el) return
            const first = el.querySelector<HTMLElement>(FOCUSABLE)
            ;(first ?? el).focus({ preventScroll: true })
        }
        const timer = window.setTimeout(focusFirst, 30)
        const onKey = (e: KeyboardEvent) => {
            const el = ref.current
            if (e.key !== "Tab" || !el) return
            const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
            if (!items.length) return
            const first = items[0]
            const last = items[items.length - 1]
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            } else if (!el.contains(document.activeElement)) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener("keydown", onKey)
        return () => {
            window.clearTimeout(timer)
            document.removeEventListener("keydown", onKey)
            if (opener && document.contains(opener)) opener.focus({ preventScroll: true })
        }
    }, [open])
}

/** Error boundary for code components: report the crash, render nothing instead of a broken box. */
export class Safe extends Component<{ name: string; children?: ReactNode }, { failed: boolean }> {
    state = { failed: false }
    static getDerivedStateFromError() {
        return { failed: true }
    }
    componentDidCatch(error: Error) {
        reportError(`[${this.props.name}] ${error.message}`, error.stack ?? "")
    }
    render() {
        return this.state.failed ? null : this.props.children
    }
}

// --- "Warming up" -------------------------------------------------------------------------
// The API sleeps when idle (free hosting). A slow request flips this so the UI can say
// "waking up" instead of looking stuck.

let warming = false
const warmingListeners = new Set<(w: boolean) => void>()
function setWarming(value: boolean) {
    if (warming === value) return
    warming = value
    warmingListeners.forEach((fn) => fn(value))
}

export function useWarming(): boolean {
    const [state, setState] = useState(warming)
    useEffect(() => {
        warmingListeners.add(setState)
        return () => {
            warmingListeners.delete(setState)
        }
    }, [])
    return state
}

let pinged = false
/** Wake the API as early as possible (first page load), without blocking anything. */
export function wakeApi() {
    if (pinged || typeof window === "undefined") return
    pinged = true
    const slow = window.setTimeout(() => setWarming(true), 4000)
    fetch(`${API_URL}/health`)
        .catch(() => undefined)
        .finally(() => {
            window.clearTimeout(slow)
            setWarming(false)
        })
}
