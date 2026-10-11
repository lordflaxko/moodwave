// Interaction parity: runs the same hover / press / scroll / ticker checks on the Framer site and
// on this one and prints the results side by side.
//
//   node scripts/behaviour.mjs [--local http://127.0.0.1:5173]
import { chromium } from "playwright-core"

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > 0 ? process.argv[i + 1] : fallback
}
const SITES = { live: arg("live", "https://moodwave.framer.ai"), local: arg("local", "http://127.0.0.1:5173") }

const style = (page, sel, props) =>
    page.evaluate(
        ([s, p]) => {
            const el = document.querySelector(s)
            if (!el) return null
            const cs = getComputedStyle(el)
            return Object.fromEntries(p.map((k) => [k, cs[k]]))
        },
        [sel, props],
    )

async function open(page, url) {
    await page.goto(url, { waitUntil: "load" })
    await page.waitForTimeout(3000)
}

async function desktop(page, base) {
    const out = {}
    await open(page, base + "/")
    // Headline text effect: words have landed.
    out.headlineWords = await page.evaluate(() => [...document.querySelectorAll("h1 span[style*='inline-block']")].slice(0, 3).map((s) => getComputedStyle(s).opacity))
    // Hover a floating mood card.
    const card = page.locator('[data-framer-name="Mood Card"]').first()
    await card.hover({ force: true })
    await page.waitForTimeout(900)
    out.moodCardHover = await style(page, '[data-framer-name="Mood Card"]', ["transform", "backgroundColor"])
    // Press the showcase button (tap effect).
    const btn = page.locator('[data-framer-name="Button"]').first()
    await btn.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
    const box = await btn.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(600)
    out.buttonHover = await style(page, '[data-framer-name="Button"]', ["transform", "backgroundColor", "boxShadow"])
    await page.mouse.down()
    await page.waitForTimeout(500)
    out.buttonPress = await style(page, '[data-framer-name="Button"]', ["transform"])
    await page.mouse.up()
    await page.mouse.move(5, 5)
    // Nav condenses after scrolling.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)
    await page.evaluate(() => window.scrollTo(0, 700))
    await page.waitForTimeout(1200)
    out.navScrolled = await style(page, '[data-framer-name="Nav Pill"]', ["transform", "backgroundColor"])
    // A section heading appears when scrolled into view.
    out.headingBefore = await style(page, '[data-framer-name="Heading"]', ["opacity"])
    await page.locator('[data-framer-name="Heading"]').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    out.headingInView = await style(page, '[data-framer-name="Heading"]', ["opacity", "transform"])
    // Ticker speed (px/s) on the record pills row.
    out.tickerSpeed = await page.evaluate(async () => {
        const host = document.querySelector('[data-framer-name="Ticker Records"]')
        const ul = host && [...host.querySelectorAll("ul")].find((u) => getComputedStyle(u).opacity === "1")
        if (!ul) return null
        const x = () => new DOMMatrix(getComputedStyle(ul).transform).m41
        const a = x()
        await new Promise((r) => setTimeout(r, 1000))
        return Math.round((x() - a) * 10) / 10
    })
    // Artist card hover: lifts and wakes the sleeve. (Framer's ticker stays empty in headless
    // Chrome, so this one is only measured where the cards exist.)
    const artist = page.locator('[data-framer-name="Artist Card"]').nth(1)
    if (await artist.count()) {
        await artist.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
        await artist.hover({ force: true, timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(900)
        out.artistHover = await page.evaluate(() => {
            const el = document.querySelectorAll('[data-framer-name="Artist Card"]')[1]
            const cs = getComputedStyle(el)
            return { transform: cs.transform, sleeve: el.style.getPropertyValue("--sleeve"), filter: cs.filter }
        })
    } else out.artistHover = null
    return out
}

async function phone(page, base) {
    const out = {}
    await open(page, base + "/")
    out.menuButton = await page.evaluate(() => !!document.querySelector('button[aria-label*="menu" i]'))
    const btn = page.locator('button[aria-label*="menu" i]').first()
    if (await btn.count()) {
        await btn.click()
        await page.waitForTimeout(900)
        out.menuOpen = await page.evaluate(() => [...document.querySelectorAll("a")].filter((a) => a.offsetParent && /How it works/.test(a.textContent)).length)
    }
    return out
}

const browser = await chromium.launch({ channel: "chrome", headless: true })
const results = {}
for (const [name, base] of Object.entries(SITES)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await ctx.addInitScript(() => sessionStorage.setItem("mw_intro_seen", "1"))
    results[name] = { desktop: await desktop(await ctx.newPage(), base) }
    await ctx.close()
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await pctx.addInitScript(() => sessionStorage.setItem("mw_intro_seen", "1"))
    results[name].phone = await phone(await pctx.newPage(), base)
    await pctx.close()
}
await browser.close()
for (const section of ["desktop", "phone"]) {
    for (const key of Object.keys(results.live[section])) {
        const a = JSON.stringify(results.live[section][key])
        const b = JSON.stringify(results.local[section][key])
        console.log(`${a === b ? "same" : "DIFF"}  ${section}.${key}\n      live:  ${a}\n      local: ${b}`)
    }
}
