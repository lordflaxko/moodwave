"use client";

import { useMemo } from "react";

import { Cover, Portrait } from "@/components/art/cover";
import { useArtistLookup } from "@/components/landing/use-artist-lookup";
import { Eyebrow, Reveal } from "@/components/ui/primitives";
import type { FeaturedArtist } from "@/lib/types";

function Row({ artists, reverse }: { artists: FeaturedArtist[]; reverse?: boolean }) {
  const doubled = [...artists, ...artists];
  return (
    <div className="mask-fade-x overflow-hidden">
      <ul
        className={`flex w-max gap-5 ${reverse ? "[animation-direction:reverse]" : ""} animate-marquee hover:[animation-play-state:paused]`}
      >
        {doubled.map((artist, i) => (
          <li key={`${artist.name}-${i}`} className="group w-[11.5rem] shrink-0 sm:w-[13rem]" aria-hidden={i >= artists.length}>
            <div className="relative">
              <Portrait
                src={artist.image_url}
                name={artist.name}
                sizes="210px"
                className="aspect-[3/4] w-full rounded-[1.25rem] transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-translate-y-1.5"
              />
              {/* Their record, tucked into the corner like a sleeve */}
              <div className="absolute right-3 bottom-3 size-12 overflow-hidden rounded-md shadow-xl ring-1 ring-black/40 transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:rotate-[-6deg] group-hover:scale-110">
                <Cover src={artist.cover_url} seed={artist.album} alt="" sizes="48px" className="h-full w-full" />
              </div>
            </div>
            <p className="mt-3 truncate font-display text-xl font-light tracking-[-0.02em]">{artist.name}</p>
            <p className="eyebrow mt-0.5 truncate text-[10px]">
              {artist.genre} · {artist.top_track}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Artists in rotation": the catalog's range, shown as people rather than a list. */
export function ArtistsBand() {
  const { artists } = useArtistLookup();
  const [first, second] = useMemo(() => {
    const pool = artists.slice(0, 32);
    return [pool.filter((_, i) => i % 2 === 0), pool.filter((_, i) => i % 2 === 1)];
  }, [artists]);

  return (
    <section aria-labelledby="artists-heading" className="py-28 sm:py-36">
      <Reveal className="mx-auto grid max-w-6xl gap-6 px-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Eyebrow>In rotation</Eyebrow>
          <h2 id="artists-heading" className="display mt-4 text-[clamp(2.5rem,6vw,4.75rem)]">
            Real artists. <em>Real records.</em>
          </h2>
        </div>
        <p className="max-w-sm text-[15px] text-fg-muted sm:text-right">
          Every pick is a real recording, checked against Spotify before it reaches you. Nothing made up, nothing
          generic.
        </p>
      </Reveal>
      {first.length ? (
        <div className="mt-14 space-y-8">
          <Row artists={first} />
          <Row artists={second} reverse />
        </div>
      ) : (
        <div className="mt-14 flex gap-5 overflow-hidden px-5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[3/4] w-52 shrink-0 rounded-[1.25rem]" />
          ))}
        </div>
      )}
    </section>
  );
}
