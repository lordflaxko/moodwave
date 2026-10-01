"use client";

import { motion } from "motion/react";
import { useState } from "react";

import { Composer } from "@/components/composer/composer";
import { MoodCard } from "@/components/landing/mood-card";
import { PortraitWall } from "@/components/landing/portrait-wall";
import { EASE } from "@/lib/motion";
import { HERO_MOODS, type Mood } from "@/lib/moods";
import { cn } from "@/lib/utils";

/* Where the five moods float around the composer on wide screens. */
const ORBIT = [
  "xl:left-[-17.5rem] xl:top-[-3rem]",
  "xl:left-[-19rem] xl:top-[9.5rem]",
  "xl:right-[-17.5rem] xl:top-[-4.5rem]",
  "xl:right-[-19.5rem] xl:top-[8rem]",
  // Centered with margins, not translate: motion owns the transform.
  "xl:inset-x-0 xl:mx-auto xl:top-[calc(100%+2.25rem)]",
];

export function Hero({ initialPrompt = "", compact = false }: { initialPrompt?: string; compact?: boolean }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [focusSignal, setFocusSignal] = useState(0);
  const [hovered, setHovered] = useState<Mood | null>(null);

  const pick = (mood: Mood) => {
    setPrompt(mood.prompt);
    setFocusSignal((n) => n + 1);
  };

  return (
    <section
      className={cn(
        "relative isolate flex flex-col items-center overflow-x-clip px-5",
        compact ? "pt-32 pb-24 xl:pb-44" : "min-h-[100svh] justify-center pt-28 pb-36 xl:pb-44",
      )}
    >
      <PortraitWall highlight={hovered?.cast ?? []} />

      <div className="relative w-full max-w-5xl text-center">
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          A playlist studio for moments
        </motion.p>

        <h1 className="display mt-6 text-[clamp(3rem,8.4vw,7.25rem)]">
          {["What are you", "in the mood for?"].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.08em]">
              <motion.span
                className="block"
                initial={{ y: "105%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1.1, ease: EASE, delay: 0.1 + i * 0.12 }}
              >
                {i === 0 ? line : (
                  <>
                    <em>in the mood</em> for?
                  </>
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.45 }}
          className="mx-auto mt-7 max-w-xl"
        >
          <p className="text-lg text-fg sm:text-xl">Tell us a moment. We&apos;ll find the soundtrack.</p>
          <p className="mt-2 text-[15px] text-pretty text-fg-subtle">
            Describe a moment, a feeling, a place, or something you can&apos;t quite put into words.
          </p>
        </motion.div>
      </div>

      <div className="relative mt-10 w-full max-w-[44rem]">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.55 }}
          className="relative z-10 text-left"
        >
          <Composer value={prompt} onValueChange={setPrompt} focusSignal={focusSignal} autoFocus={compact} />
        </motion.div>

        {/* Floating moods: orbit the composer on desktop, a swipeable row below it elsewhere */}
        <div
          className={cn(
            "no-scrollbar -mx-5 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-4",
            "xl:pointer-events-none xl:absolute xl:inset-0 xl:m-0 xl:block xl:overflow-visible xl:p-0",
          )}
          aria-label="Moments to start from"
        >
          {HERO_MOODS.map((mood, i) => (
            <MoodCard
              key={mood.id}
              mood={mood}
              index={i}
              floatDelay={i * -1.7}
              onPick={pick}
              onHover={setHovered}
              className={cn("w-[17rem] shrink-0 snap-start xl:pointer-events-auto xl:absolute xl:w-[16.5rem]", ORBIT[i])}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
