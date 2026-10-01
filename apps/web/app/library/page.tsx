"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Collage } from "@/components/art/collage";
import { Cover, Portrait } from "@/components/art/cover";
import { useArtistLookup } from "@/components/landing/use-artist-lookup";
import { useAuthDialog } from "@/components/layout/auth-dialog";
import { SpotifyGlyph } from "@/components/layout/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Eyebrow, Reveal, Skeleton } from "@/components/ui/primitives";
import { useMe, usePlaylists, useSpotifyPlaylists } from "@/lib/api/hooks";
import { EASE } from "@/lib/motion";
import type { PlaylistSummary } from "@/lib/types";
import { cn, energyLabel, formatTotal } from "@/lib/utils";

type Filter = "all" | "saved" | "drafts";
const ASPECTS = ["aspect-[4/5]", "aspect-square", "aspect-[5/4]", "aspect-square", "aspect-[4/5]"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function PlaylistCard({ playlist, index }: { playlist: PlaylistSummary; index: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.8, ease: EASE, delay: Math.min(index, 10) * 0.05 }}
      className="mb-6 break-inside-avoid"
    >
      <Link href={`/playlist/${playlist.id}`} className="group block">
        <div className="relative overflow-hidden rounded-[1.5rem] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] ring-1 ring-white/[0.05] transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-translate-y-1.5">
          <Collage
            items={playlist.cover_images.map((src, i) => ({ src, seed: playlist.cover_seeds[i] ?? playlist.id }))}
            className={cn("w-full", ASPECTS[index % ASPECTS.length])}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <span className="absolute right-4 bottom-4 grid size-10 translate-y-2 place-items-center rounded-full bg-fg text-ink opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="size-4" />
          </span>
          {playlist.saved_to_spotify ? (
            <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1 font-mono text-[10px] tracking-wider text-fg uppercase backdrop-blur">
              <SpotifyGlyph className="size-3" /> On Spotify
            </span>
          ) : null}
        </div>
        <div className="px-1 pt-4">
          <p className="eyebrow text-[10px]">
            {playlist.moods[0] ?? energyLabel(playlist.energy)} · {energyLabel(playlist.energy)}
          </p>
          <h2 className="mt-1.5 font-display text-2xl leading-tight font-light tracking-[-0.02em]">{playlist.title}</h2>
          <p className="mt-1.5 line-clamp-2 text-sm text-fg-subtle italic">“{playlist.prompt}”</p>
          <p className="mt-3 font-mono text-[11px] text-fg-faint tabular-nums">
            {playlist.track_count} tracks · {formatTotal(playlist.total_duration_ms)} · {formatDate(playlist.created_at)}
          </p>
        </div>
      </Link>
    </motion.li>
  );
}

