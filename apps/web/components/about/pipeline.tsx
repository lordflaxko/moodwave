"use client";

import { Check, X } from "lucide-react";
import { motion, useInView, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Collage } from "@/components/art/collage";
import { Cover } from "@/components/art/cover";
import { useArtistLookup } from "@/components/landing/use-artist-lookup";
import { Eyebrow, Pill } from "@/components/ui/primitives";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PROMPT = "Late-night drive through Toronto, windows down";

/* --- Stage visuals ----------------------------------------------------------------- */

function TypingPrompt() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-20%" });
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    setCount(0);
    const timer = setInterval(() => setCount((c) => (c >= PROMPT.length + 30 ? 0 : c + 1)), 55);
    return () => clearInterval(timer);
  }, [inView]);
  return (
    <div ref={ref} className="surface rounded-[1.75rem] p-6">
      <Eyebrow>New playlist</Eyebrow>
      <p className="mt-4 min-h-[5.5rem] font-display text-[1.75rem] leading-snug font-light tracking-[-0.02em]">
        {PROMPT.slice(0, count)}
        <span className="ml-0.5 inline-block h-[0.9em] w-px translate-y-[0.12em] animate-pulse bg-lilac" />
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="font-mono text-[11px] text-fg-faint uppercase">24 songs · Auto energy</span>
        <span className="h-9 rounded-full bg-lilac px-4 text-sm leading-9 font-medium text-ink">Compose</span>
      </div>
    </div>
  );
}

function IntentAssembly() {
  const pills = ["nocturnal", "introspective", "alt R&B", "hazy synths", "slow-burning"];
  return (
    <motion.div
      className="surface rounded-[1.75rem] p-6"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-20%" }}
      variants={{ show: { transition: { staggerChildren: 0.12 } } }}
    >
      <Eyebrow>MusicalIntent</Eyebrow>
      <div className="mt-5 flex items-center gap-6">
        {/* Energy dial */}
        <svg viewBox="0 0 100 60" className="w-28 shrink-0" aria-label="Energy 42 of 100" role="img">
          <path d="M10 55 A40 40 0 0 1 90 55" fill="none" stroke="rgb(242 239 233 / 0.08)" strokeWidth="6" strokeLinecap="round" />
          <motion.path
            d="M10 55 A40 40 0 0 1 90 55"
            fill="none"
            stroke="var(--color-lilac)"
            strokeWidth="6"
            strokeLinecap="round"
            variants={{ hidden: { pathLength: 0 }, show: { pathLength: 0.42, transition: { duration: 1.4, ease: EASE } } }}
          />
          <text x="50" y="52" textAnchor="middle" className="fill-fg font-mono text-[11px]">
            0.42
          </text>
        </svg>
        <dl className="grid flex-1 grid-cols-2 gap-3 text-sm">
          {[
            ["Energy", "Steady"],
            ["Valence", "Bittersweet"],
            ["Tempo", "86–118"],
            ["Vocals", "Mixed"],
          ].map(([k, v]) => (
            <motion.div key={k} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
              <dt className="eyebrow text-[10px]">{k}</dt>
              <dd className="font-display text-lg font-light">{v}</dd>
            </motion.div>
          ))}
        </dl>
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5">
        {pills.map((p, i) => (
          <motion.span key={p} variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }}>
            <Pill tone={i < 2 ? "accent" : "outline"}>{p}</Pill>
          </motion.span>
        ))}
      </div>
      <motion.p
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 1 } } }}
        className="mt-5 border-t border-line pt-4 font-display text-[15px] font-light text-fg-muted italic"
      >
        “Slow-burning R&B with hazy production, smooth enough for an empty highway…”
      </motion.p>
    </motion.div>
  );
}

