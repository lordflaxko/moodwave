"use client";

import { AlertTriangle, ArrowLeft, Music2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuthDialog } from "@/components/layout/auth-dialog";
import { AddSongDialog } from "@/components/playlist/add-song-dialog";
import { IntentPanel } from "@/components/playlist/intent-panel";
import { PlaylistHero } from "@/components/playlist/playlist-hero";
import { RefineBar, RefinePanel } from "@/components/playlist/refine-dock";
import { TrackList } from "@/components/playlist/track-list";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api/client";
import { useConfig, usePlaylist, useRefine } from "@/lib/api/hooks";
import { useMoodTheme } from "@/lib/use-mood-theme";

function PlaylistSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10" aria-busy="true" aria-label="Loading playlist">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-end">
        <Skeleton className="size-44 rounded-3xl sm:size-60" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2 pt-4">
            <Skeleton className="h-12 w-28 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-96 rounded-xl3 lg:block" />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const showAuth = useAuthDialog((s) => s.show);
  const status = error instanceof ApiError ? error.status : 0;

  const content =
    status === 401
      ? { title: "Sign in to see this playlist", body: "Your session ended or you haven't connected yet.", action: <Button variant="primary" onClick={() => showAuth(onRetry)}>Sign in</Button> }
      : status === 404
        ? { title: "This playlist doesn't exist", body: "It may have been deleted, or it belongs to another account.", action: <Link href="/generate" className={buttonClasses("primary")}>Create a new one</Link> }
        : { title: "Couldn't load this playlist", body: error.message, action: <Button variant="primary" onClick={onRetry}>Try again</Button> };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.06]">
        {status === 404 ? <Music2 className="size-6 text-fg-muted" /> : <AlertTriangle className="size-6 text-amber" />}
      </span>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">{content.title}</h1>
      <p className="mt-2 text-fg-muted">{content.body}</p>
      <div className="mt-6">{content.action}</div>
    </div>
  );
}

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { data: playlist, isLoading, error, refetch } = usePlaylist(id);
  const { data: config } = useConfig();
  const refine = useRefine(id);
  const [addOpen, setAddOpen] = useState(false);
  useMoodTheme(playlist?.intent.energy, playlist?.intent.valence);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

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

  const refineProps = {
    playlist,
    pending: refine.isPending,
    pendingInstruction: refine.variables,
    onRefine,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-48 lg:pb-16">
      <Link href="/library" className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg">
        <ArrowLeft className="size-4" /> Library
      </Link>

      <PlaylistHero playlist={playlist} onAddSong={() => setAddOpen(true)} />

      {playlist.notice ? (
        <p role="status" className="mt-6 flex items-start gap-2 rounded-2xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-amber/90">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {playlist.notice}
        </p>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={refine.isPending ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          <TrackList playlist={playlist} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <IntentPanel playlist={playlist} aiModelName={config?.ai_model} />
          <div className="hidden lg:block">
            <RefinePanel {...refineProps} />
          </div>
        </aside>
      </div>

      <RefineBar {...refineProps} />
      <AddSongDialog playlist={playlist} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
