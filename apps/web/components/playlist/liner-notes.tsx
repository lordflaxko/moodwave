"use client";

import { AnimatePresence, motion } from "motion/react";

import { EnergyCurve } from "@/components/playlist/energy-curve";
import { Eyebrow, Pill, Reveal } from "@/components/ui/primitives";
import { DEEP_CUTS_TRAIT } from "@/lib/constants";
import { EASE } from "@/lib/motion";
import type { Playlist } from "@/lib/types";

/** "Why this fits", written as liner notes: the curator's reasoning, then the facts. */
export function LinerNotes({ playlist, aiModelName }: { playlist: Playlist; aiModelName?: string | null }) {
  const { intent, stats } = playlist;
  const facts = [
    ["Tempo", `${intent.tempo_min}–${intent.tempo_max} BPM`],
    ["Vocals", intent.vocals === "any" ? "Mixed" : intent.vocals],
    ["Era", intent.era ?? "Any era"],
    ["Content", intent.explicit_allowed ? (stats.explicit_count ? `${stats.explicit_count} explicit` : "Clean") : "Clean only"],
  ];
  const traits = intent.characteristics.filter((c) => c !== DEEP_CUTS_TRAIT);
  const deepCuts = intent.characteristics.includes(DEEP_CUTS_TRAIT);

  return (
    <Reveal as="section" className="mt-24 grid gap-12 border-y border-line py-14 lg:grid-cols-[1.5fr_1fr] lg:gap-16" aria-labelledby="notes-heading">
      <div>
        <Eyebrow>
          <span id="notes-heading">Liner notes</span> · {playlist.ai_source === "claude" ? (aiModelName ?? "Claude") : "Offline curator"}
        </Eyebrow>
        <AnimatePresence mode="wait">
          <motion.blockquote
            key={intent.rationale}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="mt-6 font-display text-[clamp(1.5rem,2.6vw,2.25rem)] leading-[1.25] font-light tracking-[-0.02em] text-pretty text-fg"
          >
            <span className="text-lilac">“</span>
            {intent.rationale}
            <span className="text-lilac">”</span>
          </motion.blockquote>
        </AnimatePresence>
        <div className="mt-8 flex flex-wrap gap-2">
          {intent.moods.map((m) => (
            <Pill key={m} tone="accent" className="capitalize">
              {m}
            </Pill>
          ))}
          {traits.map((c) => (
            <Pill key={c} tone="outline">
              {c}
            </Pill>
          ))}
          {deepCuts ? <Pill tone="outline">Deep cuts over hits</Pill> : null}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-10">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="eyebrow text-[10px]">{label}</dt>
              <dd className="mt-1.5 font-display text-xl font-light capitalize">{value}</dd>
            </div>
          ))}
        </dl>
        {stats.energy_curve.length > 1 ? (
          <figure>
            <EnergyCurve values={stats.energy_curve} className="h-24 w-full" />
            <figcaption className="eyebrow mt-3 flex justify-between text-[10px]">
              <span>Energy arc</span>
              <span>
                Track 1 → {stats.track_count}
              </span>
            </figcaption>
          </figure>
        ) : null}
      </div>
    </Reveal>
  );
}
