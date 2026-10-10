# Framer code components

The Moodwave site (Home, How it works, Create, Playlist, Library) is built in Framer.
These are the code components it uses, kept here so they're versioned with the API
they talk to. Framer is the source of truth at runtime: after editing a file here,
paste it into the matching code file in the Framer project (or the other way round).

| File | Used on | What it does |
| --- | --- | --- |
| `MoodwaveAPI.tsx` | — | Shared client: `API_URL`, bearer-token session, types, design constants, `Collage` |
| `Composer.tsx` | Home, `/create` | The prompt box; submits to `/create?prompt=…&auto=1`. Paste a Spotify song/playlist link to start from it (`&seed=`); "Blend my taste" toggle when signed in with Spotify (`&taste=1`) |
| `Studio.tsx` | `/create` | Sign-in gate, generation with a live progress overlay (streams `POST /playlists/generate/stream`; falls back to `/generate`), then opens the playlist |
| `PlaylistView.tsx` | `/playlist?id=…` | Tracks with reasons, "make it more…", Play all (queue), drag/Alt+↑↓ reorder, swap, remove with undo, inline rename, 👍/👎 feedback, save to Spotify (custom grid cover), "Update on Spotify" after edits, "Edit cover" (grid of 4 picked songs, one cover, or an uploaded image) |
| `Library.tsx` | `/library` | Grid of your playlists |
| `AccountChip.tsx` | Nav (layout template) | Spotify status, sign in / sign out |
| `MobileMenu.tsx` | Nav, phone only | Burger + full-screen menu with the account status |
| `Grain.tsx` | Layout template | Site-wide film grain |
| `Cursor.tsx` | Layout template | A tiny spinning vinyl that trails the pointer: spins faster as you move, grows with ▶ (↗ for external links) over clickables, soundwave ripple on click |
| `Preloader.tsx` | Home | Vinyl + equaliser intro, once per session |
| `Spotlight.tsx` | Home hero | Light that follows the pointer over the portrait wall |
| `FlowStory.tsx` | Home | Scroll-pinned "How it flows" story (stacked on phones) |
| `EnergyMixer.tsx` | Home | Fader from Calm to Peak: visualiser, BPM, matching records, optional sound |
| `SpinRecord.tsx` | Home | Draggable record; lands on a mood and offers to compose it |
| `RecordSleeve.tsx` | Artist cards | Record that slides out of the card on hover (reads `--sleeve`) |
| `Waveform.tsx` | Home, layout template | Oscilloscope line reacting to the pointer and scroll speed |
| `TrackPlay.tsx` | Showcase track rows | Click a row to play it in a shared Spotify player (iFrame API); the other rows queue after it (⏮ ⏭, auto-advance). Needs each row's "Spotify ID" CMS field |
| `MiniEq.tsx` | (unused) | Hover-only bars, replaced by `TrackPlay` |
| `Overrides.tsx` | Cards, CTAs, nav, rows | `withTilt`, `withTiltGlare`, `withMagnetic`, `withSleeve`, `withTrackHover`, `withNavCondense` |

Every motion piece checks `prefers-reduced-motion`, and pointer-only effects check
`(pointer: fine)`. Sound (`useSound` in `MoodwaveAPI.tsx`) is off until someone turns it on.

Overrides must keep the exact shape `export function withX(Component: ComponentType<any>): ComponentType`
returning `forwardRef(...)` directly — otherwise Framer doesn't recognise them as overrides — and
must forward `ref`, which appear/in-view effects need.

## Pointing the site at the API

`API_URL` in `MoodwaveAPI.tsx` is the only address to change. The API must list the
site's origin in `EXTRA_ORIGINS` (CORS + allowed sign-in return addresses), and its
Spotify redirect URI must be `<API_URL>/auth/callback` (also registered in the Spotify
developer dashboard).

Sessions are bearer tokens in `localStorage`; Spotify sign-in returns to the page you
started on with a one-time code in the URL fragment, which `MoodwaveAPI` swaps for a
token via `POST /auth/exchange`.

## Gotchas

- The **Moods** CMS "Compose Link" field holds absolute URLs on the site's domain
  (`https://<site>/create?prompt=…&auto=1`): Framer drops path-only links that carry a
  query string. Their "New Tab" field is off so they open in the same tab. If the site
  domain changes, update those five links.
