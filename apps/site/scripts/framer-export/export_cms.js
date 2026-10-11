const fs = require("fs")
const out = require("os").tmpdir() + "/moodwave-export/"
const cms = {}
for (const c of await framer.getCollections()) {
    const fields = await c.getFields()
    const items = await c.getItems()
    cms[c.name] = {
        id: c.id,
        fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
        items: items.map((it) => {
            const row = { id: it.id, slug: it.slug, draft: !!it.draft }
            for (const [k, v] of Object.entries(it.fieldData)) row[k] = v?.value?.url ?? v?.value ?? null
            return row
        }),
    }
}
fs.writeFileSync(out + "cms_ids.json", JSON.stringify(cms, null, 1))
console.log(Object.entries(cms).map(([k, v]) => `${k}=${v.items.length} fields=${v.fields.map((f) => f.id + ":" + f.name + ":" + f.type).join(",")}`).join("\n"))
