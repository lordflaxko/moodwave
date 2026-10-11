import { motion, useAnimationFrame, useMotionValue, useReducedMotion, type MotionProps } from "framer-motion"
import {
    Children,
    createContext,
    createElement,
    Fragment,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ComponentType,
    type CSSProperties,
    type MouseEvent,
    type ReactNode,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import iconData from "../content/icons.json"
import { collectionItems, isInternal, PRESETS, resolveVar, type FNode, type ListSpec, type Vars } from "./content"
import { changedOnly, effectTarget, parseTransition, resolveTokens, restingTarget } from "./effects"
import { boxStyle, childParent, layoutStyle, surfaceStyle, textBoxStyle, textVars, type Parent } from "./layout"
import { COMPONENTS, OVERRIDES } from "./registry"
import { getControls } from "./shim"

const ICONS = iconData as Record<string, string>
type Style = CSSProperties & Record<string, unknown>

// ------------------------------------------------------------------ breakpoints

const BREAKPOINTS = [
    { name: "Desktop", query: "(min-width: 1200px)" },
    { name: "Tablet", query: "(min-width: 810px) and (max-width: 1199.98px)" },
    { name: "Phone", query: "(max-width: 809.98px)" },
] as const
export type Breakpoint = (typeof BREAKPOINTS)[number]["name"]

function currentBreakpoint(): Breakpoint {
    if (typeof window === "undefined") return "Desktop"
    return BREAKPOINTS.find((b) => window.matchMedia(b.query).matches)?.name ?? "Desktop"
}

function subscribe(cb: () => void) {
    const lists = BREAKPOINTS.map((b) => window.matchMedia(b.query))
    lists.forEach((l) => l.addEventListener("change", cb))
    return () => lists.forEach((l) => l.removeEventListener("change", cb))
}

export function useBreakpoint(): Breakpoint {
    return useSyncExternalStore(subscribe, currentBreakpoint, () => "Desktop")
}

/** The page/template root for the active breakpoint (each breakpoint is its own full tree). */
export function pickBreakpoint(root: FNode, bp: Breakpoint): FNode {
    const kids = root.children ?? []
    return kids.find((c) => c.$mediaQuery?.name === bp) ?? kids.find((c) => c.$mediaQuery?.name === "Desktop") ?? kids[0]
}

// ------------------------------------------------------------------ contexts

const VarsContext = createContext<Vars | null>(null)
export const SlotContext = createContext<ReactNode>(null)

// ------------------------------------------------------------------ motion elements (+ overrides)

const elementCache = new Map<string, ComponentType<any>>()
function element(tag: string, override?: string): ComponentType<any> {
    const key = `${tag}|${override ?? ""}`
    let el = elementCache.get(key)
    if (!el) {
        const base = (motion as unknown as Record<string, ComponentType<any>>)[tag] ?? motion.div
        const hoc = override ? OVERRIDES[override] : undefined
        el = hoc ? hoc(base) : base
        elementCache.set(key, el)
    }
    return el
}

function overrideName(a: Record<string, any>): string | undefined {
    const o = a.codeOverride as string | undefined
    return o ? o.split(":").pop() : undefined
}

// ------------------------------------------------------------------ effects

/** Framer appear / hover / tap / loop effects as motion props. */
function useEffects(a: Record<string, any>, style: Style): Partial<MotionProps> {
    const appear = a.appearEffect
    const loop = a.loopEffect
    // A loop starts once a mount-time appear has finished (both drive `animate`).
    const [looping, setLooping] = useState(!appear || appear.trigger === "onInView")
    const reduced = useReducedMotion()
    const props: Partial<MotionProps> & Record<string, unknown> = {}

    let settled: Record<string, number | string> = {}
    if (appear && !reduced) {
        const from = changedOnly(effectTarget(appear.enter ?? {}))
        settled = restingTarget(from, style)
        const to = { ...settled, transition: parseTransition(appear.enter?.transition) }
        props.initial = from
        if (appear.trigger === "onInView") {
            props.whileInView = to
            props.viewport = { amount: appear.threshold ?? 0.3, once: !appear.replay }
        } else {
            props.animate = to
            props.onAnimationComplete = () => setLooping(true)
        }
    }
    if (loop && looping && !reduced) {
        const target = changedOnly(effectTarget(loop))
        const rest = restingTarget(target, style)
        const t = parseTransition(loop.transition)
        const frames: Record<string, unknown> = {}
        for (const k of Object.keys(target)) frames[k] = [rest[k], target[k]]
        // Keep the appear's end state (e.g. opacity 1): values dropped from `animate` would
        // otherwise fall back to `initial`.
        const repeat = { ...t, repeat: Infinity, repeatType: loop.repeatType ?? "mirror", repeatDelay: parseFloat(loop.repeatDelay ?? "0") }
        const hold = Object.fromEntries(Object.keys(settled).filter((k) => !(k in frames)).map((k) => [k, { duration: 0 }]))
        props.animate = { ...settled, ...frames, transition: { ...repeat, ...hold } }
    }
    if (a.hoverEffect) {
        const t = parseTransition(a.hoverEffect.transition)
        props.whileHover = { ...changedOnly(effectTarget(a.hoverEffect)), transition: t }
        props.transition = t
    }
    if (a.tapEffect) props.whileTap = { ...changedOnly(effectTarget(a.tapEffect)), transition: parseTransition(a.tapEffect.transition) }
    return props
}

/** Hidden at this breakpoint (Framer stores the flag as a string). */
function hidden(a: Record<string, any>) {
    return a.visible === false || a.visible === "false"
}

function hasEffects(a: Record<string, any>) {
    return !!(a.appearEffect || a.loopEffect || a.hoverEffect || a.tapEffect)
}

// ------------------------------------------------------------------ links

function useLinkProps(link: { href?: string; openInNewTab?: unknown } | undefined, vars: Vars | null) {
    const navigate = useNavigate()
    if (!link) return null
    const href = resolveVar(link.href, vars)
    if (typeof href !== "string" || !href) return null
    const newTab = resolveVar(link.openInNewTab, vars) === true
    const props: Record<string, unknown> = { href }
    if (newTab) {
        props.target = "_blank"
        props.rel = "noopener"
    } else if (isInternal(href)) {
        props.onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            navigate(href)
        }
    }
    return props
}

