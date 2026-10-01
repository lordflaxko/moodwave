"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import { Portrait } from "@/components/art/cover";
import { Eyebrow } from "@/components/ui/primitives";
import { EASE, spring } from "@/lib/motion";
import type { Track } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The playlist's line-up as faces. Click an artist to spotlight their songs below. */
export function Featuring({
  tracks,
  active,
  onToggle,
}: {
  tracks: Track[];
  active: string | null;
  onToggle: (artist: string | null) => void;
}) {
  const lineup = useMemo(() => {
    const counts = new Map<string, { name: string; image: string | null; count: number; first: number }>();
    tracks.forEach((t, i) => {
      const name = t.artists[0];
      if (!name) return;
      const entry = counts.get(name) ?? { name, image: t.artist_images?.[0] ?? null, count: 0, first: i };
      entry.count += 1;
      entry.image ??= t.artist_images?.[0] ?? null;
      counts.set(name, entry);
    });
    return [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first).slice(0, 10);
  }, [tracks]);

  if (!lineup.length) return null;

  return (
    <section aria-labelledby="featuring-heading" className="mt-20">
      <div className="flex items-baseline justify-between">
        <Eyebrow>
          <span id="featuring-heading">Featuring</span>
        </Eyebrow>
        {active ? (
          <button className="eyebrow text-lilac hover:text-fg" onClick={() => onToggle(null)}>
            Clear spotlight
          </button>
        ) : (
          <span className="eyebrow hidden text-fg-faint sm:inline">Tap an artist to spotlight their songs</span>
        )}
      </div>
      <ul className="no-scrollbar -mx-5 mt-6 flex gap-6 overflow-x-auto px-5 pb-2">
        <AnimatePresence initial={false} mode="popLayout">
          {lineup.map((artist, i) => {
            const isActive = active === artist.name;
            return (
              <motion.li
                key={artist.name}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: active && !isActive ? 0.35 : 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ ...spring.layout, opacity: { duration: 0.5, ease: EASE }, delay: i * 0.02 }}
                className="shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onToggle(isActive ? null : artist.name)}
                  aria-pressed={isActive}
                  className="group flex w-[5.5rem] flex-col items-center text-center"
                >
                  <span
                    className={cn(
                      "rounded-full p-[3px] transition-colors duration-500",
                      isActive ? "bg-lilac" : "bg-transparent",
                    )}
                  >
                    <Portrait
                      src={artist.image}
                      name={artist.name}
                      sizes="80px"
                      lit={isActive}
                      className="size-[4.75rem] rounded-full transition-transform duration-500 group-hover:scale-105"
                    />
                  </span>
                  <span className="mt-2.5 line-clamp-2 text-[13px] leading-tight text-fg">{artist.name}</span>
                  <span className="eyebrow mt-1 text-[9.5px]">
                    {artist.count} {artist.count === 1 ? "song" : "songs"}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