function SpotifyShelf() {
  const { data, isLoading, isError } = useSpotifyPlaylists();
  if (isError) return null;
  return (
    <Reveal as="section" className="mt-32" aria-labelledby="spotify-heading">
      <div className="flex items-end justify-between border-b border-line pb-4">
        <h2 id="spotify-heading" className="flex items-center gap-2.5 font-display text-3xl font-light">
          <SpotifyGlyph className="size-6" /> On your Spotify
        </h2>
        <span className="eyebrow hidden sm:inline">Most recent</span>
      </div>
      {isLoading ? (
        <div className="mt-8 flex gap-5 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-40 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="mt-8 text-fg-subtle">Nothing saved yet. Playlists you save from Moodwave appear here.</p>
      ) : (
        <ul className="no-scrollbar -mx-5 mt-8 flex gap-5 overflow-x-auto px-5 pb-2">
          {data.map((p) => {
            const body = (
              <>
                <Cover src={p.image_url} seed={p.name} alt="" sizes="160px" className="w-full rounded-2xl transition-transform duration-500 group-hover:-translate-y-1" />
                <p className="mt-3 truncate text-sm">{p.name}</p>
                <p className="font-mono text-[11px] text-fg-faint">{p.track_count} tracks</p>
              </>
            );
            return (
              <li key={p.id} className="group w-40 shrink-0">
                {p.external_url ? (
                  <a href={p.external_url} target="_blank" rel="noreferrer">
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Reveal>
  );
}

function EmptyShelf({ signedIn }: { signedIn: boolean }) {
  const { artists } = useArtistLookup();
  const showAuth = useAuthDialog((s) => s.show);
  const faces = artists.slice(0, 5);
  return (
    <Reveal className="mx-auto mt-16 flex max-w-2xl flex-col items-center text-center">
      <div className="flex -space-x-6" aria-hidden>
        {faces.map((a, i) => (
          <motion.div
            key={a.name}
            initial={{ opacity: 0, y: 16, rotate: (i - 2) * 6 }}
            animate={{ opacity: 1, y: i % 2 ? 6 : -6, rotate: (i - 2) * 6 }}
            transition={{ duration: 1, ease: EASE, delay: i * 0.08 }}
          >
            <Portrait src={a.image_url} name={a.name} sizes="112px" className="aspect-[3/4] w-24 rounded-2xl ring-4 ring-ink sm:w-28" />
          </motion.div>
        ))}
      </div>
      <h2 className="display mt-12 text-[clamp(2.5rem,6vw,4rem)]">
        {signedIn ? (
          <>
            Your shelf is empty. <em>For now.</em>
          </>
        ) : (
          <>
            Your records <em>live here.</em>
          </>
        )}
      </h2>
      <p className="mt-5 max-w-md text-fg-muted">
        {signedIn
          ? "Describe a moment and your first playlist will land on this shelf."
          : "Sign in or start the demo to keep every playlist you compose."}
      </p>
      {signedIn ? (
        <Link href="/generate" className={buttonClasses("accent", "lg", "mt-9")}>
          Compose your first <ArrowRight className="size-4" />
        </Link>
      ) : (
        <Button variant="solid" size="lg" className="mt-9" onClick={() => showAuth()}>
          Get started
        </Button>
      )}
    </Reveal>
  );
}

export default function LibraryPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading, isError, error, refetch } = usePlaylists(Boolean(me));
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () =>
      (data ?? []).filter((p) => (filter === "all" ? true : filter === "saved" ? p.saved_to_spotify : !p.saved_to_spotify)),
    [data, filter],
  );
  const totalMinutes = Math.round((data ?? []).reduce((sum, p) => sum + p.total_duration_ms, 0) / 60000);

  return (
    <div className="mx-auto max-w-6xl px-5 pt-36 pb-10">
      <header className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
        <div>
          <Eyebrow>Library</Eyebrow>
          <h1 className="display mt-4 text-[clamp(3.25rem,8vw,6.5rem)]">
            Your <em>collection</em>
          </h1>
          {data?.length ? (
            <p className="mt-4 font-mono text-[11px] tracking-wider text-fg-subtle uppercase">
              {data.length} playlists · {totalMinutes} minutes of music
            </p>
          ) : null}
        </div>
        {data?.length ? (
          <div role="tablist" aria-label="Filter playlists" className="flex gap-6">
            {(
              [
                ["all", "Everything"],
                ["saved", "On Spotify"],
                ["drafts", "Drafts"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "relative pb-1.5 text-sm transition-colors",
                  filter === value ? "text-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                {label}
                {filter === value ? (
                  <motion.span layoutId="lib-filter" className="absolute inset-x-0 -bottom-px h-px bg-lilac" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {meLoading || (me && isLoading) ? (
        <div className="mt-16 columns-1 gap-6 sm:columns-2 lg:columns-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mb-6 break-inside-avoid">
              <Skeleton className={cn("w-full rounded-[1.5rem]", ASPECTS[i % ASPECTS.length])} />
              <Skeleton className="mt-4 h-6 w-2/3" />
              <Skeleton className="mt-2 h-3 w-full" />
            </div>
          ))}
        </div>
      ) : !me ? (
        <EmptyShelf signedIn={false} />
      ) : isError ? (
        <div className="mt-20 text-center">
          <p className="text-fg-muted">{error.message}</p>
          <Button className="mt-5" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : !data?.length ? (
        <EmptyShelf signedIn />
      ) : filtered.length === 0 ? (
        <p className="mt-20 text-center font-display text-2xl font-light text-fg-subtle italic">Nothing on this shelf yet.</p>
      ) : (
        <ul className="mt-16 columns-1 gap-6 sm:columns-2 lg:columns-3">
          {filtered.map((p, i) => (
            <PlaylistCard key={p.id} playlist={p} index={i} />
          ))}
        </ul>
      )}

      {me ? <SpotifyShelf /> : null}
    </div>
  );
}