// ------------------------------------------------------------------ nodes

export function Node({ node, parent }: { node: FNode; parent: Parent }) {
    switch (node.type) {
        case "FrameNode":
            return <Frame node={node} parent={parent} />
        case "RichTextNode":
            return <RichText node={node} parent={parent} />
        case "ComponentInstanceNode":
            return <Instance node={node} parent={parent} />
        case "IconNode":
            return <Icon node={node} parent={parent} />
        case "PlaceholderNode":
            return <>{useContext(SlotContext)}</>
        default:
            return null
    }
}

function renderChildren(node: FNode, a: Record<string, any>, me: Parent): ReactNode {
    const list = a.collectionList as ListSpec | undefined
    return (node.children ?? []).map((child) => {
        if (list && child.id.endsWith(list.repeatedDescendantId)) {
            return collectionItems(list).map((item) => (
                <VarsContext.Provider key={`${child.id}:${String(item.id)}`} value={item}>
                    <Node node={child} parent={me} />
                </VarsContext.Provider>
            ))
        }
        return <Node key={child.id} node={child} parent={me} />
    })
}

function Frame({ node, parent }: { node: FNode; parent: Parent }) {
    const vars = useContext(VarsContext)
    const a = node.attributes ?? {}
    const surface = surfaceStyle(a, vars)
    const style: Style = { ...boxStyle(a, parent, "frame"), ...layoutStyle(a), ...surface.style }
    if (a.hoverEffect) {
        if (typeof style.backgroundColor === "string") style.backgroundColor = resolveTokens(style.backgroundColor)
        if (typeof style.boxShadow === "string") style.boxShadow = resolveTokens(style.boxShadow)
    }
    if (hasEffects(a) || a.codeOverride) style.willChange = "transform"
    const effects = useEffects(a, style)
    const linkProps = useLinkProps(a.link, vars)
    if (hidden(a)) return null

    const me = childParent(a)
    const tag = linkProps ? "a" : (a.htmlTag ?? "div")
    const El = element(tag, overrideName(a))
    const extra: Record<string, unknown> = {}
    if (surface.border) extra["data-border"] = "true"
    if (a.hideScrollbars) extra["data-hide-scrollbars"] = "true"
    if (node.name) extra["data-framer-name"] = node.name
    if (linkProps) style.textDecoration = "none"

    const image = surface.image ? (
        <div data-framer-background-image-wrapper="true" style={{ position: "absolute", borderRadius: "inherit", inset: 0 }}>
            <img src={surface.image} alt="" decoding="async" loading="lazy" style={{ display: "block", width: "100%", height: "100%", borderRadius: "inherit", objectPosition: "center", objectFit: "cover" }} />
        </div>
    ) : null

    if (a.tickerEffect) {
        return (
            <El {...extra} {...effects} {...linkProps} style={{ ...style, overflowX: "clip", display: "flex" }}>
                {image}
                <Ticker spec={a.tickerEffect} gap={a.gap} vertical={a.stackDirection === "vertical"} alignItems={style.alignItems as string}>
                    {renderChildren(node, a, me)}
                </Ticker>
            </El>
        )
    }
    return (
        <El {...extra} {...effects} {...linkProps} style={style}>
            {image}
            {renderChildren(node, a, me)}
        </El>
    )
}

