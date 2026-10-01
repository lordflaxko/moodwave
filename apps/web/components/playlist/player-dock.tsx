"use client";

import { ExternalLink, SkipBack, SkipForward, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { Cover } from "@/components/art/cover";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/lib/store/player";
import type { Track } from "@/lib/types";
import { formatDuration } from "@/lib/utils";

const isDemoTrack = (track: Track) => track.uri.startsWith("demo:");

/**
 * Demo tracks have no Spotify id to play, so this simulates playback progress so the
 * flow can still be shown end to end.
 */
function SimulatedPlayback({ track }: { track: Track }) {
  const [progress, setProgress] = useState(0);
  const next = usePlayer((s) => s.next);

  useEffect(() => {
    setProgress(0);
    const timer = setInterval(() => setProgress((p) => p + 1000), 1000);
    return () => clearInterval(timer);
  }, [track.id]);

  useEffect(() => {
    if (progress >= Math.min(track.duration_ms, 30_000)) next();
  }, [progress, track.duration_ms, next]);

  const pct = Math.min(100, (progress / track.duration_ms) * 100);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex h-5 items-end gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((bar) => (
          <span
            key={bar}
            className="block h-full w-0.5 origin-bottom animate-eq rounded-full bg-lilac"
            style={{ animationDelay: `${bar * 0.15}s` }}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] text-fg-subtle tabular-nums">{formatDuration(progress)}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-fg transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-fg-subtle tabular-nums">{formatDuration(track.duration_ms)}</span>
    </div>
  );
}

/** Docked player. Real tracks use Spotify's embed (full playback for logged-in Premium listeners). */
export function PlayerDock() {
  const { current, close, next, previous } = usePlayer();

  return (
    <AnimatePresence>
      {current ? (
        <motion.aside
          key="dock"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-3 z-50 px-3 sm:px-5"
          aria-label="Now playing"
        >
          <div className="chrome mx-auto flex max-w-3xl items-center gap-3 rounded-[1.5rem] p-2 pr-3">
            {isDemoTrack(current) ? (
              <>
                <motion.div
                  key={current.id}
                  initial={{ rotate: -8, scale: 0.85, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 22 }}
                  className="size-12 shrink-0 overflow-hidden rounded-xl shadow-lg"
                >
                  <Cover src={current.image_url} seed={current.album} alt="" sizes="48px" className="h-full w-full" />
                </motion.div>
                <div className="w-32 min-w-0 shrink-0 sm:w-44">
                  <p className="truncate text-sm font-medium">{current.title}</p>
                  <p className="truncate text-xs text-fg-subtle">
                    {current.artists.join(", ")} · <span className="text-amber/80">preview</span>
                  </p>
                </div>
                <SimulatedPlayback track={current} />
              </>
            ) : (
              <iframe
                key={current.id}
                title={`Spotify player: ${current.title}`}
                src={`https://open.spotify.com/embed/track/${current.id}?utm_source=moodwave&theme=0`}
                className="h-20 min-w-0 flex-1 rounded-2xl"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
              />
            )}
            <div className="flex shrink-0 items-center">
              <Button variant="ghost" size="icon" aria-label="Previous track" onClick={previous} className="hidden sm:inline-flex">
                <SkipBack className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next track" onClick={next}>
                <SkipForward className="size-4" />
              </Button>
              {current.external_url ? (
                <a
                  href={current.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hidden size-9 place-items-center rounded-full text-fg-muted hover:bg-white/[0.06] hover:text-fg sm:grid"
                  aria-label="Open in Spotify"
                >
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
              <Button variant="ghost" size="icon" aria-label="Close player" onClick={close}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
