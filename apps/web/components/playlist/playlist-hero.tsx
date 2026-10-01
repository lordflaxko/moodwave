"use client";

import { Check, ExternalLink, MoreHorizontal, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Collage } from "@/components/art/collage";
import { SpotifyGlyph } from "@/components/layout/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog, Eyebrow, Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/primitives";
import { useDeletePlaylist, useRegenerate, useRename, useSaveToSpotify } from "@/lib/api/hooks";
import { EASE } from "@/lib/motion";
import { usePlayer } from "@/lib/store/player";
import type { Playlist } from "@/lib/types";
import { cn, energyLabel, formatTotal, relativeTime } from "@/lib/utils";

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

  const titleClass = "display text-[clamp(3rem,7vw,6rem)] text-balance";

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
        className={`${titleClass} -mx-2 w-full rounded-2xl bg-white/[0.04] px-2 outline-none`}
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
      className="group -mx-2 flex items-start gap-3 rounded-2xl px-2 text-left"
      aria-label={`Rename playlist ${playlist.title}`}
    >
      <motion.h1
        key={playlist.title}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
        className={titleClass}
      >
        {playlist.title}
      </motion.h1>
      <Pencil className="mt-4 size-4 shrink-0 text-fg-faint opacity-0 transition group-hover:opacity-100" aria-hidden />
    </button>
  );
}

function valenceLabel(v: number) {
  if (v < 0.25) return "Melancholic";
  if (v < 0.45) return "Bittersweet";
  if (v < 0.65) return "Balanced";
  if (v < 0.8) return "Warm";
  return "Euphoric";
}

export function PlaylistHero({ playlist, onAddSong }: { playlist: Playlist; onAddSong: () => void }) {
  const router = useRouter();
  const save = useSaveToSpotify(playlist.id);
  const regenerate = useRegenerate(playlist.id);
  const remove = useDeletePlaylist();
  const play = usePlayer((s) => s.play);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { stats, intent } = playlist;
  const saved = Boolean(playlist.spotify_playlist_id);

  const meta = [
    { label: "Songs", value: String(stats.track_count) },
    { label: "Duration", value: formatTotal(stats.total_duration_ms) },
    { label: "Mood", value: intent.moods[0] ? intent.moods[0] : valenceLabel(intent.valence) },
    { label: "Energy", value: energyLabel(intent.energy), bar: intent.energy },
  ];

  return (
    <section className="grid items-end gap-10 lg:grid-cols-[minmax(0,27rem)_1fr] lg:gap-16">
      <Collage
        variant="hero"
        priority
        items={playlist.tracks.slice(0, 6).map((t) => ({ src: t.image_url, seed: t.album, alt: `${t.album} cover` }))}
        className="mx-auto w-full max-w-[27rem]"
      />

      <div className="min-w-0">
        <Eyebrow>
          AI playlist · {relativeTime(playlist.created_at)} · {playlist.ai_source === "claude" ? "Curated by Claude" : "Offline curator"}
        </Eyebrow>
        <div className="mt-4">
          <EditableTitle key={playlist.title} playlist={playlist} />
        </div>
        <p className="mt-5 max-w-2xl text-lg text-pretty text-fg-muted">{playlist.description}</p>
        <p className="mt-3 max-w-2xl font-display text-[17px] font-light text-fg-subtle italic">“{playlist.prompt}”</p>

        <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-[auto_auto_1fr_1fr]">
          {meta.map((m) => (
            <div key={m.label}>
              <dt className="eyebrow text-[10px]">{m.label}</dt>
              <dd className={cn("mt-1.5 font-display text-2xl font-light", m.label === "Mood" && "capitalize")}>{m.value}</dd>
              {m.bar !== undefined ? (
                <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
                  <motion.div
                    className="h-full rounded-full bg-lilac"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(6, m.bar * 100)}%` }}
                    transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </dl>
        <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-fg-subtle">
          {intent.genres.slice(0, 5).map((g, i) => (
            <span key={g} className="capitalize">
              {i > 0 ? <span className="mr-3 text-fg-faint">/</span> : null}
              {g}
            </span>
          ))}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <Button
            variant="solid"
            size="lg"
            onClick={() => playlist.tracks[0] && play(playlist.tracks[0], playlist.tracks)}
            disabled={!playlist.tracks.length}
          >
            <Play className="size-4 fill-current" /> Play
          </Button>
          {saved && playlist.spotify_url ? (
            <a href={playlist.spotify_url} target="_blank" rel="noreferrer" className={buttonClasses("outline", "lg")}>
              <SpotifyGlyph className="size-5" /> Open in Spotify <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <Button
              variant="outline"
              size="lg"
              loading={save.isPending}
              onClick={() =>
                save.mutate(undefined, {
                  onSuccess: (p) =>
                    toast.success("Saved to Spotify", {
                      description: p.spotify_url ? "Find it in your library." : "Demo mode: saved to your demo account.",
                    }),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {saved ? <Check className="size-4 text-moss" /> : <SpotifyGlyph className="size-5" />}
              {saved ? "Saved" : "Save to Spotify"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="lg"
            loading={regenerate.isPending}
            onClick={() =>
              regenerate.mutate(undefined, {
                onSuccess: () => toast.success("A fresh take on your prompt"),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {!regenerate.isPending ? <RefreshCw className="size-4" /> : null} Regenerate
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label="More actions">
                <MoreHorizontal className="size-5" />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={onAddSong}>
                <Plus className="size-4" /> Add a song
              </MenuItem>
              {saved ? (
                <MenuItem
                  onSelect={() =>
                    save.mutate(undefined, {
                      onSuccess: () => toast.success("Saved a fresh copy to Spotify"),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  <SpotifyGlyph className="size-4" /> Save a new copy
                </MenuItem>
              ) : null}
              <MenuItem danger onSelect={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete playlist
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this playlist?"
        description={
          saved
            ? "It will be removed from Moodwave. The copy in your Spotify library stays untouched."
            : "This removes it from your library. This can't be undone."
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="solid"
            className="bg-rose text-ink hover:bg-rose/90"
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
