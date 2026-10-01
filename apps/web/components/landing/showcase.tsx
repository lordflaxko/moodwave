"use client";

import { Play } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import { Collage } from "@/components/art/collage";
import { Cover } from "@/components/art/cover";
import { useArtistLookup } from "@/components/landing/use-artist-lookup";
import { buttonClasses } from "@/components/ui/button";
import { Eyebrow, Pill, Reveal } from "@/components/ui/primitives";
import { EASE } from "@/lib/motion";

const SAMPLE = {
  prompt: "Late-night drive through Toronto, windows down, city lights",
  title: "After Hours, Toronto",
  rationale:
    "Slow-burning R&B with hazy, nocturnal production: smooth enough for an empty highway, with a gentle lift as the skyline comes into view.",
  artists: ["The Weeknd", "PARTYNEXTDOOR", "Daniel Caesar", "Drake", "Majid Jordan", "Frank Ocean"],
  reasons: [
    "Neon synths that set the city scene",
    "Toronto's after-dark sound, distilled",
    "A warm, unhurried exhale between turns",
    "Muted drums for the long highway stretch",
    "Glossy hooks as the skyline appears",
    "A late, wistful landing",
  ],
  energy: [0.62, 0.48, 0.38, 0.42, 0.55, 0.35],
};

/** A composed playlist, shown as an editorial spread: the prompt, then the result. */
export function Showcase() {
  const lookup = useArtistLookup();
  const records = SAMPLE.artists.map((name) => ({ name, record: lookup.recordOf(name) }));

  return (
    <section aria-labelledby="showcase-heading" className="mx-auto max-w-6xl px-5 py-28 sm:py-36">
      <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <Reveal className="lg:sticky lg:top-32 lg:self-start">
          <Eyebrow>From a sentence</Eyebrow>
          <h2 id="showcase-heading" className="display mt-4 text-[clamp(2.5rem,5.5vw,4.25rem)]">
            One line in. <em>A whole record</em> out.
          </h2>
          <figure className="mt-10 border-l border-lilac/50 pl-6">
            <blockquote className="font-display text-2xl leading-snug font-light text-fg italic">“{SAMPLE.prompt}”</blockquote>
            <figcaption className="eyebrow mt-4">Your prompt</figcaption>
          </figure>
          <p className="mt-8 max-w-md text-[15px] leading-relaxed text-fg-muted">
            The curator reads the feeling behind the words, chooses the energy and the sound, and explains each pick.
            Then you keep shaping it in plain language.
          </p>
          <Link href="/generate" className={buttonClasses("outline", "md", "mt-8")}>
            Try your own moment
          </Link>
        </Reveal>

        <Reveal delay={0.1}>
          <article className="surface overflow-hidden rounded-[2rem]">
            <header className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:p-8">
              <Collage
                variant="grid"
                items={records.slice(0, 4).map((r) => ({ src: r.record?.src, seed: r.record?.seed ?? r.name }))}
                className="w-36 shrink-0 rounded-2xl shadow-2xl shadow-black/60"
              />
              <div className="min-w-0">
                <Eyebrow>AI playlist · 18 songs · 1 hr 12 min</Eyebrow>
                <h3 className="mt-2 font-display text-4xl font-light tracking-[-0.03em]">{SAMPLE.title}</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill tone="accent">Nocturnal</Pill>
                  <Pill>R&amp;B</Pill>
                  <Pill>Alt R&amp;B</Pill>
                  <Pill>Energy · Steady</Pill>
                </div>
              </div>
            </header>
            <p className="border-y border-line px-6 py-5 font-display text-lg leading-snug font-light text-fg-muted italic sm:px-8">
              {SAMPLE.rationale}
            </p>
            <ol className="p-3 sm:p-4">
              {records.map(({ name, record }, i) => (
                <motion.li
                  key={name}
                  initial={{ opacity: 0, x: 16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.15 + i * 0.07 }}
                  className="group flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <span className="w-5 font-mono text-[11px] text-fg-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-lg">
                    <Cover src={record?.src} seed={record?.seed ?? name} alt="" sizes="48px" className="h-full w-full" />
                    <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                      <Play className="size-4 fill-white text-white" aria-hidden />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{record?.title ?? "—"}</span>
                    <span className="block truncate text-[13px] text-fg-subtle">
                      {name} · <span className="italic">{SAMPLE.reasons[i]}</span>
                    </span>
                  </span>
                  <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-white/[0.06] sm:block" aria-hidden>
                    <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${SAMPLE.energy[i] * 100}%` }} />
                  </span>
                </motion.li>
              ))}
            </ol>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
