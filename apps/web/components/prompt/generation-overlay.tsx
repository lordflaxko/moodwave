"use client";

import { Check, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const STAGES = [
  { label: "Reading your vibe", at: 0 },
  { label: "Mapping mood, energy & genres", at: 2200 },
  { label: "Picking songs that fit", at: 5500 },
  { label: "Finding every track on Spotify", at: 10000 },
  { label: "Verifying matches & sequencing the flow", at: 15000 },
];

/**
 * Full-screen generation state. The server does the work in one request; the stages
 * mirror the real pipeline order so the wait reads as progress rather than a spinner.
 */
export function GenerationOverlay({ open, prompt }: { open: boolean; prompt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) return;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [open]);

  const activeIndex = STAGES.reduce((acc, stage, i) => (elapsed >= stage.at ? i : acc), 0);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] grid place-items-center bg-ink/80 p-6 backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-label="Generating your playlist"
        >
          <div className="flex w-full max-w-md flex-col items-center text-center">
            {/* Pulsing orb */}
            <div className="relative mb-10 size-36" aria-hidden>
              {[0, 1, 2].map((ring) => (
                <motion.div
                  key={ring}
                  className="absolute inset-0 rounded-full border border-[var(--mood-b)]/40"
                  initial={{ scale: 0.6, opacity: 0.8 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: ring * 0.8, ease: "easeOut" }}
                />
              ))}
              <motion.div
                className="mood-ring absolute inset-6 rounded-full shadow-[0_0_80px_10px_var(--mood-a)]"
                animate={{ scale: [1, 1.08, 1], rotate: [0, 180, 360] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="absolute inset-0 flex items-end justify-center gap-1 pb-[3.4rem]">
                {[0, 1, 2, 3, 4].map((bar) => (
                  <span
                    key={bar}
                    className="block h-6 w-1 origin-bottom animate-eq rounded-full bg-white/90"
                    style={{ animationDelay: `${bar * 0.12}s` }}
                  />
                ))}
              </div>
            </div>

            <p className="font-display text-2xl leading-snug text-balance text-fg italic sm:text-3xl">
              “{prompt.length > 110 ? `${prompt.slice(0, 110)}…` : prompt}”
            </p>

            <ol className="mt-8 w-full space-y-2.5 text-left" aria-live="polite">
              {STAGES.map((stage, i) => {
                const done = i < activeIndex;
                const active = i === activeIndex;
                return (
                  <li
                    key={stage.label}
                    className={cn(
                      "flex items-center gap-3 text-sm transition-colors duration-500",
                      done ? "text-fg-muted" : active ? "text-fg" : "text-fg-subtle/50",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full border",
                        done ? "border-transparent bg-mint/20 text-mint" : "border-line",
                      )}
                    >
                      {done ? (
                        <Check className="size-3" />
                      ) : active ? (
                        <LoaderCircle className="size-3 animate-spin text-[var(--mood-b)]" />
                      ) : null}
                    </span>
                    {stage.label}
                    {active && elapsed > 25000 && i === STAGES.length - 1 ? (
                      <span className="text-xs text-fg-subtle">· almost there</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
