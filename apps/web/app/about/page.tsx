import type { Metadata } from "next";

import { PipelineStory } from "@/components/about/pipeline";
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

    </div>
  );
}
