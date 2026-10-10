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
| `PlaylistView.tsx` | `/playlist?id=…` | Tracks with reasons, "make it more…", Play all (queue), drag/Alt+↑↓ reorder, swap, remove with undo, inline rename, 👍/👎 feedback, save to Spotify (custom grid cover), "Update on Spotify" after edits, "Edit cover" (grid of 4 picked songs, one cover, or an uploaded image), Share (public link with copy / turn off) |
| `SharedPlaylist.tsx` | `/p?s=…` | Read-only shared playlist from a share link: cover, mood, playable tracks, "Make your own". No sign-in |
| `RecentPrompts.tsx` | `/create` (under the composer) | Your last distinct prompts; tap to put one back in the prompt box, × hides it on this device |
| `ContextMoods.tsx` | Home and `/create` (under the composer) | "For right now": prompt ideas for the time and day; opt-in "Use my weather" (Open-Meteo + BigDataCloud, nothing stored) |
| `Library.tsx` | `/library` | Every playlist: search (titles, prompts, moods, artists, genres), energy + mood filters, sort, and a ⋯ menu to rename, duplicate or delete |
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

### Share links

`POST /playlists/{id}/share` returns a `share_slug`. The link people paste is
`https://moodwave-api.onrender.com/s/<slug>`: an API page with Open Graph/Twitter tags
(title, description, `/s/<slug>/cover.jpg`) that forwards to the Framer page `/p?s=<slug>`.
Framer can't vary preview metadata per query string, which is why the link lives on the API.

### Composer prefill

`prefillComposer(prompt)` (MoodwaveAPI) fills a Composer on the same page via a `mw:prefill`
window event, or opens `/create?prompt=…` when the page has no Composer.

### Accessibility

- **Focus rings:** `MoodwaveAPI` injects one stylesheet (`#mw-a11y`) with a 2px lilac
  `:focus-visible` ring for every link, button, input and ARIA control on the site (including
  Framer's own nav), overriding inline `outline: none`. Opt out with `data-focus-ring="off"`
  on elements that draw their own focus state (the composer textarea).
- **Reduced motion:** with `prefers-reduced-motion: reduce`, `MotionGlobalConfig.skipAnimations`
  makes every Framer Motion animation jump to its end; frame-loop components (record, waveform,
  mixer, cursor, preloader) check `useReducedMotion` themselves.
- **Dialogs:** `useDialogFocus(open, ref)` moves focus in, traps Tab and returns focus to the
  opener (mobile menu, cover editor).
- **Contrast:** Subtle `#99938a` and Faint `#858079` pass 4.5:1 on the ink, surface and
  surface-2 backgrounds (Framer colour styles and `C` tokens match).
- Generation progress announces stage changes only (a hidden `role="status"`), not every tick.

### Guest mode

Spotify keeps the app in development mode (only allow-listed accounts can sign in), so
visitors can **try it as a guest** (`startGuest()` → `POST /auth/guest/token`):
real Spotify catalogue via the API's app token, the real AI within limits (5 playlists a
day each, 30 songs, a shared daily AI budget; then the offline curator), no saving to
Spotify. Signing in with Spotify later moves guest playlists into the account (the guest
token is sent with `/auth/exchange`). Sign-in errors, e.g. not allow-listed, show as a
notice under the nav (AccountChip) with a "Try as a guest" button. Settings:
`ALLOW_GUEST`, `GUEST_PLAYLISTS_PER_DAY`, `GUEST_AI_PER_DAY`, `GUEST_MAX_TRACKS`.

### FAQ, Privacy and Terms

`/faq`, `/privacy` and `/terms` are native Framer pages (site text styles, editable on the
canvas), linked from the footer. `content/legal_pages.js` is the script that first built them
(it holds the original wording). Questions go to the repo's GitHub Issues. Data deletion is
self-serve: **Delete my account and data** in the account menu (`DELETE /auth/me`).
Keep the Privacy page in step with the code if what's stored or shared changes.

### Footer

The layout template footer links (Create, Library, How it works, FAQ, Privacy, Terms, GitHub)
sit in one row on desktop and tablet and wrap onto two lines on phone. The GitHub link uses
Phosphor's "Github Logo" icon and opens the repo in a new tab.

### Buttons

Code components use `Btn` and `Icon` from `MoodwaveAPI.tsx` instead of hand-styled buttons:

| Variant | Use for | Look |
| --- | --- | --- |
| `accent` | The main action (Play all, Make your own, Save cover, Try again) | Lilac fill, glow and sheen on hover |
| `spotify` | Anything that goes to Spotify (Save, Open in, Connect) | Spotify green (#1ED760), black Spotify icon mark and text |
| `light` | A strong secondary action (Update on Spotify, Make your own on shared pages) | Cream fill |
| `ghost` | Secondary actions (Share, New playlist, Refresh, Try as a guest) | Hairline border, lights up on hover |
| `danger` | Destructive actions (Delete, Turn off link, Delete account) | Ghost that warms to amber on hover |
| `quiet` | Tight spots and menu items | No border |

`<Btn variant icon iconRight size busy href>`: sizes `sm`/`md`/`lg`, `busy` swaps the icon for a
spinner, `href` renders a link. Icons react on hover (arrows slide, ▶ pops, ↻ spins). Native Framer
buttons on the pages use the matching hover lift + glow + press and Phosphor icons.

### Owner dashboard and featured playlists

- `ErrorsView.tsx` is the owner dashboard on `/admin` (also served at `/errors`, since redirects
  need a paid Framer plan): stat cards, a 14-day playlists chart and the error log, all from
  `GET /admin/stats` and `/telemetry/errors`.
- `FeaturedPlaylists.tsx` sits on Home after the Showcase ("Made with Moodwave"). It reads
  `GET /share/featured`, links each card to `/p?s=…`, and ▶ plays the whole playlist in the
  shared player. It renders nothing (and takes no space) until a playlist is featured.
- The owner sees ★ Feature on Home in the playlist header; featuring turns sharing on.
