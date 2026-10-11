# Moodwave site

The public front end: React 19, TypeScript, Vite, Framer Motion and React Router, deployed on
Vercel from `main` (project root `apps/site`).

## Layout

| Path | What it is |
| --- | --- |
| `src/components/` | The interactive parts: Composer, Studio, PlaylistView, Library, SharedPlaylist, the shared player, cursor, preloader, energy mixer, spin-the-record and the rest. `MoodwaveAPI.tsx` is the API client, session store and design tokens. |
| `src/content/` | The pages, the layout template (nav, waveform, footer, wordmark ticker) and the CMS (moods, artists, showcase tracks), stored as data. |
| `src/framer/` | The renderer that draws that data. It handles stacks, grids, pins, fills, borders, masks, filters, text styles, links, CMS lists and component instances. Effects (appear, scroll-in, hover, press, loop, ticker, the headline word reveal and page transitions) run on Framer Motion. |
| `src/styles/` | Fonts, text presets and the base text rules. |
| `public/` | Self-hosted fonts and images. |

The pages were designed in Framer and exported once. This repo is now the source of truth.

## Editing content

- **Text and links:** edit the page JSON in `src/content/pages/`. Each text block is a
  `RichTextNode` → `TextBlock` → `TextRun` with a `text` attribute.
- **Moods, artists, showcase tracks:** edit `src/content/cms.json`. Images go in `public/media/`.
- **Anything interactive:** edit the component in `src/components/`. Its props come from the
  `$control__…` attributes of its instance in the page JSON.

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + production build (CI runs this too)
```

API calls go to `API_URL` in `MoodwaveAPI.tsx`, which you can override with `VITE_API_URL` in
`.env.development.local`:

- `VITE_API_URL=/api` goes through Vite's proxy to the deployed API, whose CORS list only
  holds the real site.
- `VITE_API_URL=http://127.0.0.1:8000` uses a local API.

`vercel.json` routes every page to the app, caches hashed assets for a year and sets basic
security headers. Production builds also generate `sitemap.xml` and `robots.txt` for the
deployed domain.
