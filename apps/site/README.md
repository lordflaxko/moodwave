# Moodwave site

The public front end: Vite + React 19 + TypeScript + Framer Motion + React Router, hosted on Vercel.
It replaces the Framer-hosted site with the same pages, layout, animations and components, and
without the "Made in Framer" badge.

## How it's built

- **`src/components/`**: the interactive parts (Composer, Studio, PlaylistView, Library, Cursor,
  Preloader, …). These are the same React components the Framer site used. `"framer"` resolves
  to a small stand-in (`src/framer/shim.ts`), because they only used its property-control helpers.
- **`src/content/`**: every page, the layout template (nav, footer, waveform, wordmark ticker)
  and the CMS (moods, artists, showcase tracks), exported from the Framer project as data.
- **`src/framer/`**: the renderer that turns that data into DOM. It covers stacks, grids, pins,
  fills, borders, masks, filters, text presets, links, CMS lists and code components. It also
  maps Framer's effects to Framer Motion: appear, scroll-in, hover, press, loop, ticker, the
  word-by-word headline reveal and page transitions. It produces the same CSS the published
  Framer site did, checked rule by rule.
- **`src/styles/`**: fonts (self-hosted copies of the same faces), text presets and the generic
  text rules.
- **`public/media`, `public/fonts`**: local copies of every image and font, so nothing loads
  from Framer's CDN.

## Develop

```bash
npm install
npm run dev
```

`.env.development.local` with `VITE_API_URL=/api` sends API calls through Vite's proxy to the
deployed API. Its CORS list only holds the real site addresses.

## Checks

- `npm run build`: typecheck and production build (also runs in CI).
- `npm run parity`: compares every page with the Framer site at 1280 / 810 / 390 px. It reports
  any layer that moved or resized and saves side-by-side screenshots to `parity/shots/`.
- `npm run behaviour`: runs the same hover, press, scroll, nav and menu checks on both sites.

Both use the Chrome already installed on the machine (`playwright-core`, no browser download).

## Re-importing from Framer

`scripts/framer-export/*.js` run through the Framer CLI and are read-only. They write the
export to the temp folder. `npm run import-framer -- <export dir>` then regenerates
`src/content`, `src/styles`, `public/media` and `public/fonts`.
