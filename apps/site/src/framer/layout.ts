import type { CSSProperties } from "react"
import { resolveVar, type Vars } from "./content"

/**
 * Turns Framer layout attributes into the same CSS the published Framer site uses
 * (checked rule-by-rule against the live stylesheet).
 */

export type Parent = { layout: "stack" | "grid" | null; dir: "horizontal" | "vertical" }
export const ROOT_PARENT: Parent = { layout: "stack", dir: "vertical" }

type Style = CSSProperties & Record<string, string | number | undefined>
const FR = /^(\d*\.?\d+)fr$/
const set = (v: unknown) => v !== undefined && v !== null && v !== "null"

const JUSTIFY: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end", "space-between": "space-between", "space-around": "space-around", "space-evenly": "space-evenly" }
const ALIGN: Record<string, string> = { start: "flex-start", center: "center", end: "flex-end" }

type Kind = "frame" | "text" | "component"

function axisSize(value: string | undefined, axis: "width" | "height", parent: Parent, kind: Kind, style: Style) {
    if (!set(value)) return
    const v = String(value)
    const main = parent.layout === "stack" && (axis === "width" ? parent.dir === "horizontal" : parent.dir === "vertical")
    const fr = FR.exec(v)
    if (fr) {
        if (main) {
            style.flex = `${fr[1]} 0 0px`
            style[axis] = "1px"
        } else style[axis] = "100%"
        return
    }
    if (v === "auto") {
        style[axis] = kind === "frame" ? "min-content" : "auto"
        return
    }
    style[axis] = v
}

export function boxStyle(a: Record<string, any>, parent: Parent, kind: Kind): Style {
    const style: Style = {}
    const position = a.position ?? "relative"
    style.position = position
    const pinned = position === "absolute" || position === "fixed"
    if (pinned) {
        for (const side of ["top", "right", "bottom", "left"] as const) if (set(a[side])) style[side] = a[side]
    }
    if (!(pinned && set(a.left) && set(a.right))) axisSize(a.width, "width", parent, kind, style)
    if (!(pinned && set(a.top) && set(a.bottom))) axisSize(a.height, "height", parent, kind, style)
    if (style.flex === undefined) style.flex = "none"
    if (parent.layout === "grid") style.placeSelf = "start"
    for (const k of ["maxWidth", "minWidth", "maxHeight", "minHeight"] as const) if (set(a[k])) style[k] = a[k]
    if (set(a.zIndex)) style.zIndex = Number(a.zIndex)
    if (set(a.pointerEvents)) style.pointerEvents = a.pointerEvents
    if (set(a.cursor)) style.cursor = a.cursor
    if (set(a.opacity)) style.opacity = Number(a.opacity)
    if (a.overflow === "clip") style.overflow = "clip"
    else if (set(a.overflow)) style.overflow = a.overflow
    const filters: string[] = []
    if (set(a.blur)) filters.push(`blur(${a.blur})`)
    if (set(a.contrast)) filters.push(`contrast(${a.contrast})`)
    if (set(a.grayscale)) filters.push(`grayscale(${a.grayscale})`)
    if (filters.length) style.filter = filters.join(" ")
    if (set(a.backgroundBlur)) {
        style.backdropFilter = `blur(${a.backgroundBlur})`
        style.WebkitBackdropFilter = `blur(${a.backgroundBlur})`
    }
    if (Array.isArray(a.masks) && a.masks.length) {
        const mask = a.masks.map((m: { mask: string }) => m.mask).join(", ")
        style.mask = mask
        style.WebkitMask = mask
    }
    return style
}

export function layoutStyle(a: Record<string, any>): Style {
    const style: Style = {}
    if (a.layout === "stack") {
        const horizontal = a.stackDirection === "horizontal"
        style.display = "flex"
        style.flexFlow = `${horizontal ? "row" : "column"}${a.stackWrapEnabled ? " wrap" : ""}`
        style.placeContent = `center ${JUSTIFY[a.stackDistribution] ?? "flex-start"}`
        style.alignItems = ALIGN[a.stackAlignment] ?? "center"
        style.gap = a.gap ?? "0px"
        style.padding = a.padding ?? "0px"
    } else if (a.layout === "grid") {
        style.display = "grid"
        style.gridTemplateColumns = `repeat(${a.gridColumnCount ?? 2}, minmax(${a.gridColumnMinWidth ?? "50px"}, 1fr))`
        if (a.gridRowCount) {
            style.gridTemplateRows = `repeat(${a.gridRowCount}, minmax(0, 1fr))`
            style.gridAutoRows = "minmax(0, 1fr)"
        } else style.gridAutoRows = "min-content"
        style.justifyContent = a.gridAlignment ?? "center"
        style.gap = a.gap ?? "0px"
        style.padding = a.padding ?? "0px"
    } else if (set(a.padding)) style.padding = a.padding
    return style
}

