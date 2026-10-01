"use client";

import { Check, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Cover } from "@/components/art/cover";
import { Dialog, Skeleton } from "@/components/ui/primitives";
import { useTrackSearch, useUpdateTracks } from "@/lib/api/hooks";
import type { Playlist } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function AddSongDialog({
  playlist,
  open,
  onOpenChange,
}: {
  playlist: Playlist;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const search = useTrackSearch(debounced);
  const update = useUpdateTracks(playlist.id);
  const existing = new Set(playlist.tracks.map((t) => t.id));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add a song"
      description="Search Spotify and drop any track into this playlist."
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Song or artist"
          aria-label="Search songs"
          className="h-12 w-full rounded-full border border-line-strong bg-ink/60 pr-4 pl-10 text-[15px] outline-none focus:border-lilac/50"
        />
      </div>
      <div className="mt-4 min-h-48 overflow-y-auto">
        {debounced.trim().length < 2 ? (
          <p className="py-12 text-center text-sm text-fg-subtle">Start typing to search.</p>
        ) : search.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : search.isError ? (
          <p className="py-12 text-center text-sm text-coral">{search.error.message}</p>
        ) : !search.data?.length ? (
          <p className="py-12 text-center text-sm text-fg-subtle">No songs found for “{debounced}”.</p>
        ) : (
          <ul className="space-y-1">
            {search.data.map((track) => {
              const added = existing.has(track.id);
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    disabled={added || update.isPending}
                    onClick={() =>
                      update.mutate([...playlist.tracks, { ...track, reason: "Added by you" }], {
                        onSuccess: () => toast.success(`Added “${track.title}”`),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-white/[0.06] disabled:opacity-60"
                  >
                    <Cover src={track.image_url} seed={track.album} alt="" sizes="40px" className="size-10 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{track.title}</span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {track.artists.join(", ")} · {formatDuration(track.duration_ms)}
                      </span>
                    </span>
                    <span className="grid size-8 place-items-center rounded-full bg-white/[0.06]">
                      {added ? <Check className="size-4 text-mint" aria-label="Already added" /> : <Plus className="size-4" aria-label="Add" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
