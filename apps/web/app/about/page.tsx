import { ArrowDown, ArrowRight, Brain, Database, Layers, Lock, Music4, Search, ShieldCheck, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "How it works",
  description: "The AI pipeline, Spotify integration and architecture behind Moodwave.",
};

const PIPELINE = [
  {
    icon: Brain,
    title: "Interpret",
    detail: "Claude (structured outputs)",
    body: "The prompt becomes a typed MusicalIntent: moods, energy and valence (0–1), tempo range, genres, era, vocal preference, explicit policy and a listener-facing rationale, plus about 40 sequenced candidate songs, each with an energy estimate and a reason.",
  },
  {
    icon: Search,
    title: "Resolve",
    detail: "Spotify Search, parallel",
    body: "Candidates are looked up concurrently (bounded by a semaphore) with field-filtered queries, retrying with a looser query and honoring 429 Retry-After.",
  },
  {
    icon: ShieldCheck,
    title: "Verify",
    detail: "Fuzzy title + artist match",
    body: "RapidFuzz scores each hit against the requested title and artist after stripping remaster/feat. suffixes. Anything below threshold is dropped, which filters out hallucinated or mismatched songs.",
  },
  {
    icon: Layers,
    title: "Filter & backfill",
    detail: "Constraints, then top-up",
    body: "Explicit policy, duration bounds, de-duplication by id and normalized title, and a two-songs-per-artist cap. If too few survive, Claude proposes more, then intent-driven discovery search fills any gap.",
  },
  {
    icon: Wand2,
    title: "Refine",
    detail: "Conversational edits",
    body: "Follow-ups send the current intent and tracks back to Claude, which returns an updated intent, songs to remove, new candidates and a target length. New songs slot into the removed positions, so the sequence keeps its shape.",
  },
];

const STACK = [
  ["Frontend", ["Next.js 15 (App Router)", "React 19", "TypeScript", "Tailwind CSS v4", "Motion", "TanStack Query", "Zustand", "dnd-kit", "Radix UI"]],
  ["Backend", ["Python 3.12+", "FastAPI", "Pydantic v2", "SQLModel / SQLAlchemy", "httpx (async)", "RapidFuzz", "pytest"]],
  ["AI & data", ["Anthropic Claude (structured outputs, prompt caching, refusal fallbacks)", "Spotify Web API", "OAuth 2.0 + PKCE", "SQLite → Postgres-ready"]],
] as const;

const DECISIONS = [
  {
    title: "Why the AI picks songs by name",
    body: "Spotify closed /recommendations, /audio-features and related-artists to new apps in late 2024. Instead of depending on them, the model proposes songs it knows and the backend proves each one exists. That turns a deprecation into a hallucination guard.",
  },
  {
    title: "Secrets never touch the browser",
    body: "OAuth runs server-side with PKCE and a signed state cookie. Tokens are Fernet-encrypted at rest and refreshed transparently. The browser only holds an httpOnly session cookie, and Next.js proxies /api/* so everything stays same-origin.",
  },
  {
    title: "Graceful degradation",
    body: "No Spotify keys? A curated 220-song catalog stands in behind the same interface. No Anthropic key, or Claude is down or rate-limited? A rule-based curator produces the same MusicalIntent shape, and the UI tells you which one ran.",
  },
  {
    title: "Playback that respects the platform",
    body: "preview_url is gone for new apps, so playback uses Spotify's official embed: full tracks for logged-in Premium listeners, previews otherwise. Demo tracks simulate progress so the flow is still demonstrable.",
  },
];