function DiscoveryCheck() {
  const lookup = useArtistLookup();
  const hits = [
    { title: "Wicked Games", artist: "The Weeknd", score: 98, ok: true },
    { title: "Come and See Me", artist: "PARTYNEXTDOOR", score: 96, ok: true },
    { title: "Neon Skyline Dreams", artist: "Unknown Artist", score: 41, ok: false },
    { title: "Japanese Denim", artist: "Daniel Caesar", score: 100, ok: true },
  ];
  return (
    <motion.ul
      className="surface space-y-1 rounded-[1.75rem] p-3"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-20%" }}
      variants={{ show: { transition: { staggerChildren: 0.35 } } }}
    >
      {hits.map((hit) => {
        const record = lookup.recordOf(hit.artist);
        return (
          <motion.li
            key={hit.title}
            variants={{ hidden: { opacity: 0, x: 16 }, show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE } } }}
            className="flex items-center gap-3.5 rounded-2xl px-3 py-2.5"
          >
            <span className="relative size-11 shrink-0 overflow-hidden rounded-lg">
              <Cover src={hit.ok ? record?.src : null} seed={hit.title} alt="" sizes="44px" className={cn("h-full w-full", !hit.ok && "opacity-40 grayscale")} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[15px]", !hit.ok && "text-fg-faint line-through")}>{hit.title}</span>
              <span className="block truncate text-[13px] text-fg-subtle">{hit.artist}</span>
            </span>
            <motion.span
              variants={{ hidden: { opacity: 0, scale: 0.5 }, show: { opacity: 1, scale: 1, transition: { delay: 0.3 } } }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px]",
                hit.ok ? "bg-moss/12 text-moss" : "bg-rose/12 text-rose",
              )}
            >
              {hit.ok ? <Check className="size-3" /> : <X className="size-3" />}
              {hit.score}
            </motion.span>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

function PlaylistStack() {
  const lookup = useArtistLookup();
  const names = ["The Weeknd", "PARTYNEXTDOOR", "Daniel Caesar", "Drake", "Majid Jordan", "Frank Ocean"];
  const items = names.map((n) => {
    const r = lookup.recordOf(n);
    return { src: r?.src, seed: r?.seed ?? n, title: r?.title ?? n, artist: n };
  });
  return (
    <motion.div
      className="surface rounded-[1.75rem] p-6"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20%" }}
      transition={{ duration: 0.9, ease: EASE }}
    >
      <div className="flex items-end gap-5">
        <Collage variant="grid" items={items.slice(0, 4)} className="w-28 shrink-0 rounded-xl" />
        <div>
          <Eyebrow>24 songs · 1 hr 32 min</Eyebrow>
          <p className="mt-1 font-display text-3xl font-light tracking-[-0.02em]">After Hours, Toronto</p>
        </div>
      </div>
      <ul className="mt-5 space-y-2.5">
        {items.slice(0, 3).map((t, i) => (
          <motion.li
            key={t.artist}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.4 + i * 0.12 }}
            className="flex items-center gap-3"
          >
            <span className="relative size-9 shrink-0 overflow-hidden rounded-md">
              <Cover src={t.src} seed={t.seed} alt="" sizes="36px" className="h-full w-full" />
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate">{t.title}</span>
              <span className="block truncate text-xs text-fg-subtle">{t.artist}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

/* --- The story --------------------------------------------------------------------- */

const STAGES = [
  {
    title: "Your words",
    lede: "Start with a moment, not a genre.",
    body: "“Coding at 2 AM.” “Sunday kitchen.” “That drive home in October.” The prompt can be as specific or as vague as the feeling.",
    visual: <TypingPrompt />,
  },
  {
    title: "AI understands the vibe",
    lede: "Claude reads it like a music supervisor.",
    body: "Your words become a structured intent: moods, an energy curve, tempo, era, vocal texture, and a short note on why it fits. That gives you something you can see and steer.",
    visual: <IntentAssembly />,
  },
  {
    title: "Music discovery",
    lede: "Every pick is checked against the real catalog.",
    body: "Candidates are searched on Spotify in parallel and fuzzy-matched on title and artist. Anything that doesn't exist, or doesn't match, never reaches you. Gaps are refilled automatically.",
    visual: <DiscoveryCheck />,
  },
  {
    title: "Personalized playlist",
    lede: "Sequenced, explained, and yours to reshape.",
    body: "Songs are ordered into an arc and annotated with why they're there. Then you keep talking (“more upbeat”, “fewer hits”) and it re-sequences in place.",
    visual: <PlaylistStack />,
  },
];

export function PipelineStory() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 24 });

  return (
    <ol ref={ref} className="relative mt-24 space-y-28 sm:space-y-36">
      {/* The thread that connects each stage, drawn as you scroll */}
      <svg aria-hidden className="absolute top-2 bottom-2 left-[1.15rem] hidden h-[calc(100%-1rem)] w-px overflow-visible md:block" preserveAspectRatio="none" viewBox="0 0 1 100">
        <line x1="0.5" y1="0" x2="0.5" y2="100" stroke="rgb(242 239 233 / 0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <motion.line
          x1="0.5"
          y1="0"
          x2="0.5"
          y2="100"
          stroke="var(--color-lilac)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          style={{ pathLength: progress }}
        />
      </svg>

      {STAGES.map((stage, i) => (
        <li key={stage.title} className="relative grid items-center gap-10 md:grid-cols-[1fr_1fr] md:gap-16 md:pl-16">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-30%" }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="absolute top-1 left-0 hidden size-[2.3rem] place-items-center rounded-full border border-lilac/40 bg-ink font-mono text-[11px] text-lilac md:grid"
            aria-hidden
          >
            0{i + 1}
          </motion.span>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-20%" }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            <p className="eyebrow md:hidden">Step 0{i + 1}</p>
            <h2 className="display mt-2 text-[clamp(2.25rem,4.5vw,3.5rem)]">{stage.title}</h2>
            <p className="mt-5 text-lg text-fg">{stage.lede}</p>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-fg-muted">{stage.body}</p>
          </motion.div>
          <div>{stage.visual}</div>
        </li>
      ))}
    </ol>
  );
}
