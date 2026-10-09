import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"
import { useReducedMotion } from "framer-motion"
import type { CSSProperties } from "react"

/** Film grain over the whole site: SVG noise, jittered in steps so it reads as texture, not motion. */

interface GrainProps {
    opacity: number
    style?: CSSProperties
}

const NOISE = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
)

const KEYFRAMES = `@keyframes mw-grain{0%{transform:translate(0,0)}17%{transform:translate(-4%,-6%)}33%{transform:translate(5%,3%)}50%{transform:translate(-6%,5%)}67%{transform:translate(4%,-4%)}83%{transform:translate(-2%,6%)}100%{transform:translate(0,0)}}`

/**
 * @framerIntrinsicWidth 120
 * @framerIntrinsicHeight 40
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function Grain(props: GrainProps) {
    const { opacity = 0.05 } = props
    const isStatic = useIsStaticRenderer()
    const reduced = useReducedMotion()
    if (isStatic) return <div style={{ ...props.style, borderRadius: 8, background: `url("data:image/svg+xml,${NOISE}")`, opacity: 0.4 }} aria-hidden />
    return (
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 4, pointerEvents: "none", overflow: "hidden", opacity }}>
            <style>{KEYFRAMES}</style>
            <div
                style={{
                    position: "absolute",
                    inset: "-10%",
                    backgroundImage: `url("data:image/svg+xml,${NOISE}")`,
                    backgroundSize: "220px 220px",
                    animation: reduced ? "none" : "mw-grain 0.9s steps(6) infinite",
                }}
            />
        </div>
    )
}

addPropertyControls(Grain, {
    opacity: { type: ControlType.Number, title: "Opacity", min: 0, max: 0.2, step: 0.01, defaultValue: 0.05 },
})
