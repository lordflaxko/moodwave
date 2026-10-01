"use client";

import { motion } from "motion/react";
import { useMemo } from "react";

import { Portrait } from "@/components/art/cover";
import { useArtistLookup } from "@/components/landing/use-artist-lookup";
import { HERO_MOODS } from "@/lib/moods";
import { cn } from "@/lib/utils";

const COLUMNS = 7;
const PER_COLUMN = 4;

/**
 * Slow-moving wall of treated artist portraits behind the hero. Faces belonging to the
 * hovered mood light up in colour; everything else stays dim and monochrome.
 */
export function PortraitWall({ highlight }: { highlight: string[] }) {
  const { artists } = useArtistLookup();

  const columns = useMemo(() => {
    if (!artists.length) return [];
    const cast = HERO_MOODS.flatMap((m) => m.cast);
    const byName = new Map(artists.map((a) => [a.name, a]));
    const ordered = [
      ...cast.map((n) => byName.get(n)).filter((a): a is NonNullable<typeof a> => Boolean(a)),
      ...artists.filter((a) => !cast.includes(a.name)),
    ];
    // Interleave so each mood's cast is spread across the wall.
    const picked = ordered.slice(0, COLUMNS * PER_COLUMN);
    return Array.from({ length: COLUMNS }, (_, c) => picked.filter((_, i) => i % COLUMNS === c));
  }, [artists]);

  if (!columns.length) return null;

  return (
    <div aria-hidden className="mask-radial pointer-events-none absolute inset-x-0 -top-24 bottom-0 overflow-hidden">
      <div className="absolute inset-0 flex justify-center gap-4 opacity-[0.55]">
        {columns.map((column, c) => (
          <motion.div
            key={c}
            className="flex w-[clamp(7rem,13vw,11rem)] shrink-0 flex-col gap-4"
            initial={{ y: c % 2 ? -40 : 40 }}
            animate={{ y: c % 2 ? 40 : -40 }}
            transition={{ duration: 18 + c * 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
            style={{ marginTop: `${(c % 3) * 5}rem` }}
          >
            {column.map((artist) => {
              const lit = highlight.includes(artist.name);
              return (
                <div
                  key={artist.name}
                  className={cn("transition-opacity duration-700", highlight.length ? (lit ? "opacity-100" : "opacity-25") : "opacity-60")}
                >
                  <Portrait
                    src={artist.image_url}
                    name={artist.name}
                    sizes="180px"
                    lit={lit}
                    className="aspect-[3/4] w-full rounded-2xl"
                  />
                </div>
              );
            })}
          </motion.div>
        ))}
      </div>
      {/* Keep the headline and composer legible */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_55%_at_50%_48%,rgb(11_10_13/0.92),rgb(11_10_13/0.55)_60%,transparent)]" />
    </div>
  );
}