// ------------------------------------------------------------------ ticker

/** Framer's ticker effect: the children scroll forever, copied as often as needed to fill the row. */
function Ticker({ spec, gap, vertical, alignItems, children }: { spec: { velocity: number; hoverModifier?: number; directionModifier?: string }; gap?: string; vertical: boolean; alignItems?: string; children: ReactNode }) {
    const items = Children.toArray(children).flat()
    const ul = useRef<HTMLUListElement>(null)
    const [span, setSpan] = useState(0)
    const [view, setView] = useState(0)
    const offset = useMotionValue(0)
    const pos = useRef(0)
    const hover = useRef(false)
    const reduced = useReducedMotion()
    const gapPx = parseFloat(gap ?? "0") || 0

    useLayoutEffect(() => {
        const el = ul.current
        if (!el) return
        const measure = () => {
            const lis = el.children
            if (!lis.length) return
            const first = lis[0] as HTMLElement
            const clone = lis[items.length] as HTMLElement | undefined
            const size = clone ? (vertical ? clone.offsetTop - first.offsetTop : clone.offsetLeft - first.offsetLeft) : 0
            setSpan(size)
            setView(vertical ? el.parentElement!.clientHeight : el.parentElement!.clientWidth)
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el.parentElement!)
        for (const li of Array.from(el.children).slice(0, items.length)) ro.observe(li)
        return () => ro.disconnect()
    }, [items.length, vertical])

    useAnimationFrame((_, delta) => {
        if (!span || reduced) return
        const factor = hover.current ? (spec.hoverModifier ?? 100) / 100 : 1
        pos.current = (pos.current + (delta * spec.velocity * factor) / 1000) % span
        offset.set(spec.directionModifier === "reverse" ? pos.current - span : -pos.current)
    })

    const copies = span ? Math.max(1, Math.ceil(view / span)) : 1
    const li: CSSProperties = { flexGrow: 0, flexShrink: 0, position: "relative", height: "fit-content", width: "fit-content" }
    return (
        <motion.ul
            ref={ul}
            onPointerEnter={() => (hover.current = true)}
            onPointerLeave={() => (hover.current = false)}
            style={{
                display: "flex", position: "relative", listStyleType: "none", padding: 0, margin: 0, justifyContent: "flex-start",
                flexDirection: vertical ? "column" : "row", gap: gapPx, alignItems: alignItems ?? "center",
                width: "100%", height: "100%", maxHeight: "100%", maxWidth: "100%", opacity: span ? 1 : 0,
                [vertical ? "y" : "x"]: offset,
            }}
        >
            {items.map((child, i) => <li key={`o${i}`} className="ticker-item" style={li}>{child}</li>)}
            {Array.from({ length: copies }, (_, c) =>
                items.map((child, i) => <li key={`c${c}-${i}`} className="ticker-item" aria-hidden="true" style={li}>{child}</li>),
            )}
        </motion.ul>
    )
}

// ------------------------------------------------------------------ text

type Run = { text: string; attrs: Record<string, any> }