function ArchNode({ icon: Icon, title, items }: { icon: typeof Brain; title: string; items: string[] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-[var(--mood-b)]" aria-hidden /> {title}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs text-fg-subtle">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-10">
      <header className="max-w-3xl">
        <p className="text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">How it works</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
          From a sentence to a <span className="font-display font-normal text-gradient italic">verified</span> playlist.
        </h1>
        <p className="mt-5 text-lg text-fg-muted">
          Moodwave is a full-stack portfolio project: a Next.js frontend and a Python FastAPI service that coordinates
          an LLM and the Spotify Web API. Here&apos;s what happens between pressing Generate and hearing music.
        </p>
      </header>

      {/* Pipeline */}
      <section aria-labelledby="pipeline-heading" className="mt-16">
        <h2 id="pipeline-heading" className="text-2xl font-semibold tracking-tight">The recommendation pipeline</h2>
        <ol className="mt-8 space-y-3">
          {PIPELINE.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="glass grid gap-4 rounded-xl3 p-5 sm:grid-cols-[12rem_1fr] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="mood-ring grid size-10 shrink-0 place-items-center rounded-xl text-white">
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-mono text-[11px] text-fg-subtle">STEP {i + 1}</p>
                    <p className="font-semibold">{step.title}</p>
                    <p className="text-xs text-fg-subtle">{step.detail}</p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-fg-muted">{step.body}</p>
              </div>
              {i < PIPELINE.length - 1 ? (
                <ArrowDown className="mx-auto my-1 size-4 text-fg-subtle" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Architecture */}
      <section aria-labelledby="arch-heading" className="mt-20">
        <h2 id="arch-heading" className="text-2xl font-semibold tracking-tight">Architecture</h2>
        <div className="mt-8 grid items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <ArchNode icon={Layers} title="Next.js app" items={["App Router pages", "TanStack Query cache", "/api/* → proxy", "No secrets"]} />
          <ArrowRight className="mx-auto size-5 rotate-90 text-fg-subtle md:rotate-0" aria-hidden />
          <ArchNode icon={Lock} title="FastAPI service" items={["Session + OAuth (PKCE)", "PlaylistPipeline", "Rate limiting", "Typed schemas"]} />
          <ArrowRight className="mx-auto size-5 rotate-90 text-fg-subtle md:rotate-0" aria-hidden />
          <div className="grid gap-3">
            <ArchNode icon={Brain} title="AIProvider" items={["ClaudeProvider", "HeuristicProvider"]} />
            <ArchNode icon={Music4} title="SpotifyClient" items={["SpotifyHttpClient", "MockSpotifyClient"]} />
            <ArchNode icon={Database} title="SQLite (SQLModel)" items={["Users, encrypted tokens", "Playlists, tracks, refinements"]} />
          </div>
        </div>
      </section>

      {/* Decisions */}
      <section aria-labelledby="decisions-heading" className="mt-20">
        <h2 id="decisions-heading" className="text-2xl font-semibold tracking-tight">Engineering decisions</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {DECISIONS.map((d) => (
            <article key={d.title} className="glass rounded-xl3 p-6">
              <h3 className="font-semibold">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{d.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section aria-labelledby="stack-heading" className="mt-20">
        <h2 id="stack-heading" className="text-2xl font-semibold tracking-tight">Tech stack</h2>
        <dl className="mt-8 space-y-5">
          {STACK.map(([group, items]) => (
            <div key={group} className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <dt className="text-sm text-fg-subtle">{group}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {items.map((item) => (
                  <Chip key={item} tone="outline">{item}</Chip>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Setup */}
      <section id="setup" aria-labelledby="setup-heading" className="mt-20 scroll-mt-28">
        <div className="glass rounded-[2rem] p-6 sm:p-10">
          <h2 id="setup-heading" className="text-2xl font-semibold tracking-tight">Connect real services</h2>
          <p className="mt-2 text-fg-muted">
            The app runs fully in demo mode. To use real data, add keys to <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm">apps/api/.env</code> and restart the API:
          </p>
          <pre className="mt-5 overflow-x-auto rounded-2xl bg-ink/70 p-4 font-mono text-xs leading-relaxed text-fg-muted">
{`# Spotify: developer.spotify.com/dashboard → Redirect URI:
#   http://127.0.0.1:3000/api/auth/callback
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Anthropic: console.anthropic.com
ANTHROPIC_API_KEY=...`}
          </pre>
          <div className="mt-6">
            <Link href="/generate" className={buttonClasses("mood", "md")}>
              Try it now <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
