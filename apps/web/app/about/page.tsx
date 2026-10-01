import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PipelineStory } from "@/components/about/pipeline";
import { buttonClasses } from "@/components/ui/button";
import { Eyebrow, Reveal } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "How it works",
  description: "Your words → AI understands the vibe → music discovery → a personalized playlist.",
};

const NOTES = [
  {
    title: "Structured, not guessed",
    body: "Claude answers through a JSON schema (structured outputs), so the interpretation is typed data the app can display, validate and refine.",
  },
  {
    title: "Verified against Spotify",
    body: "Since Spotify closed recommendations and audio features to new apps, the model names songs and the backend proves each one exists.",
  },
  {
    title: "Secure by default",
    body: "OAuth with PKCE runs server-side, and tokens are encrypted at rest. The browser only ever holds an httpOnly session cookie.",
  },
  {
    title: "Graceful offline mode",
    body: "With no keys, a catalog of 290+ real songs and an offline curator stand in behind the same interfaces, and the UI tells you which one ran.",
  },
];

const STACK = [
  ["Interface", "Next.js 15 · React 19 · TypeScript · Tailwind v4 · Motion · TanStack Query · dnd-kit · Radix"],
  ["Service", "Python · FastAPI · Pydantic · SQLModel · httpx · RapidFuzz"],
  ["Intelligence", "Anthropic Claude: structured outputs, prompt caching, refusal fallbacks"],
  ["Music", "Spotify Web API · OAuth 2.0 + PKCE · Embed player"],
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-36">
      <header className="max-w-4xl">
        <Eyebrow>How it works</Eyebrow>
        <h1 className="display mt-5 text-[clamp(3.25rem,8vw,6.5rem)]">
          From a feeling <em>to a record.</em>
        </h1>
        <p className="mt-8 max-w-xl text-lg text-fg-muted">
          Four steps between what you type and what you hear. Scroll through them, then try it with a moment of your own.
        </p>
      </header>

      <PipelineStory />

      <Reveal as="section" className="mt-40" aria-labelledby="hood-heading">
        <Eyebrow>
          <span id="hood-heading">Under the hood</span>
        </Eyebrow>
        <dl className="mt-8 grid gap-px overflow-hidden rounded-[2rem] border border-line bg-line sm:grid-cols-2">
          {NOTES.map((n) => (
            <div key={n.title} className="bg-ink p-8 sm:p-10">
              <dt className="font-display text-2xl font-light tracking-[-0.02em]">{n.title}</dt>
              <dd className="mt-3 text-[15px] leading-relaxed text-fg-muted">{n.body}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal as="section" className="mt-28" aria-labelledby="stack-heading">
        <Eyebrow>
          <span id="stack-heading">Built with</span>
        </Eyebrow>
        <dl className="mt-6 divide-y divide-line border-y border-line">
          {STACK.map(([k, v]) => (
            <div key={k} className="grid gap-2 py-5 sm:grid-cols-[12rem_1fr]">
              <dt className="eyebrow pt-1">{k}</dt>
              <dd className="text-[15px] text-fg-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal as="section" className="mt-28 scroll-mt-28" id="setup" aria-labelledby="setup-heading">
        <div className="surface grid gap-10 rounded-[2rem] p-8 sm:p-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Eyebrow>Run it for real</Eyebrow>
            <h2 id="setup-heading" className="display mt-4 text-[clamp(2.25rem,4vw,3.25rem)]">
              Connect <em>your</em> services
            </h2>
            <p className="mt-5 text-fg-muted">
              Moodwave works fully in demo mode. Add keys to <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px]">apps/api/.env</code>{" "}
              and restart the API to use your Spotify account and Claude.
            </p>
            <Link href="/generate" className={buttonClasses("accent", "md", "mt-8")}>
              Try it now <ArrowRight className="size-4" />
            </Link>
          </div>
          <pre className="overflow-x-auto rounded-2xl border border-line bg-ink/80 p-6 font-mono text-[12.5px] leading-relaxed text-fg-muted">
{`# Spotify — developer.spotify.com/dashboard
# Redirect URI: http://127.0.0.1:3000/api/auth/callback
SPOTIFY_CLIENT_ID=…
SPOTIFY_CLIENT_SECRET=…

# Anthropic — console.anthropic.com
ANTHROPIC_API_KEY=…`}
          </pre>
        </div>
      </Reveal>
    </div>
  );
}
