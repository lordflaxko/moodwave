import { useMotionTemplate, useMotionValue, useReducedMotion, useSpring, type MotionValue } from "framer-motion"
import { useEffect, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react"

/**
 * Interaction overrides for canvas layers:
 * - withTilt: 3D tilt that follows the pointer (mood cards).
 * - withTiltGlare: tilt plus a light sheen (showcase playlist card).
 * - withMagnetic: buttons lean toward the pointer, then spring back.
 * All are mouse/trackpad only and switch off for reduced motion.
 */

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

type AnyProps = Record<string, unknown> & {
    style?: Record<string, unknown>
    onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void
    onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void
}

function useTilt(max: number) {
    const rx = useMotionValue(0)
    const ry = useMotionValue(0)
    const gx = useMotionValue(50)
    const gy = useMotionValue(50)
    const spring = { stiffness: 180, damping: 18, mass: 0.6 }
    const rotateX = useSpring(rx, spring)
    const rotateY = useSpring(ry, spring)
    const glareX = useSpring(gx, spring)
    const glareY = useSpring(gy, spring)
    const move = (e: ReactPointerEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width
        const py = (e.clientY - r.top) / r.height
        ry.set((px - 0.5) * 2 * max)
        rx.set(-(py - 0.5) * 2 * max)
        gx.set(px * 100)
        gy.set(py * 100)
    }
    const reset = () => {
        rx.set(0)
        ry.set(0)
        gx.set(50)
        gy.set(50)
    }
    return { rotateX, rotateY, glareX, glareY, move, reset }
}

function tiltOverride(Component: ComponentType<AnyProps>, max: number, glare: boolean): ComponentType<AnyProps> {
    function Tilted(props: AnyProps) {
        const on = useInteractive()
        const t = useTilt(max)
        const sheen = useMotionTemplate`radial-gradient(520px circle at ${t.glareX}% ${t.glareY}%, rgba(255,255,255,0.07), transparent 45%)`
        if (!on) return <Component {...props} />
        const style: Record<string, unknown | MotionValue> = {
            ...props.style,
            rotateX: t.rotateX,
            rotateY: t.rotateY,
            transformPerspective: 900,
        }
        if (glare) style.backgroundImage = sheen
        return (
            <Component
                {...props}
                style={style}
                onPointerMove={(e) => {
                    t.move(e)
                    props.onPointerMove?.(e)
                }}
                onPointerLeave={(e) => {
                    t.reset()
                    props.onPointerLeave?.(e)
                }}
            />
        )
    }
    return Tilted
}

export function withTilt(Component: ComponentType<AnyProps>): ComponentType<AnyProps> {
    return tiltOverride(Component, 6, false)
}

export function withTiltGlare(Component: ComponentType<AnyProps>): ComponentType<AnyProps> {
    return tiltOverride(Component, 5, true)
}

export function withMagnetic(Component: ComponentType<AnyProps>): ComponentType<AnyProps> {
    function Magnetic(props: AnyProps) {
        const on = useInteractive()
        const mx = useMotionValue(0)
        const my = useMotionValue(0)
        const x = useSpring(mx, { stiffness: 220, damping: 15, mass: 0.4 })
        const y = useSpring(my, { stiffness: 220, damping: 15, mass: 0.4 })
        if (!on) return <Component {...props} />
        return (
            <Component
                {...props}
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
    return Magnetic
}
