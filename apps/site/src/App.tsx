import { motion } from "framer-motion"
import { Suspense, use, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { Route, Routes, useLocation } from "react-router-dom"
import metaData from "./content/meta.json"
import templateTree from "./content/template.json"
import type { FNode } from "./framer/content"
import { parseTransition } from "./framer/effects"
import { layoutStyle, surfaceStyle } from "./framer/layout"
import { Node, pickBreakpoint, SlotContext, useBreakpoint } from "./framer/Renderer"

/** Pages by route; each tree loads on demand and is cached. */
const ROUTES: Record<string, string> = {
    "/": "home", "/how-it-works": "how_it_works", "/create": "create", "/playlist": "playlist", "/library": "library",
    "/p": "p", "/admin": "admin", "/errors": "errors", "/faq": "faq", "/privacy": "privacy", "/terms": "terms",
}
const loaders = import.meta.glob<FNode>("./content/pages/*.json", { import: "default" })
const trees = new Map<string, Promise<FNode>>()
function loadTree(key: string): Promise<FNode> {
    let p = trees.get(key)
    if (!p) {
        p = loaders[`./content/pages/${key}.json`]()
        trees.set(key, p)
    }
    return p
}

type Meta = { title?: string | null; description?: string | null; robots?: string | null }
const META = metaData as Record<string, Meta>

function useHead(path: string) {
    useEffect(() => {
        const m = META[path === "/admin" ? "/errors" : path] ?? META["/404"]
        if (m.title) document.title = m.title
        const set = (name: string, content: string | null | undefined) => {
            let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
            if (!el) {
                el = document.createElement("meta")
                el.name = name
                document.head.appendChild(el)
            }
            el.content = content ?? ""
        }
        set("description", m.description)
        set("robots", m.robots ?? "max-image-preview:large")
        const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        if (canonical) canonical.href = window.location.origin + path
    }, [path])
}

/** Framer page effect: on navigation (not the first load) the page eases in. */
function PageBody({ tree, animate }: { tree: FNode; animate: boolean }) {
    const bp = useBreakpoint()
    const root = pickBreakpoint(tree, bp)
    const enter = root.attributes?.pageEffects?.all?.enter
    const style: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }
    const children = (root.children ?? []).map((c) => <Node key={c.id} node={c} parent={{ layout: "stack", dir: "vertical" }} />)
    if (!enter || !animate) return <div style={style}>{children}</div>
    return (
        <motion.div
            style={style}
            initial={{ opacity: enter.opacity, x: parseFloat(enter.x), y: parseFloat(enter.y), scale: enter.scale }}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1, transitionEnd: { transform: "none" } }}
            transition={parseTransition(enter.transition)}
        >
            {children}
        </motion.div>
    )
}

function PageRoute({ name, first }: { name: string; first: boolean }) {
    const tree = use(loadTree(name))
    return <PageBody tree={tree} animate={!first} />
}

/** The layout template (nav, waveform, footer, ticker, grain, cursor) around the page. */
function Template({ children }: { children: ReactNode }) {
    const bp = useBreakpoint()
    const root = pickBreakpoint(templateTree as FNode, bp)
    const a = root.attributes ?? {}
    const style: CSSProperties = { ...layoutStyle(a), ...surfaceStyle(a, null).style, overflow: "clip", position: "relative", width: "100%", height: "min-content", minHeight: "100vh" }
    return (
        <div data-layout-template="true" style={style}>
            <SlotContext.Provider value={children}>
                {(root.children ?? []).map((c) => (
                    <Node key={c.id} node={c} parent={{ layout: "stack", dir: "vertical" }} />
                ))}
            </SlotContext.Provider>
        </div>
    )
}

export default function App() {
    const location = useLocation()
    const first = useRef(true)
    const path = ROUTES[location.pathname] ? location.pathname : "/404"
    useHead(path)
    useLayoutEffect(() => {
        if (!first.current && !location.hash) window.scrollTo(0, 0)
    }, [location.pathname, location.hash])
    useEffect(() => {
        first.current = false
        // Warm the other pages once the first one is up.
        const id = setTimeout(() => Object.values(ROUTES).forEach(loadTree), 1500)
        return () => clearTimeout(id)
    }, [])
    return (
        <Template>
            <Suspense fallback={null}>
                <Routes>
                    {Object.entries(ROUTES).map(([p, name]) => (
                        <Route key={p} path={p} element={<PageRoute key={p} name={name} first={first.current} />} />
                    ))}
                    <Route path="*" element={<PageRoute name="404" first={first.current} />} />
                </Routes>
            </Suspense>
        </Template>
    )
}
