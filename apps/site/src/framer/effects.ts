import type { Transition } from "framer-motion"
import base from "../styles/framer-base.css?raw"

/** Colour tokens (`--token-…`) from the site stylesheet, so motion can animate to real colours. */
const TOKENS: Record<string, string> = {}
for (const m of base.matchAll(/(--token-[0-9a-f-]+):([^;}]+)/g)) TOKENS[m[1]] = m[2].trim()

export function resolveTokens(value: string): string {
    return value.replace(/var\((--token-[0-9a-f-]+)\)/g, (all, name: string) => TOKENS[name] ?? all)
}

const seconds = (s: string | undefined) => (s ? parseFloat(s) : 0)

/**
 * Framer transition strings:
 *   "tween 0.22,1,0.36,1 0.9s 0.3s"      → cubic-bezier tween, duration, delay
 *   "spring-duration 0.4s 0.2 0s"        → duration-based spring with bounce, delay
 *   "spring-physics 500 60 1 0s"         → stiffness, damping, mass, delay
 */
export function parseTransition(spec: string | undefined): Transition {
    if (!spec) return {}
    const [kind, ...rest] = spec.trim().split(/\s+/)
    if (kind === "tween") {
        const ease = rest[0].split(",").map(Number) as [number, number, number, number]
        return { type: "tween", ease, duration: seconds(rest[1]), delay: seconds(rest[2]) }
    }
    if (kind === "spring-duration") {
        return { type: "spring", duration: seconds(rest[0]), bounce: parseFloat(rest[1]), delay: seconds(rest[2]) }
    }
    if (kind === "spring-physics") {
        return { type: "spring", stiffness: +rest[0], damping: +rest[1], mass: +rest[2], delay: seconds(rest[3]) }
    }
    return {}
}

type EffectValues = Record<string, unknown>
const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)))

/** The animatable part of an effect object, in motion's vocabulary. */
export function effectTarget(e: EffectValues): Record<string, number | string> {
    const out: Record<string, number | string> = {}
    if (e.opacity !== undefined) out.opacity = num(e.opacity)
    for (const k of ["x", "y"] as const) if (e[k] !== undefined) out[k] = num(e[k])
    if (e.scale !== undefined) out.scale = num(e.scale)
    for (const k of ["rotate", "rotateX", "rotateY", "skewX", "skewY"] as const) if (e[k] !== undefined) out[k] = num(e[k])
    if (typeof e.backgroundColor === "string") out.backgroundColor = resolveTokens(e.backgroundColor)
    if (typeof e.shadow === "string") out.boxShadow = resolveTokens(e.shadow)
    if (e.blur !== undefined) out.filter = `blur(${num(e.blur)}px)`
    return out
}

/** The resting values for the same keys (what an appear or loop animates back to). */
export function restingTarget(target: Record<string, number | string>, style: Record<string, unknown>): Record<string, number | string> {
    const out: Record<string, number | string> = {}
    for (const k of Object.keys(target)) {
        if (k === "opacity") out.opacity = style.opacity !== undefined ? num(style.opacity) : 1
        else if (k === "scale") out.scale = 1
        else if (k === "backgroundColor") out.backgroundColor = resolveTokens(String(style.backgroundColor ?? "rgba(0,0,0,0)"))
        else if (k === "boxShadow") out.boxShadow = resolveTokens(String(style.boxShadow ?? "0px 0px 0px 0px rgba(0,0,0,0)"))
        else if (k === "filter") out.filter = "blur(0px)"
        else out[k] = 0
    }
    return out
}

/** Only the keys that actually move — keeps hover/tap from fighting other animations. */
export function changedOnly(target: Record<string, number | string>): Record<string, number | string> {
    const rest: Record<string, number | string> = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0 }
    const out: Record<string, number | string> = {}
    for (const [k, v] of Object.entries(target)) if (rest[k] === undefined || rest[k] !== v) out[k] = v
    return out
}
