"use client";

import { ExternalLink, ListMusic, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Cover, Mosaic } from "@/components/art/cover";
import { useAuthDialog } from "@/components/layout/auth-dialog";
import { SpotifyGlyph } from "@/components/layout/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip, Skeleton } from "@/components/ui/primitives";
import { useMe, usePlaylists, useSpotifyPlaylists } from "@/lib/api/hooks";
import { moodStyle } from "@/lib/mood";
import type { PlaylistSummary } from "@/lib/types";
import { cn, formatTotal, relativeTime } from "@/lib/utils";

type Filter = "all" | "saved" | "unsaved";

function PlaylistCard({ playlist, index }: { playlist: PlaylistSummary; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      style={moodStyle(playlist.energy, 0.5)}
    >
      <Link
        href={`/playlist/${playlist.id}`}
        className="group glass flex h-full flex-col rounded-xl3 p-3 transition hover:-translate-y-1 hover:border-line-strong"
      >
        <div className="relative">
          <Mosaic
            items={playlist.cover_images.map((src, i) => ({ src, seed: playlist.cover_seeds[i] ?? playlist.id }))}
            size={280}
            className="w-full rounded-2xl"
          />
          {playlist.saved_to_spotify ? (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium backdrop-blur">
              <SpotifyGlyph className="size-3" /> Saved
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col px-1.5 pt-3.5 pb-1">
          <p className="truncate font-semibold">{playlist.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-fg-subtle italic">“{playlist.prompt}”</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {playlist.moods.slice(0, 2).map((m) => (
              <Chip key={m} tone="mood" className="capitalize">{m}</Chip>
            ))}
          </div>
          <p className="mt-auto pt-3 text-xs text-fg-subtle">
            {playlist.track_count} songs · {formatTotal(playlist.total_duration_ms)} · {relativeTime(playlist.created_at)}
          </p>
        </div>
      </Link>
    </motion.li>
  );
}

function SpotifySection() {
  const { data, isLoading, isError } = useSpotifyPlaylists();
  if (isError) return null;
  return (
    <section aria-labelledby="spotify-heading" className="mt-20">
      <h2 id="spotify-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <SpotifyGlyph className="size-5" /> On your Spotify
      </h2>
      <p className="mt-1 text-sm text-fg-subtle">Your most recent Spotify playlists, including ones Moodwave saved.</p>
      {isLoading ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="mt-5 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-fg-subtle">
          Nothing here yet. Save a Moodwave playlist to see it on Spotify.
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data.map((p) => {
            const inner = (
              <>
                <Cover src={p.image_url} seed={p.name} alt="" size={180} className="w-full rounded-2xl" />
                <p className="mt-2 flex items-center gap-1 truncate text-sm font-medium">
                  <span className="truncate">{p.name}</span>
                  {p.external_url ? <ExternalLink className="size-3 shrink-0 text-fg-subtle" aria-hidden /> : null}
                </p>
                <p className="text-xs text-fg-subtle">{p.track_count} songs</p>
              </>
            );
            return (
              <li key={p.id}>
                {p.external_url ? (
                  <a href={p.external_url} target="_blank" rel="noreferrer" className="block rounded-2xl transition hover:opacity-90">
                    {inner}
                  </a>
                ) : (
                  <div>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function LibraryPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading, isError, error, refetch } = usePlaylists(Boolean(me));
  const showAuth = useAuthDialog((s) => s.show);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () =>
      (data ?? []).filter((p) =>
        filter === "all" ? true : filter === "saved" ? p.saved_to_spotify : !p.saved_to_spotify,
      ),
    [data, filter],
  );

  if (!meLoading && !me) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-24 text-center">
        <span className="mood-ring grid size-14 place-items-center rounded-2xl text-white">
          <ListMusic className="size-6" />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Your library lives here</h1>
        <p className="mt-2 text-fg-muted">Sign in or start the demo to keep every playlist you generate.</p>
        <Button variant="primary" size="lg" className="mt-6" onClick={() => showAuth()}>
          Get started
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">Library</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            Your <span className="font-display font-normal italic">moods</span>, saved
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Filter playlists" className="flex gap-1 rounded-full bg-white/[0.04] p-1">
            {(["all", "saved", "unsaved"] as Filter[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs capitalize transition",
                  filter === f ? "bg-white/10 text-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                {f === "saved" ? "On Spotify" : f === "unsaved" ? "Drafts" : "All"}
              </button>
            ))}
          </div>
          <Link href="/generate" className={buttonClasses("mood", "md")}>
            <Sparkles className="size-4" /> New
          </Link>
        </div>
      </div>

      {isLoading || meLoading ? (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="glass rounded-xl3 p-3">
              <Skeleton className="aspect-square rounded-2xl" />
              <Skeleton className="mt-4 h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-full" />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <div className="mt-16 text-center">
          <p className="text-fg-muted">{error.message}</p>
          <Button className="mt-4" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : !data?.length ? (
        <div className="mt-12 flex flex-col items-center rounded-[2rem] border border-dashed border-line-strong px-6 py-20 text-center">
          <div className="flex -space-x-4" aria-hidden>
            {["empty-a", "empty-b", "empty-c"].map((seed, i) => (
              <Cover key={seed} src={null} seed={seed} alt="" size={72} className={cn("size-18 rounded-2xl ring-4 ring-ink", i === 1 && "-translate-y-2")} />
            ))}
          </div>
          <h2 className="mt-8 text-xl font-semibold">No playlists yet</h2>
          <p className="mt-2 max-w-sm text-fg-muted">Describe a moment and your first AI playlist will show up here.</p>
          <Link href="/generate" className={buttonClasses("mood", "lg", "mt-6")}>
            <Sparkles className="size-4" /> Generate your first
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-16 text-center text-fg-muted">No playlists match this filter.</p>
      ) : (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((p, i) => (
            <PlaylistCard key={p.id} playlist={p} index={i} />
          ))}
        </ul>
      )}

      {me ? <SpotifySection /> : null}
    </div>
  );
}
