import react from "@vitejs/plugin-react"
import { Agent } from "node:https"
import * as tls from "node:tls"
import { fileURLToPath, URL } from "node:url"
import { defineConfig, type Plugin } from "vite"

/** Public address of the site: Vercel's production domain when building there. */
const SITE_URL = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://moodwave.vercel.app")).replace(/\/$/, "")
const PUBLIC_PAGES = ["/", "/how-it-works", "/create", "/faq", "/privacy", "/terms"]

/** Absolute URLs in index.html (canonical, og:image) plus sitemap.xml and robots.txt. */
function siteFiles(): Plugin {
    return {
        name: "moodwave-site-files",
        transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", SITE_URL),
        generateBundle() {
            const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n")
            this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` })
            this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nDisallow: /playlist\nDisallow: /library\nDisallow: /admin\nDisallow: /errors\n\nSitemap: ${SITE_URL}/sitemap.xml\n` })
        },
    }
}

/** Dev proxy agent that also trusts the OS certificate store (some machines inspect TLS). */
function devAgent(): Agent | undefined {
    const system = typeof tls.getCACertificates === "function" ? tls.getCACertificates("system") : []
    return system.length ? new Agent({ ca: [...tls.rootCertificates, ...system] }) : undefined
}

// The site's components were written as Framer code components; "framer" resolves to a tiny
// stand-in (property controls are no-ops, nothing renders as a static canvas preview).
export default defineConfig(({ command }) => ({
    plugins: [react(), siteFiles()],
    resolve: {
        alias: { framer: fileURLToPath(new URL("./src/framer/shim.ts", import.meta.url)) },
    },
    build: { chunkSizeWarningLimit: 900 },
    // Dev only: talk to the deployed API through a same-origin proxy (its CORS list holds the
    // real site origins, not localhost). Set VITE_API_URL=/api in .env.development.local.
    server:
        command === "serve"
            ? {
                  proxy: {
                      "/api": {
                          target: "https://moodwave-api.onrender.com",
                          changeOrigin: true,
                          agent: devAgent(),
                          rewrite: (p: string) => p.replace(/^\/api/, ""),
                          configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
                      },
                  },
              }
            : undefined,
}))
