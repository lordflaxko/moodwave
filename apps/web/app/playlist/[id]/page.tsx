"use client";

import { useIsMutating } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Disc3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuthDialog } from "@/components/layout/auth-dialog";
import { AddSongDialog } from "@/components/playlist/add-song-dialog";
import { Featuring } from "@/components/playlist/featuring";
import { LinerNotes } from "@/components/playlist/liner-notes";
import { PlaylistHero } from "@/components/playlist/playlist-hero";
import { RefineComposer } from "@/components/playlist/refine-composer";
import { TrackList } from "@/components/playlist/track-list";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api/client";
import { useConfig, usePlaylist, useRefine } from "@/lib/api/hooks";
import { useMoodTheme } from "@/lib/use-mood-theme";

function PlaylistSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-32" aria-busy="true" aria-label="Loading playlist">
      <div className="grid items-end gap-12 lg:grid-cols-[27rem_1fr]">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-5">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-20 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-4 gap-6 pt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-24 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-2">
            <Skeleton className="size-14 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const showAuth = useAuthDialog((s) => s.show);
  const status = error instanceof ApiError ? error.status : 0;
  const content =
    status === 401
      ? {
          title: "Sign in to hear this one",
          body: "Your session ended, or you haven't connected yet.",
          action: (
            <Button variant="solid" onClick={() => showAuth(onRetry)}>
              Sign in
            </Button>
          ),
        }
      : status === 404
        ? {
            title: "This record isn't in the crate",
            body: "It may have been deleted, or it belongs to another account.",
            action: (
              <Link href="/generate" className={buttonClasses("solid")}>
                Compose a new one
              </Link>
            ),
          }
        : {
            title: "Couldn't load this playlist",
            body: error.message,
            action: (
              <Button variant="solid" onClick={onRetry}>
                Try again
              </Button>
            ),
          };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 pt-44 text-center">
      {status === 404 ? <Disc3 className="size-10 text-fg-faint" /> : <AlertTriangle className="size-10 text-amber" />}
      <h1 className="display mt-8 text-5xl">{content.title}</h1>
      <p className="mt-4 text-fg-muted">{content.body}</p>
      <div className="mt-8">{content.action}</div>
    </div>
  );
}

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { data: playlist, isLoading, error, refetch } = usePlaylist(id);
  const { data: config } = useConfig();
  const refine = useRefine(id);
  const regenerating = useIsMutating({ mutationKey: ["regenerate", id] }) > 0;
  const [addOpen, setAddOpen] = useState(false);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  useMoodTheme(playlist?.intent.energy, playlist?.intent.valence);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  // Drop the spotlight if that artist leaves the playlist after a refinement.
  useEffect(() => {
    if (spotlight && playlist && !playlist.tracks.some((t) => t.artists.includes(spotlight))) setSpotlight(null);
  }, [playlist, spotlight]);

  if (isLoading) return <PlaylistSkeleton />;
  if (error || !playlist) return <ErrorState error={error ?? new Error("Not found")} onRetry={() => refetch()} />;

  const onRefine = (instruction: string) =>
    refine.mutate(instruction, {
      onSuccess: (p) => {
        const last = p.refinements[p.refinements.length - 1];
        toast.success(last?.summary ?? "Playlist updated");
        if (p.notice) toast.warning(p.notice);
      },
      onError: (e) => toast.error(e.message),
    });

  const backdrop = playlist.tracks[0]?.image_url;

  return (
    <div className="relative">
      {/* Atmosphere: the lead record, enlarged and dissolved into the dark */}
      {backdrop ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[110vh] overflow-hidden">
          <Image src={backdrop} alt="" fill sizes="100vw" className="scale-125 object-cover opacity-[0.18] blur-[90px] saturate-[1.2]" />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/70 to-ink" />
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-5 pt-28 pb-56 sm:pt-32">
        <Link href="/library" className="eyebrow mb-10 inline-flex items-center gap-2 hover:text-fg">
          <ArrowLeft className="size-3.5" /> Library
        </Link>

        <PlaylistHero playlist={playlist} onAddSong={() => setAddOpen(true)} />

        {playlist.notice ? (
          <p role="status" className="mt-10 flex items-start gap-3 rounded-2xl border border-amber/20 bg-amber/[0.05] px-5 py-4 text-sm text-amber/90">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {playlist.notice}
          </p>
        ) : null}

        <Featuring tracks={playlist.tracks} active={spotlight} onToggle={setSpotlight} />

        <LinerNotes playlist={playlist} aiModelName={config?.ai_model} />

        <TrackList playlist={playlist} spotlight={spotlight} busy={refine.isPending || regenerating} />
      </div>

      <RefineComposer playlist={playlist} pending={refine.isPending} pendingInstruction={refine.variables} onRefine={onRefine} />
      <AddSongDialog playlist={playlist} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
