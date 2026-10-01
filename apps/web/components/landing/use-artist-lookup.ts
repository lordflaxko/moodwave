"use client";

import { useMemo } from "react";

import { useFeatured } from "@/lib/api/hooks";
import type { FeaturedArtist } from "@/lib/types";

/** Name → portrait / cover lookups over the public featured catalog. */
export function useArtistLookup() {
  const { data, isLoading } = useFeatured();
  return useMemo(() => {
    const artists = new Map<string, FeaturedArtist>((data?.artists ?? []).map((a) => [a.name, a]));
    return {
      isLoading,
      artists: data?.artists ?? [],
      tracks: data?.tracks ?? [],
      portrait: (name: string) => artists.get(name)?.image_url ?? null,
      artist: (name: string) => artists.get(name),
      /** The artist's signature record (cover + album), for pairing a face with a sleeve. */
      recordOf: (name: string) => {
        const a = artists.get(name);
        return a ? { src: a.cover_url, seed: a.album, title: a.top_track } : null;
      },
    };
  }, [data, isLoading]);
}
