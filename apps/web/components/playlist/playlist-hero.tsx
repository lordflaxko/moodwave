"use client";

import { Check, ExternalLink, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Mosaic } from "@/components/art/cover";
import { SpotifyGlyph } from "@/components/layout/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/primitives";
import { useDeletePlaylist, useRegenerate, useRename, useSaveToSpotify } from "@/lib/api/hooks";
import { usePlayer } from "@/lib/store/player";
import type { Playlist } from "@/lib/types";
import { formatTotal, relativeTime } from "@/lib/utils";

function EditableTitle({ playlist }: { playlist: Playlist }) {
  const rename = useRename(playlist.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(playlist.title);

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (!title || title === playlist.title) {
      setDraft(playlist.title);
      return;
    }
    rename.mutate({ title }, { onError: (e) => toast.error(e.message) });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={100}
        aria-label="Playlist title"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(playlist.title);
            setEditing(false);
          }
        }}
        className="w-full rounded-xl bg-white/[0.06] px-2 py-1 text-4xl font-semibold tracking-[-0.03em] outline-none sm:text-6xl"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(playlist.title);
        setEditing(true);
      }}
      className="group -mx-2 flex items-center gap-3 rounded-xl px-2 text-left"
      aria-label={`Rename playlist ${playlist.title}`}
    >
      <h1 className="text-4xl leading-[1.02] font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
        {playlist.title}
      </h1>
      <Pencil className="size-4 shrink-0 text-fg-subtle opacity-0 transition group-hover:opacity-100" aria-hidden />
    </button>
  );
}

export function PlaylistHero({ playlist, onAddSong }: { playlist: Playlist; onAddSong: () => void }) {
  const router = useRouter();
  const save = useSaveToSpotify(playlist.id);
  const regenerate = useRegenerate(playlist.id);
  const remove = useDeletePlaylist();
  const play = usePlayer((s) => s.play);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { stats } = playlist;
  const saved = Boolean(playlist.spotify_playlist_id);

  return (
    <section className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, rotate: -2 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
        className="relative w-44 shrink-0 sm:w-60"
      >
        <div aria-hidden className="mood-ring absolute inset-4 rounded-3xl opacity-60 blur-2xl" />
        <Mosaic
          items={playlist.tracks.slice(0, 4).map((t) => ({ src: t.image_url, seed: t.album }))}
          size={240}
          priority
          className="relative rounded-3xl shadow-2xl ring-1 shadow-black/60 ring-white/10"
        />
      </motion.div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">
          AI playlist · {relativeTime(playlist.created_at)}
        </p>
        <div className="mt-2">
          <EditableTitle key={playlist.title} playlist={playlist} />
        </div>
        <p className="mt-3 max-w-2xl text-fg-muted">{playlist.description}</p>
        <p className="mt-3 max-w-2xl font-display text-lg text-fg/80 italic">“{playlist.prompt}”</p>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-subtle" aria-label="Playlist stats">
          <li><span className="font-medium text-fg">{stats.track_count}</span> songs</li>
          <li><span className="font-medium text-fg">{formatTotal(stats.total_duration_ms)}</span></li>
          <li><span className="font-medium text-fg">{stats.artist_count}</span> artists</li>
          {stats.explicit_count > 0 ? (
            <li><span className="font-medium text-fg">{stats.explicit_count}</span> explicit</li>
          ) : (
            <li className="text-mint/80">Clean</li>
          )}
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            variant="mood"
            size="lg"
            onClick={() => playlist.tracks[0] && play(playlist.tracks[0], playlist.tracks)}
            disabled={!playlist.tracks.length}
          >
            <Play className="size-4 fill-current" /> Play
          </Button>
          {saved && playlist.spotify_url ? (
            <a href={playlist.spotify_url} target="_blank" rel="noreferrer" className={buttonClasses("primary", "lg")}>
              <SpotifyGlyph className="size-5" /> Open in Spotify <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          <Button
            variant={saved ? "glass" : "primary"}
            size="lg"
            loading={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: (p) =>
                  toast.success(saved ? "Saved a fresh copy to Spotify" : "Saved to Spotify", {
                    description: p.spotify_url ? "Find it in your library." : "Demo mode: saved to your demo account.",
                  }),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {saved ? <Check className="size-4" /> : <SpotifyGlyph className="size-5" />}
            {saved ? "Save again" : "Save to Spotify"}
          </Button>
          <Button
            size="lg"
            loading={regenerate.isPending}
            onClick={() =>
              regenerate.mutate(undefined, {
                onSuccess: () => toast.success("Fresh take generated"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {!regenerate.isPending ? <RefreshCw className="size-4" /> : null} Regenerate
          </Button>
          <Button size="icon" className="size-12" aria-label="Add a song" title="Add a song" onClick={onAddSong}>
            <Plus className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-12"
            aria-label="Delete playlist"
            title="Delete playlist"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this playlist?"
        description={
          saved
            ? "It will be removed from Moodwave. The copy saved in your Spotify library stays untouched."
            : "This removes it from your Moodwave library. This can't be undone."
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-coral text-white hover:bg-coral/90"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(playlist.id, {
                onSuccess: () => {
                  toast("Playlist deleted");
                  router.push("/library");
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
