"use client";

import { Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { EnergyCurve } from "@/components/playlist/energy-curve";
import { Chip } from "@/components/ui/primitives";
import type { Playlist } from "@/lib/types";
import { energyLabel } from "@/lib/utils";

function Meter({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-subtle">{label}</span>
        <span className="font-medium text-fg">{caption}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="mood-ring h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, value * 100)}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function valenceLabel(v: number) {
  if (v < 0.25) return "Melancholic";
  if (v < 0.45) return "Bittersweet";
  if (v < 0.65) return "Balanced";
  if (v < 0.8) return "Warm";
  return "Euphoric";
}

/** "Why this fits": the model's structured interpretation, made legible. */
export function IntentPanel({ playlist, aiModelName }: { playlist: Playlist; aiModelName?: string | null }) {
  const { intent, stats } = playlist;
  const source = playlist.ai_source === "claude" ? (aiModelName ?? "Claude") : "Offline curator";

  return (
    <section aria-labelledby="why-heading" className="glass rounded-xl3 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="why-heading" className="flex items-center gap-2 text-sm font-semibold">
          <span className="mood-ring grid size-6 place-items-center rounded-lg text-white">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          Why this fits
        </h2>
        <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-fg-subtle" title="Which AI interpreted your prompt">
          {source}
        </span>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-pretty text-fg/90">{intent.rationale}</p>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <Meter label="Energy" value={intent.energy} caption={energyLabel(intent.energy)} />
        <Meter label="Mood" value={intent.valence} caption={valenceLabel(intent.valence)} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        {[
          ["Tempo", `${intent.tempo_min}–${intent.tempo_max}`, "BPM"],
          ["Vocals", intent.vocals === "any" ? "Mixed" : intent.vocals, ""],
          ["Era", intent.era ?? "Any", ""],
        ].map(([label, value, unit]) => (
          <div key={label} className="rounded-2xl bg-white/[0.04] px-2 py-2.5">
            <dt className="text-[10px] tracking-wider text-fg-subtle uppercase">{label}</dt>
            <dd className="mt-0.5 text-sm leading-tight font-medium capitalize">
              <span className="block truncate">{value}</span>
              {unit ? <span className="block text-[10px] font-normal text-fg-subtle">{unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap gap-1.5" aria-label="Moods">
          {intent.moods.map((m) => (
            <Chip key={m} tone="mood" className="capitalize">
              {m}
            </Chip>
          ))}
          {intent.genres.map((g) => (
            <Chip key={g} className="capitalize">
              {g}
            </Chip>
          ))}
        </div>
        {intent.characteristics.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Sonic characteristics">
            {intent.characteristics.map((c) => (
              <li key={c}>
                <Chip tone="outline">{c}</Chip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {stats.energy_curve.length > 1 ? (
        <div className="mt-6">
          <div className="flex items-center justify-between text-xs text-fg-subtle">
            <span>Energy arc</span>
            <span>
              track 1 → {stats.track_count}
            </span>
          </div>
          <EnergyCurve values={stats.energy_curve} className="mt-2 h-16 w-full" />
        </div>
      ) : null}
    </section>
  );
}
