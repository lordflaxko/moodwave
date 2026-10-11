// Side-by-side check of this site against the published Framer site.
// For each page and width it measures every named layer and text block on both, reports any
// that moved or resized, and saves full-page screenshots (parity/shots) for a visual pass.
//
//   node scripts/parity.mjs [--local http://127.0.0.1:5173] [--pages /,/faq] [--widths 1280,810,390]
import { mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright-core"

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 ? process.argv[i + 1] : fallback
}
const LIVE = arg("live", "https://moodwave.framer.ai")
const LOCAL = arg("local", "http://127.0.0.1:5173")
const PAGES = arg("pages", "/,/how-it-works,/create,/playlist,/library,/p,/errors,/faq,/privacy,/terms,/404").split(",")
const WIDTHS = arg("widths", "1280,810,390").split(",").map(Number)
const TOLERANCE = Number(arg("tolerance", "2"))
const SHOTS = new URL("../parity/shots/", import.meta.url)
mkdirSync(SHOTS, { recursive: true })

function measure() {
    const pos = (el) => {
        let x = 0
        let y = 0
        for (let e = el; e; e = e.offsetParent) {
            x += e.offsetLeft
            y += e.offsetTop
        }
        return [x, y]
    }
    const out = {}
    const seen = {}
    const els = document.querySelectorAll('[data-framer-name], [data-framer-component-type="RichTextContainer"]')
    for (const el of els) {
        if (el.closest("#__framer-badge-container")) continue
        if (el.closest('li.ticker-item[aria-hidden="true"]')) continue // ticker copies: count differs by design
        if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue
        const name = el.getAttribute("data-framer-name") ?? "text:" + el.textContent.trim().slice(0, 32)
        seen[name] = (seen[name] ?? 0) + 1
        const [x, y] = pos(el)
        out[`${name}#${seen[name]}`] = [Math.round(x), Math.round(y), el.offsetWidth, el.offsetHeight]
    }
    return { height: document.documentElement.scrollHeight, boxes: out }
}

async function snapshot(page, url, file) {
    await page.goto(url, { waitUntil: "load", timeout: 60000 }).catch(() => {})
    let data
    for (let attempt = 0; attempt < 5 && !data; attempt++) {
        // Framer swaps in its hydrated page after load; wait for things to settle.
        await page.waitForTimeout(2500)
        data = await page.evaluate(async (fn) => {
            await document.fonts.ready
            return new Function(`return (${fn})()`)()
        }, measure.toString()).catch(() => undefined)
    }
    await page
        .screenshot({ path: new URL(file, SHOTS).pathname.replace(/^\/([A-Z]:)/, "$1"), fullPage: true, animations: "disabled", timeout: 60000 })
        .catch((e) => console.log(`   (no screenshot for ${url}: ${e.message.split("\n")[0]})`))
    return data
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const report = []
for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    await context.addInitScript(() => sessionStorage.setItem("mw_intro_seen", "1"))
    const page = await context.newPage()
    for (const path of PAGES) {
        const slug = (path === "/" ? "home" : path.slice(1).replace(/\W+/g, "_")) + "-" + width
        const live = await snapshot(page, LIVE + path, `${slug}-live.png`)
        const local = await snapshot(page, LOCAL + path, `${slug}-local.png`)
        const diffs = []
        if (Math.abs(live.height - local.height) > TOLERANCE) diffs.push(`page height ${live.height} → ${local.height}`)
        for (const [k, a] of Object.entries(live.boxes)) {
            const b = local.boxes[k]
            if (!b) {
                diffs.push(`missing: ${k}`)
                continue
            }
            if (a.some((v, i) => Math.abs(v - b[i]) > TOLERANCE)) diffs.push(`${k}: [${a}] → [${b}]`)
        }
        for (const k of Object.keys(local.boxes)) if (!live.boxes[k]) diffs.push(`extra: ${k}`)
        report.push({ path, width, diffs })
        console.log(`${path} @${width}: ${diffs.length ? diffs.length + " differences" : "match"}`)
        for (const d of diffs.slice(0, 25)) console.log("   " + d)
    }
    await context.close()
}
await browser.close()
writeFileSync(new URL("../parity/report.json", import.meta.url), JSON.stringify(report, null, 1))
