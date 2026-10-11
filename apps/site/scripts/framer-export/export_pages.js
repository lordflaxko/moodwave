// Read-only export of the whole Framer project for the migration: every page (all breakpoints),
// the layout template, CMS collections, colour/text styles. Written to the temp folder as JSON.
const fs = require("fs")
const out = require("os").tmpdir() + "/moodwave-export/"
fs.mkdirSync(out, { recursive: true })

const pages = await framer.getNodesWithType("WebPageNode")
const list = []
for (const p of pages) {
    const path = p.path
    try {
        const s = await framer.agent.serialize({ id: p.id, depth: 80 }, { pagePath: path })
        const json = typeof s === "string" ? s : JSON.stringify(s)
        const file = "page" + (path === "/" ? "_home" : path.replace(/[^a-z0-9]+/gi, "_")) + ".json"
        fs.writeFileSync(out + file, json)
        list.push({ id: p.id, path, file, bytes: json.length })
    } catch (e) {
        list.push({ id: p.id, path, error: e.message.slice(0, 200) })
    }
}

// Layout template (nav, footer, cursor...) — serialize its root through the home page.
try {
    const t = await framer.agent.serialize({ id: "QtLlPOj3b", depth: 80 }, { pagePath: "/" })
    fs.writeFileSync(out + "template.json", typeof t === "string" ? t : JSON.stringify(t))
    list.push({ id: "QtLlPOj3b", path: "(template)", file: "template.json" })
} catch (e) {
    list.push({ id: "QtLlPOj3b", path: "(template)", error: e.message.slice(0, 200) })
}

// CMS collections with field names resolved.
const cms = {}
for (const c of await framer.getCollections()) {
    const fields = await c.getFields()
    const byId = Object.fromEntries(fields.map((f) => [f.id, f.name]))
    const items = await c.getItems()
    cms[c.name] = items.map((it) => {
        const row = { slug: it.slug }
        for (const [k, v] of Object.entries(it.fieldData)) row[byId[k] ?? k] = v?.value?.url ?? v?.value ?? null
        return row
    })
}
fs.writeFileSync(out + "cms.json", JSON.stringify(cms, null, 1))

// Styles.
const colors = (await framer.getColorStyles()).map((s) => ({ id: s.id, name: s.name, light: s.light, dark: s.dark }))
const texts = (await framer.getTextStyles()).map((t) => ({ id: t.id, name: t.name, tag: t.tag, font: t.font, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing, color: t.color, breakpoints: t.breakpoints }))
fs.writeFileSync(out + "styles.json", JSON.stringify({ colors, texts }, null, 1))

console.log(JSON.stringify(list, null, 0))
console.log("cms:", Object.entries(cms).map(([k, v]) => `${k}=${v.length}`).join(" "))
console.log("written to", out)
