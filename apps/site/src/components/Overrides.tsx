import { useMotionTemplate, useMotionValue, useReducedMotion, useSpring, type MotionValue } from "framer-motion"
import { forwardRef, useEffect, useState, type ComponentType, type ForwardedRef, type PointerEvent as ReactPointerEvent } from "react"

/**
 * Interaction overrides for page layers. Every override forwards `ref`, which the appear
 * and in-view effects depend on.
 * - withTilt / withTiltGlare: 3D tilt that follows the pointer (glare adds a sheen).
 * - withMagnetic: buttons lean toward the pointer, then spring back.
 * - withSleeve: artist card hover → sets --sleeve (record slides out) and lifts the grayscale.
 * - withTrackHover: track row hover → sets --eq / --eq-on so MiniEq bars play.
 * - withNavCondense: the nav pill tightens once the page scrolls.
 * Pointer effects are mouse/trackpad only; everything respects reduced motion.
 */

type AnyProps = Record<string, unknown> & {
    style?: Record<string, unknown>
    onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerEnter?: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void
}
type Inner = { Component: ComponentType<any>; props: AnyProps; forwarded: ForwardedRef<unknown> }

function useInteractive(): boolean {
    const reduced = useReducedMotion()
    const [fine, setFine] = useState(false)
    useEffect(() => {
        if (!window.matchMedia) return
        const mq = window.matchMedia("(pointer: fine)")
        const update = () => setFine(mq.matches)
        update()
        mq.addEventListener("change", update)
        return () => mq.removeEventListener("change", update)
    }, [])
    return fine && !reduced
}

function Tilt({ Component, props, forwarded, max, glare }: Inner & { max: number; glare: boolean }) {
    const on = useInteractive()
    const rx = useMotionValue(0)
    const ry = useMotionValue(0)
    const gx = useMotionValue(50)
    const gy = useMotionValue(50)
    const spring = { stiffness: 180, damping: 18, mass: 0.6 }
    const rotateX = useSpring(rx, spring)
    const rotateY = useSpring(ry, spring)
    const glareX = useSpring(gx, spring)
    const glareY = useSpring(gy, spring)
    const sheen = useMotionTemplate`radial-gradient(520px circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.07), transparent 45%)`
    if (!on) return <Component {...props} ref={forwarded} />
    const style: Record<string, unknown | MotionValue> = { ...props.style, rotateX, rotateY, transformPerspective: 900 }
    if (glare) style.backgroundImage = sheen
    return (
        <Component
            {...props}
            ref={forwarded}
            style={style}
            onPointerMove={(e: ReactPointerEvent<HTMLElement>) => {
                const r = e.currentTarget.getBoundingClientRect()
                const px = (e.clientX - r.left) / r.width
                const py = (e.clientY - r.top) / r.height
                ry.set((px - 0.5) * 2 * max)
                rx.set(-(py - 0.5) * 2 * max)
                gx.set(px * 100)
                gy.set(py * 100)
                props.onPointerMove?.(e)
            }}
            onPointerLeave={(e: ReactPointerEvent<HTMLElement>) => {
                rx.set(0)
                ry.set(0)
                gx.set(50)
                gy.set(50)
                props.onPointerLeave?.(e)
            }}
        />
    )
}

function Magnetic({ Component, props, forwarded }: Inner) {
    const on = useInteractive()
    const mx = useMotionValue(0)
    const my = useMotionValue(0)
    const x = useSpring(mx, { stiffness: 220, damping: 15, mass: 0.4 })
    const y = useSpring(my, { stiffness: 220, damping: 15, mass: 0.4 })
    if (!on) return <Component {...props} ref={forwarded} />
    return (
        <Component
            {...props}
            ref={forwarded}
            style={{ ...props.style, x, y }}
            onPointerMove={(e: ReactPointerEvent<HTMLElement>) => {
                const r = e.currentTarget.getBoundingClientRect()
                mx.set((e.clientX - (r.left + r.width / 2)) * 0.28)
                my.set((e.clientY - (r.top + r.height / 2)) * 0.36)
                props.onPointerMove?.(e)
            }}
            onPointerLeave={(e: ReactPointerEvent<HTMLElement>) => {
                mx.set(0)
                my.set(0)
                props.onPointerLeave?.(e)
            }}
        />
    )
}

/** Hover sets CSS variables on the layer; children read them through inheritance. */
function HoverVars({ Component, props, forwarded, vars }: Inner & { vars: (hover: boolean) => Record<string, string> }) {
    const [hover, setHover] = useState(false)
    return (
        <Component
            {...props}
            ref={forwarded}
            style={{ ...props.style, ...vars(hover) }}
            onPointerEnter={(e: ReactPointerEvent<HTMLElement>) => {
                setHover(true)
                props.onPointerEnter?.(e)
            }}
            onPointerLeave={(e: ReactPointerEvent<HTMLElement>) => {
                setHover(false)
                props.onPointerLeave?.(e)
            }}
        />
    )
}

function NavCondense({ Component, props, forwarded }: Inner) {
    const reduced = useReducedMotion()
    const [scrolled, setScrolled] = useState(false)
    const scale = useSpring(1, { stiffness: 260, damping: 26 })
    const y = useSpring(0, { stiffness: 260, damping: 26 })
    useEffect(() => {
        const update = () => setScrolled(window.scrollY > 40)
        update()
        window.addEventListener("scroll", update, { passive: true })
        return () => window.removeEventListener("scroll", update)
    }, [])
    useEffect(() => {
        scale.set(scrolled && !reduced ? 0.97 : 1)
        y.set(scrolled && !reduced ? -4 : 0)
    }, [scrolled, reduced, scale, y])
    return (
        <Component
            {...props}
            ref={forwarded}
            style={{
                ...props.style,
                scale,
                y,
                ...(scrolled ? { backgroundColor: "rgba(16, 14, 19, 0.9)", boxShadow: "0 24px 60px -18px rgba(0,0,0,0.95)" } : {}),
                transition: "background-color 0.4s ease, box-shadow 0.4s ease",
            }}
        />
    )
}

export function withTilt(Component: ComponentType<any>): ComponentType {
    return forwardRef((props: AnyProps, ref) => <Tilt Component={Component} props={props} forwarded={ref} max={6} glare={false} />)
}

export function withTiltGlare(Component: ComponentType<any>): ComponentType {
    return forwardRef((props: AnyProps, ref) => <Tilt Component={Component} props={props} forwarded={ref} max={5} glare />)
}

export function withMagnetic(Component: ComponentType<any>): ComponentType {
    return forwardRef((props: AnyProps, ref) => <Magnetic Component={Component} props={props} forwarded={ref} />)
}

export function withSleeve(Component: ComponentType<any>): ComponentType {
    return forwardRef((props: AnyProps, ref) => (
        <HoverVars
            Component={Component}
            props={props}
            forwarded={ref}
            vars={(hover) => ({ "--sleeve": hover ? "1" : "0", filter: hover ? "grayscale(0) saturate(1.08)" : "grayscale(0.35)", transition: "filter 0.5s ease" })}
        />
    ))
}

export function withTrackHover(Component: ComponentType<any>): ComponentType {
    return forwardRef((props: AnyProps, ref) => (
        <HoverVars Component={Component} props={props} forwarded={ref} vars={(hover) => ({ "--eq": hover ? "running" : "paused", "--eq-on": hover ? "1" : "0" })} />
    ))
}

export function withNavCondense(Component: ComponentType<any>): ComponentType {
    return forwardRef((props: AnyProps, ref) => <NavCondense Component={Component} props={props} forwarded={ref} />)
}
