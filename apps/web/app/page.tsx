"use client";

import { ArrowRight, AudioLines, MessageSquareText, ScanSearch, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Suspense, useState } from "react";

import { Cover } from "@/components/art/cover";
import { AuthErrorNotice } from "@/components/layout/auth-error-notice";
import { SpotifyGlyph } from "@/components/layout/logo";
import { PromptComposer } from "@/components/prompt/prompt-composer";
import { SuggestionChips } from "@/components/prompt/suggestion-chips";
import { buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/primitives";
import { useConfig } from "@/lib/api/hooks";
import { moodColors, moodStyle } from "@/lib/mood";
import { EXAMPLE_PROMPTS } from "@/lib/prompts";

const MARQUEE = [
  ["Space Song", "Beach House"], ["Pink + White", "Frank Ocean"], ["Kyoto", "Phoebe Bridgers"],
  ["Midnight City", "M83"], ["Electric Feel", "MGMT"], ["Get Lucky", "Daft Punk"],
  ["Snooze", "SZA"], ["Dreams", "Fleetwood Mac"], ["Innerbloom", "RÜFÜS DU SOL"],
  ["Holocene", "Bon Iver"], ["Nightcall", "Kavinsky"], ["Take Five", "Dave Brubeck"],
  ["Heat Waves", "Glass Animals"], ["Water", "Tyla"], ["Teardrop", "Massive Attack"],
  ["Redbone", "Childish Gambino"], ["Sofia", "Clairo"], ["Latch", "Disclosure"],
];

const STEPS = [
  {
    icon: Sparkles,
    title: "Interpret",
    body: "Claude reads your words like a music supervisor would, turning them into moods, an energy curve, genres, tempo and sonic traits.",
    visual: (
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="mood">nocturnal</Chip>
        <Chip tone="mood">introspective</Chip>
        <Chip>energy 0.34</Chip>
        <Chip>mellow indie</Chip>
        <Chip>hazy reverb</Chip>
      </div>
    ),
  },
  {
    icon: ScanSearch,
    title: "Resolve & verify",
    body: "Every pick is searched on Spotify and fuzzy-matched by title and artist, so no song is made up. Gaps get backfilled automatically.",
    visual: (
      <ul className="space-y-1.5 font-mono text-[11px]">
        <li className="flex justify-between"><span className="text-fg-muted">Motion Sickness, Phoebe Bridgers</span><span className="text-mint">✓ 98</span></li>
        <li className="flex justify-between"><span className="text-fg-muted">Myth, Beach House</span><span className="text-mint">✓ 100</span></li>
        <li className="flex justify-between"><span className="text-fg-subtle line-through">Untitled Dream, Unknown</span><span className="text-coral">✕ 41</span></li>
      </ul>
    ),
  },
  {
    icon: MessageSquareText,
    title: "Refine by talking",
    body: "“Make it more upbeat.” “Only female vocalists.” “No explicit songs.” Each note reshapes the playlist and explains what changed.",
    visual: (
      <div className="space-y-2 text-xs">
        <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-white/10 px-3 py-1.5">Make it more upbeat</p>
        <p className="w-fit rounded-2xl rounded-bl-md border border-line px-3 py-1.5 text-fg-muted">
          Raised energy to 0.62 and swapped 6 slower songs.
        </p>
      </div>
    ),
  },
];

function MarqueeRow({ items, reverse }: { items: string[][]; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="mask-fade-x overflow-hidden">
      <ul className={`flex w-max gap-4 ${reverse ? "animate-marquee-reverse" : "animate-marquee"} hover:[animation-play-state:paused]`}>
        {doubled.map(([title, artist], i) => (
          <li key={`${title}-${i}`} className="w-40 shrink-0 sm:w-48" aria-hidden={i >= items.length}>
            <Cover src={null} seed={`${title}${artist}`} alt="" size={192} className="w-full rounded-2xl shadow-2xl shadow-black/50" />
            <p className="mt-2 truncate text-sm text-fg">{title}</p>
            <p className="truncate text-xs text-fg-subtle">{artist}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LandingPage() {
  const [prompt, setPrompt] = useState("");
  const { data: config } = useConfig();

  return (
    <>
      <Suspense fallback={null}>
        <AuthErrorNotice />
      </Suspense>
      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-4 pt-14 pb-16 text-center sm:pt-20">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-3 py-1 text-xs text-fg-muted">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-mint" />
            </span>
            AI playlist studio · {config?.ai_enabled ? "powered by Claude" : "Claude-ready"} + Spotify
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 text-5xl leading-[0.95] font-semibold tracking-[-0.04em] text-balance sm:text-7xl md:text-[5.5rem]"
        >
          Describe a feeling.
          <br />
          <span className="font-display font-normal tracking-[-0.02em] text-gradient italic">Hear it.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.18 }}
          className="mx-auto mt-6 max-w-xl text-base text-pretty text-fg-muted sm:text-lg"
        >
          Moodwave turns a sentence into a playlist of real songs. It explains why each one fits, then lets you
          reshape the mix just by saying what you want.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-10 max-w-2xl text-left"
        >
          <PromptComposer value={prompt} onValueChange={setPrompt} variant="hero" />
        </motion.div>

        <SuggestionChips className="mx-auto mt-6 max-w-2xl" onPick={(p) => setPrompt(p.prompt)} />
      </section>

      {/* Marquee */}
      <section aria-label="Sample songs" className="space-y-6 py-6">
        <MarqueeRow items={MARQUEE.slice(0, 9)} />
        <MarqueeRow items={MARQUEE.slice(9)} reverse />
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 pt-24" aria-labelledby="how-heading">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">The pipeline</p>
          <h2 id="how-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            Not a search box. <span className="font-display font-normal italic text-fg-muted">A curator.</span>
          </h2>
        </div>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="glass flex flex-col rounded-xl3 p-6"
            >
              <div className="flex items-center gap-3">
                <span className="mood-ring grid size-9 place-items-center rounded-xl text-white">
                  <step.icon className="size-4" aria-hidden />
                </span>
                <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
              <div className="mt-6 rounded-2xl border border-line bg-ink/40 p-4">{step.visual}</div>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* Prompt gallery */}
      <section className="mx-auto max-w-6xl px-4 pt-28" aria-labelledby="gallery-heading">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">Start anywhere</p>
            <h2 id="gallery-heading" className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Prompts people love
            </h2>
          </div>
          <Link href="/generate" className={buttonClasses("glass", "md")}>
            Open the studio <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {EXAMPLE_PROMPTS.slice(0, 8).map((item, i) => {
            const { a, b } = moodColors(item.energy, item.valence);
            return (
              <motion.li
                key={item.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 4) * 0.06 }}
              >
                <Link
                  href={`/generate?prompt=${encodeURIComponent(item.prompt)}`}
                  style={moodStyle(item.energy, item.valence)}
                  className="group relative flex h-full min-h-44 flex-col justify-between overflow-hidden rounded-xl3 border border-line p-5 transition hover:-translate-y-1 hover:border-line-strong"
                >
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10 opacity-40 transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: `radial-gradient(120% 90% at 100% 0%, ${a}, transparent 60%), radial-gradient(90% 80% at 0% 100%, ${b}33, transparent 60%)` }}
                  />
                  <div className="flex items-center justify-between">
                    <Chip tone="mood">{item.category}</Chip>
                    <AudioLines className="size-4 text-fg-subtle transition group-hover:text-fg" aria-hidden />
                  </div>
                  <div>
                    <p className="mt-6 font-semibold">{item.label}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{item.prompt}</p>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pt-28">
        <div className="glass relative overflow-hidden rounded-[2.5rem] px-6 py-16 text-center sm:px-16">
          <div aria-hidden className="mood-ring absolute -top-24 left-1/2 h-48 w-[60%] -translate-x-1/2 rounded-full opacity-30 blur-3xl" />
          <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Your next favorite playlist is <span className="font-display font-normal italic">one sentence</span> away.
          </h2>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/generate" className={buttonClasses("mood", "lg")}>
              <Sparkles className="size-4" /> Start creating
            </Link>
            {config?.spotify_enabled ? (
              <a href="/api/auth/login" className={buttonClasses("primary", "lg")}>
                <SpotifyGlyph className="size-5" /> Connect Spotify
              </a>
            ) : (
              <Link href="/about" className={buttonClasses("glass", "lg")}>
                See how it works
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