function blockRuns(block: FNode): (Run | "br")[] {
    const out: (Run | "br")[] = []
    for (const c of block.children ?? []) {
        if (c.type === "TextLineBreak") out.push("br")
        else if (c.type === "TextRun") {
            const { text = "", ...attrs } = c.attributes ?? {}
            String(text).split("\n").forEach((part, i) => {
                if (i > 0) out.push("br")
                if (part) out.push({ text: part, attrs })
            })
        }
    }
    return out
}

function RichText({ node, parent }: { node: FNode; parent: Parent }) {
    const vars = useContext(VarsContext)
    const location = useLocation()
    const a = node.attributes ?? {}
    const style: Style = textBoxStyle(a, parent)
    if (hasEffects(a) || a.textEffect) style.willChange = "transform"
    const effects = useEffects(a, style)
    const linkProps = useLinkProps(a.link, vars)
    const reduced = useReducedMotion()
    if (hidden(a)) return null

    const preset = a.textStylePreset ? PRESETS[a.textStylePreset] : undefined
    const linkPreset = a.linkStylePreset ? PRESETS[a.linkStylePreset] : undefined
    const vars_ = textVars(a)
    // With a preset, only the per-node overrides are inline (as on the live site). The export
    // reports "start" both when it was chosen and when the preset decides, so "start" defers
    // to the preset (only Display XL differs: it centres).
    const blockStyle: Style = preset ? pick(vars_, ["--framer-text-alignment", "--framer-text-color"]) : vars_
    if (preset && blockStyle["--framer-text-alignment"] === "start") delete blockStyle["--framer-text-alignment"]

    let blocks: { tag: string; runs: (Run | "br")[] }[]
    if (a.text !== undefined) {
        const value = resolveVar(a.text, vars)
        const tag = (node.children?.[0]?.attributes?.tag as string) ?? "p"
        blocks = [{ tag, runs: value === undefined || value === null ? [] : [{ text: String(value), attrs: {} }] }]
    } else blocks = (node.children ?? []).filter((b) => b.type === "TextBlock").map((b) => ({ tag: b.attributes?.tag ?? "p", runs: blockRuns(b) }))

    const fx = a.textEffect && !reduced ? a.textEffect : null
    let token = 0
    const renderRun = (run: Run, key: string, base: Style): ReactNode => {
        let content: ReactNode = run.text
        if (fx) {
            const parts = run.text.split(/(\s+)/)
            content = parts.map((p, i) => (/^\s+$/.test(p) || !p ? p : <WordToken key={i} fx={fx} index={token++}>{p}</WordToken>))
        }
        // Only what differs from the block needs its own span.
        const runVars = Object.fromEntries(Object.entries(textVars(run.attrs)).filter(([k, v]) => base[k] !== v))
        return Object.keys(runVars).length ? <span key={key} className="framer-text" style={runVars}>{content}</span> : <Fragment key={key}>{content}</Fragment>
    }

    const El = element("div", overrideName(a))
    return (
        <El data-framer-component-type="RichTextContainer" {...effects} style={{ ...style, transform: "none" }}>
            {blocks.map((b, bi) => {
                // As on the live site, a block without a preset carries its first run's font and colour.
                const first = b.runs.find((r): r is Run => r !== "br")
                const base: Style = { ...blockStyle, ...(first && !preset ? textVars(first.attrs) : {}) }
                let inner: ReactNode = b.runs.map((r, ri) => (r === "br" ? <br key={ri} className="framer-text" /> : renderRun(r, String(ri), base)))
                if (linkProps) {
                    const current = typeof linkProps.href === "string" && linkProps.href === location.pathname
                    inner = (
                        <a className={`framer-text${linkPreset ? ` framer-styles-preset-${linkPreset}` : ""}`} {...linkProps} {...(current ? { "data-framer-page-link-current": "true" } : {})}>
                            {inner}
                        </a>
                    )
                }
                return createElement(b.tag, { key: bi, className: `framer-text${preset ? ` framer-styles-preset-${preset}` : ""}`, dir: "auto", style: base }, inner)
            })}
        </El>
    )
}

function pick(o: Style, keys: string[]): Style {
    const out: Style = {}
    for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
    return out
}

