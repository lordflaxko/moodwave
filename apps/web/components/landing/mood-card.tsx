"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { Cover, Portrait } from "@/components/art/cover";
import { useArtistLookup } from "@/components/landing/use-artist-lookup";
import { EASE } from "@/lib/motion";
import { moodColors } from "@/lib/mood";
import type { Mood } from "@/lib/moods";
import { cn, energyLabel } from "@/lib/utils";

/**
 * A "moment" card: overlapping portraits of the artists cast for the mood, one of their
 * records, and the mood itself. Picking it fills the composer.
 */
export function MoodCard({
  mood,
  onPick,
  onHover,
  className,
  floatDelay = 0,
  index = 0,
}: {
  mood: Mood;
  onPick: (mood: Mood) => void;
  onHover?: (mood: Mood | null) => void;
  className?: string;
  floatDelay?: number;
  index?: number;
}) {
  const lookup = useArtistLookup();
  const { a } = moodColors(mood.energy, mood.valence);
  const record = mood.cast.map((name) => lookup.recordOf(name)).find(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.6 + index * 0.09 }}
      className={className}
    >
      {/* Idle float lives on its own layer so it never fights the hover lift. */}
      <div className="animate-float" style={{ animationDelay: `${floatDelay}s` }}>
      <button
        type="button"
        onClick={() => onPick(mood)}
        onMouseEnter={() => onHover?.(mood)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(mood)}
        onBlur={() => onHover?.(null)}
        className={cn(
          "group relative flex w-full items-center gap-3.5 rounded-[1.4rem] border border-line bg-ink-2/80 p-2.5 pr-4 text-left backdrop-blur-md",
          "transition-[border-color,background-color,box-shadow,transform] duration-500 ease-[var(--ease-out-expo)]",
          "hover:-translate-y-1 hover:border-line-strong hover:bg-ink-3/90 hover:shadow-[0_24px_60px_-24px_rgb(0_0_0/0.9)]",
        )}
      >
        <span className="relative size-14 shrink-0">
          <Cover
            src={record?.src}
            seed={record?.seed ?? mood.id}
            alt=""
            sizes="56px"
            className="absolute inset-0 rounded-xl transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-rotate-6"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: a, boxShadow: `0 0 10px ${a}` }} />
            <span className="eyebrow text-[10px]">{energyLabel(mood.energy)}</span>
          </span>
          <span className="mt-0.5 block font-display text-[17px] leading-tight font-light tracking-[-0.01em] text-fg">
            {mood.label}
          </span>
          <span className="mt-2 flex items-center">
            {mood.cast.slice(0, 4).map((name, i) => (
              <Portrait
                key={name}
                src={lookup.portrait(name)}
                name={name}
                sizes="28px"
                className={cn("size-6 rounded-full ring-2 ring-ink-2", i > 0 && "-ml-1.5")}
              />
            ))}
            <span className="ml-2 truncate text-xs text-fg-subtle">
              {mood.cast.slice(0, 2).join(", ")}
            </span>
          </span>
        </span>
        <ArrowUpRight
          className="size-4 shrink-0 text-fg-faint transition-all duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg"
          aria-hidden
        />
      </button>
      </div>
    </motion.div>
  );
}
