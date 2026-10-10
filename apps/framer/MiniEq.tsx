import { addPropertyControls, ControlType } from "framer"
import type { CSSProperties } from "react"

import { C } from "./MoodwaveAPI.tsx"

/**
 * Three tiny bars for a track row. They play while the row is hovered: the row's
 * `withTrackHover` override sets `--eq: running`, which reaches here through CSS inheritance.
 */

interface MiniEqProps {
    color: string
    style?: CSSProperties
}

const KEYFRAMES = "@keyframes mw-eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}"

/**
 * @framerIntrinsicWidth 14
 * @framerIntrinsicHeight 12
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function MiniEq(props: MiniEqProps) {
    const { color = C.lilac } = props
    return (
        <div aria-hidden style={{ position: "relative", ...props.style, display: "flex", alignItems: "flex-end", gap: 2, opacity: "calc(0.15 + 0.85 * var(--eq-on, 0))", transition: "opacity 0.3s ease" }}>
            <style>{KEYFRAMES}</style>
            {[0.9, 0.6, 1.1].map((d, i) => (
                <span
                    key={i}
                    style={{
                        width: 3,
                        height: "100%",
                        borderRadius: 2,
                        background: color,
                        transformOrigin: "bottom",
                        transform: "scaleY(0.3)",
                        animation: `mw-eq ${d}s ease-in-out ${i * 0.12}s infinite`,
                        animationPlayState: "var(--eq, paused)",
                    }}
                />
            ))}
        </div>
    )
}

addPropertyControls(MiniEq, {
    color: { type: ControlType.Color, title: "Color", defaultValue: C.lilac },
})
