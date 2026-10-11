import cmsData from "../content/cms.json"
import presetData from "../content/presets.json"

/** A node from the Framer export (see scripts/import_framer.py). */
export interface FNode {
    type: string
    id: string
    name?: string
    attributes?: Record<string, any>
    children?: FNode[]
    component?: string
    $componentDisplayName?: string
    $mediaQuery?: { range: string; name: string }
    $control__icon?: string
    variables?: unknown[]
}

export type Vars = Record<string, unknown>

type Collection = { fields: { id: string; name: string; type: string }[]; items: Record<string, unknown>[] }
export const CMS = cmsData as Record<string, Collection>
export const PRESETS = presetData as Record<string, string>

const VAR_RE = /^var\(--variable-([A-Za-z0-9_-]+)\)$/

/** Resolves `var(--variable-<fieldId>)` against the current CMS item; anything else passes through. */
export function resolveVar(value: unknown, vars: Vars | null): unknown {
    if (typeof value !== "string") return value
    const m = VAR_RE.exec(value)
    if (!m) return value
    return vars ? vars[m[1]] : undefined
}

export interface ListSpec {
    collection: string
    repeatedDescendantId: string
    limit?: string
    offset?: string
    sorting?: { variable: string; direction: "asc" | "desc" }[]
}

export function collectionItems(spec: ListSpec): Vars[] {
    const items = [...(CMS[spec.collection]?.items ?? [])]
    for (const s of [...(spec.sorting ?? [])].reverse()) {
        items.sort((a, b) => {
            const x = a[s.variable] as number | string
            const y = b[s.variable] as number | string
            const c = x < y ? -1 : x > y ? 1 : 0
            return s.direction === "desc" ? -c : c
        })
    }
    const offset = spec.offset ? parseInt(spec.offset, 10) : 0
    const limit = spec.limit ? parseInt(spec.limit, 10) : items.length
    return items.slice(offset, offset + limit)
}

const OLD_ORIGINS = ["https://welcome-pattern-009301.framer.app", "https://moodwave.framer.ai"]

/** CMS links were written against the Framer domains; on this site they stay same-origin. */
export function siteHref(href: string): string {
    for (const o of OLD_ORIGINS) if (href.startsWith(o)) return href.slice(o.length) || "/"
    return href
}

export function isInternal(href: string): boolean {
    return href.startsWith("/") && !href.startsWith("//")
}
