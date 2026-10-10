import { addPropertyControls, ControlType } from "framer"
import type { CSSProperties } from "react"

import { C } from "./MoodwaveAPI.tsx"

/**
 * The record inside an artist card's "sleeve". It sits behind the card and slides up and out
 * (spinning a little) when the card is hovered. The card's `withSleeve` override sets
 * `--sleeve: 1` on hover and the value reaches this component through CSS inheritance.
 */

interface RecordSleeveProps {
    cover?: { src?: string; srcSet?: string; alt?: string }
    accent: string
    style?: CSSProperties
}

/**
 * @framerIntrinsicWidth 170
 * @framerIntrinsicHeight 170
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */
export default function RecordSleeve(props: RecordSleeveProps) {
    const { cover, accent = C.lilac } = props
    return (
        <div aria-hidden style={{ position: "relative", ...props.style, pointerEvents: "none" }}>
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "50%",
                    transform: "translateY(calc(var(--sleeve, 0) * -46%)) rotate(calc(var(--sleeve, 0) * 220deg))",
                    transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)",
                    background: [
                        "conic-gradient(from 20deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 12%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0) 38%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.08) 75%, rgba(255,255,255,0) 88%, rgba(255,255,255,0.10))",
                        "repeating-radial-gradient(circle at center, #121015 0px, #121015 2px, #1a181e 3px, #121015 4px)",
                    ].join(", "),
                    boxShadow: "0 18px 40px -16px rgba(0,0,0,0.95)",
                    display: "grid",
                    placeItems: "center",
                }}
            >
                <div style={{ position: "relative", width: "36%", height: "36%", borderRadius: "50%", overflow: "hidden", background: accent, boxShadow: "0 0 0 4px #0b0a0d" }}>
                    {cover?.src ? <img src={cover.src} srcSet={cover.srcSet} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
                    <span style={{ position: "absolute", left: "50%", top: "50%", width: 6, height: 6, margin: -3, borderRadius: 6, background: C.ink }} />
                </div>
            </div>
        </div>
    )
}

addPropertyControls(RecordSleeve, {
    cover: { type: ControlType.ResponsiveImage, title: "Cover" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: C.lilac },
})
