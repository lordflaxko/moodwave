"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Cover } from "@/components/art/cover";
import { useFeatured } from "@/lib/api/hooks";
import { EASE } from "@/lib/motion";
import { cn, hash } from "@/lib/utils";

const STAGES = [
  { label: "Reading the moment", at: 0 },
  { label: "Mapping mood, energy and genre", at: 1800 },
  { label: "Pulling records from the crate", at: 4800 },
  { label: "Verifying every track on Spotify", at: 9000 },
  { label: "Sequencing the flow", at: 14000 },
];

/**
 * The "pressing the record" moment between prompt and playlist. Real album covers fly in
 * and settle into a grid while the actual pipeline stages tick by. Portaled to <body> so
 * page transforms never affect it.
 */
export function GenerationOverlay({ prompt }: { prompt: string }) {
  const [mounted, setMounted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const { data: featured } = useFeatured();

  useEffect(() => {
    setMounted(true);
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 200);
    document.body.style.overflow = "hidden";
    return () => {
      clearInterval(timer);
      document.body.style.overflow = "";
    };
  }, []);

  // Pick 9 covers deterministically from the prompt so it feels "chosen" for this request.
  const covers = useMemo(() => {
    const tracks = featured?.tracks ?? [];
    if (!tracks.length) return Array.from({ length: 9 }, (_, i) => ({ src: null, seed: `${prompt}-${i}` }));
    const offset = hash(prompt) % tracks.length;
    return Array.from({ length: 9 }, (_, i) => {
      const t = tracks[(offset + i * 3) % tracks.length];
      return { src: t.image_url, seed: t.album };
    });
  }, [featured, prompt]);

  const activeIndex = STAGES.reduce((acc, stage, i) => (elapsed >= stage.at ? i : acc), 0);
  const settled = Math.min(9, 2 + Math.floor(elapsed / 650));

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5, ease: EASE } }}
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-ink/92 p-6 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Composing your playlist"
    >
      <div className="grid w-full max-w-5xl items-center gap-12 md:grid-cols-[1fr_1.1fr]">
        {/* Records settling into place */}
        <div className="relative mx-auto aspect-square w-[min(78vw,26rem)]">
          <div className="grid h-full grid-cols-3 gap-2">
            {covers.map((cover, i) => {
              const angle = (hash(`${cover.seed}${i}`) % 60) - 30;
              const from = { x: ((i % 3) - 1) * 240 + angle * 3, y: (Math.floor(i / 3) - 1) * 200 - 120, rotate: angle };
              const landed = i < settled;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, ...from, scale: 0.7 }}
                  animate={landed ? { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 } : { opacity: 0.12, ...from, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  className="overflow-hidden rounded-lg shadow-[0_20px_40px_-15px_rgb(0_0_0/0.9)]"
                >
                  <Cover src={cover.src} seed={cover.seed} alt="" sizes="140px" className="h-full w-full" />
                </motion.div>
              );
            })}
          </div>
          <motion.div
            aria-hidden
            className="absolute -inset-8 -z-10 rounded-full bg-lilac/20 blur-3xl"
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div className="text-center md:text-left">
          <p className="eyebrow">Composing</p>
          <p className="mt-4 font-display text-3xl leading-tight font-light text-balance italic sm:text-4xl">
            “{prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt}”
          </p>
          <ol className="mt-10 space-y-3.5 text-left" aria-live="polite">
            {STAGES.map((stage, i) => {
              const done = i < activeIndex;
              const active = i === activeIndex;
              return (
                <motion.li
                  key={stage.label}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: done || active ? 1 : 0.28, x: 0 }}
                  transition={{ duration: 0.6, ease: EASE, delay: i * 0.05 }}
                  className="flex items-center gap-4"
                >
                  <span className="font-mono text-[11px] text-fg-faint tabular-nums">0{i + 1}</span>
                  <span className={cn("h-px flex-none transition-all duration-700", done ? "w-6 bg-moss" : active ? "w-10 bg-lilac" : "w-4 bg-line-strong")} />
                  <span className={cn("text-[15px]", active ? "text-fg" : "text-fg-muted")}>{stage.label}</span>
                  {done ? <Check className="size-3.5 text-moss" aria-label="done" /> : null}
                  {active ? (
                    <span className="flex h-3 items-end gap-0.5" aria-hidden>
                      {[0, 1, 2].map((b) => (
                        <span key={b} className="block h-full w-0.5 origin-bottom animate-eq rounded-full bg-lilac" style={{ animationDelay: `${b * 0.15}s` }} />
                      ))}
                    </span>
                  ) : null}
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