function WordToken({ fx, index, children }: { fx: Record<string, any>; index: number; children: ReactNode }) {
    const s = fx.style ?? {}
    const t = parseTransition(s.transition)
    const step = typeof t.delay === "number" ? t.delay : 0
    const from = { opacity: s.opacity ?? 0, x: parseFloat(s.x ?? "0"), y: parseFloat(s.y ?? "0"), scale: s.scale ?? 1, rotate: parseFloat(s.rotate ?? "0"), skewX: parseFloat(s.skewX ?? "0"), skewY: parseFloat(s.skewY ?? "0"), filter: `blur(${parseFloat(s.blur ?? "0")}px)` }
    const to = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, skewX: 0, skewY: 0, filter: "blur(0px)" }
    const transition = { ...t, delay: parseFloat(fx.delay ?? "0") + index * step }
    const trigger = fx.trigger === "onInView" ? { whileInView: to, viewport: { once: true } } : { animate: to }
    return (
        <motion.span style={{ display: "inline-block" }} initial={from} {...trigger} transition={transition}>
            {children}
        </motion.span>
    )
}

// ------------------------------------------------------------------ code components

function controlValue(raw: unknown, control: Record<string, any> | undefined, vars: Vars | null): unknown {
    let v = resolveVar(raw, vars)
    if (typeof v === "string") v = resolveTokens(v)
    const type = control?.type
    if (type === "number" && typeof v === "string") return parseFloat(v)
    if (type === "boolean" && typeof v === "string") return v === "true"
    if (type === "responsiveimage" && typeof v === "string") return { src: v, alt: "" }
    if (type === "array") {
        let arr: unknown[] = []
        if (Array.isArray(v)) arr = v
        else if (typeof v === "string") {
            try {
                arr = JSON.parse(v) as unknown[]
            } catch {
                arr = []
            }
        }
        const itemControls = control?.control?.controls as Record<string, { title?: string }> | undefined
        return arr.map((x) => {
            if (x && typeof x === "object" && "value" in x && "type" in x) return (x as { value: unknown }).value
            if (x && typeof x === "object" && itemControls) return objectByKey(x as Record<string, unknown>, itemControls)
            return x
        })
    }
    return v
}

/** Framer stores object fields under a camel-cased title ("Cover URL" → coverURL); map back to the keys. */
function objectByKey(x: Record<string, unknown>, controls: Record<string, { title?: string }>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...x }
    for (const [key, c] of Object.entries(controls)) {
        if (out[key] !== undefined || !c.title) continue
        const words = c.title.split(/\s+/)
        const stored = words[0].toLowerCase() + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("")
        if (x[stored] !== undefined) out[key] = x[stored]
    }
    return out
}

function Instance({ node, parent }: { node: FNode; parent: Parent }) {
    const vars = useContext(VarsContext)
    const a = node.attributes ?? {}
    const style: Style = boxStyle(a, parent, "component")
    if (hasEffects(a)) style.willChange = "transform"
    const effects = useEffects(a, style)
    if (hidden(a)) return null
    const name = node.$componentDisplayName ?? ""
    const Component = COMPONENTS[name]
    if (!Component) return null
    const controls = getControls(Component) as Record<string, Record<string, any>>
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(a)) {
        if (!k.startsWith("$control__")) continue
        const key = k.slice("$control__".length)
        props[key] = controlValue(v, controls[key], vars)
    }
    const inner: CSSProperties = {}
    if (a.width !== "auto") inner.width = "100%"
    if (a.height !== "auto") inner.height = "100%"
    const El = element("div")
    return (
        <El data-component={name} {...effects} style={style}>
            <Component {...props} style={inner} />
        </El>
    )
}

// ------------------------------------------------------------------ icons

function Icon({ node, parent }: { node: FNode; parent: Parent }) {
    const a = node.attributes ?? {}
    const svg = ICONS[node.$control__icon ?? ""]
    if (!svg || hidden(a)) return null
    const style: Style = {
        ...boxStyle(a, parent, "frame"),
        display: "block",
        aspectRatio: 1,
        "--21h8s6": a.$control__color,
        "--pgex8v": a.$control__width,
        "--1m6trwb": a.$control__alpha,
    }
    return <svg role="presentation" viewBox="0 0 24 24" style={style as CSSProperties} dangerouslySetInnerHTML={{ __html: svg }} />
}