export function childParent(a: Record<string, any>): Parent {
    if (a.layout === "stack") return { layout: "stack", dir: a.stackDirection === "horizontal" ? "horizontal" : "vertical" }
    if (a.layout === "grid") return { layout: "grid", dir: "horizontal" }
    return { layout: null, dir: "vertical" }
}

const IMAGE = /^(\/media\/|https?:\/\/|data:image)/

/** Fill, radius, border and shadow. Returns the image (if the fill is one) separately. */
export function surfaceStyle(a: Record<string, any>, vars: Vars | null): { style: Style; image?: string; border: boolean } {
    const style: Style = {}
    let image: string | undefined
    const fill = resolveVar(a.fill, vars)
    if (typeof fill === "string" && fill) {
        if (IMAGE.test(fill)) image = fill
        else if (/gradient\(/.test(fill)) style.background = fill
        else style.backgroundColor = fill
    }
    if (set(a.radius)) style.borderRadius = a.radius
    if (Array.isArray(a.boxShadows) && a.boxShadows.length) style.boxShadow = a.boxShadows.join(", ")
    let border = false
    if (typeof a.border === "string") {
        const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(a.border)
        if (m) {
            for (const s of ["top", "right", "bottom", "left"]) style[`--border-${s}-width`] = m[1]
            style["--border-style"] = m[2]
            style["--border-color"] = m[3]
            border = true
        }
    } else if (set(a.borderColor)) {
        for (const s of ["Top", "Right", "Bottom", "Left"]) {
            const w = a[`border${s}`]
            style[`--border-${s.toLowerCase()}-width`] = set(w) ? w : "0px"
        }
        style["--border-style"] = a.borderStyle ?? "solid"
        style["--border-color"] = a.borderColor
        border = true
    }
    return { style, image, border }
}

/** Text: the wrapper sizing and wrapping rules Framer applies to RichTextContainers. */
export function textBoxStyle(a: Record<string, any>, parent: Parent): Style {
    const style = boxStyle(a, parent, "text")
    if (a.textTruncation) {
        Object.assign(style, {
            "--text-truncation-display-inline-for-safari-16": "inline",
            "--text-truncation-display-none-for-safari-16": "none",
            "--text-truncation-line-break-for-safari-16": '"\\a "',
            WebkitLineClamp: Number(a.textTruncation),
            WebkitBoxOrient: "vertical",
            display: "-webkit-box",
            overflow: "clip",
            whiteSpace: "pre-line",
            wordBreak: "break-word",
            overflowWrap: "break-word",
        })
    } else if (a.width === "auto") style.whiteSpace = "pre"
    else Object.assign(style, { whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" })
    if (set(a.textWrap)) style["--framer-text-wrap-override"] = a.textWrap
    return style
}

const FONT_FAMILY: Record<string, { variable: string; static: string }> = {
    Fraunces: { variable: '"Fraunces Variable", "Fraunces Variable Placeholder", serif', static: '"Fraunces", "Fraunces Placeholder", serif' },
    "JetBrains Mono": { variable: '"JetBrains Mono Variable", "JetBrains Mono Variable Placeholder", sans-serif', static: '"JetBrains Mono", "JetBrains Mono Placeholder", sans-serif' },
    Inter: { variable: '"Inter Variable", "Inter Variable Placeholder", sans-serif', static: '"Inter", "Inter Placeholder", sans-serif' },
}

/** The `--framer-*` text variables for a text node or run (fonts, size, colour, alignment). */
export function textVars(a: Record<string, any>): Style {
    const v: Style = {}
    const axes = a.fontVariationAxes as Record<string, number> | undefined
    if (a.fontName) {
        const fam = FONT_FAMILY[a.fontName]
        if (axes && fam) {
            v["--framer-font-family"] = fam.variable
            v["--framer-font-variation-axes"] = Object.entries(axes).map(([k, n]) => `"${k}" ${n}`).join(", ")
        } else {
            if (fam && a.fontName !== "Inter") v["--framer-font-family"] = fam.static
            if (a.fontWeight && Number(a.fontWeight) !== 400) v["--framer-font-weight"] = String(a.fontWeight)
        }
    }
    if (a.fontStyle === "italic" || a.italic === true) v["--framer-font-style"] = "italic"
    if (set(a.fontSize)) v["--framer-font-size"] = a.fontSize
    if (set(a.letterSpacing)) v["--framer-letter-spacing"] = a.letterSpacing
    if (set(a.lineHeight)) v["--framer-line-height"] = a.lineHeight
    if (set(a.textColor)) v["--framer-text-color"] = a.textColor
    if (set(a.textAlignment)) v["--framer-text-alignment"] = a.textAlignment
    if (a.openTypeFontFeatures) v["--framer-font-open-type-features"] = Object.entries(a.openTypeFontFeatures).map(([k, s]) => `'${k}' ${s}`).join(", ")
    if (set(a.textDecoration)) v["--framer-text-decoration"] = a.textDecoration
    if (set(a.textDecorationColor)) v["--framer-text-decoration-color"] = a.textDecorationColor
    return v
}
