# Framer code components

The Moodwave site (Home, How it works, Create, Playlist, Library) is built in Framer.
These are the code components it uses, kept here so they're versioned with the API
they talk to. Framer is the source of truth at runtime: after editing a file here,
paste it into the matching code file in the Framer project (or the other way round).

| File | Used on | What it does |
| --- | --- | --- |
| `MoodwaveAPI.tsx` | — | Shared client: `API_URL`, bearer-token session, types, design constants, `Collage` |
| `Composer.tsx` | Home, `/create` | The prompt box; submits to `/create?prompt=…&auto=1` |
| `Studio.tsx` | `/create` | Sign-in gate, generation with progress overlay, then opens the playlist |
| `PlaylistView.tsx` | `/playlist?id=…` | Tracks with reasons, "make it more…", Spotify player, save to Spotify |
| `Library.tsx` | `/library` | Grid of your playlists |
| `AccountChip.tsx` | Nav (layout template) | Spotify status, sign in / sign out |

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
