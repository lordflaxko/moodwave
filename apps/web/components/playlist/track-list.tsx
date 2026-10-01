"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle, Play, RefreshCw, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Cover } from "@/components/art/cover";
import { useReplaceTrack, useUpdateTracks } from "@/lib/api/hooks";
import { usePlayer } from "@/lib/store/player";
import type { Playlist, Track } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

function EnergyDots({ energy }: { energy: number | null }) {
  if (energy == null) return null;
  const level = Math.round(energy * 5);
  return (
    <span className="flex items-end gap-0.5" aria-label={`Energy ${Math.round(energy * 100)} of 100`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full", i <= level ? "bg-[var(--mood-b)]" : "bg-white/10")}
          style={{ height: 4 + i * 2.5 }}
        />
      ))}
    </span>
  );
}

function TrackRow({
  track,
  index,
  isCurrent,
  isNew,
  replacing,
  onPlay,
  onReplace,
  onRemove,
  disableRemove,
}: {
  track: Track;
  index: number;
  isCurrent: boolean;
  isNew: boolean;
  replacing: boolean;
  onPlay: () => void;
  onReplace: () => void;
  onRemove: () => void;
  disableRemove: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <motion.div
        initial={isNew ? { opacity: 0, x: -12 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: isNew ? 0.05 * (index % 10) : 0 }}
        className={cn(
          "group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-2 py-2 transition-colors sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_auto_3rem_auto] sm:px-3",
          "hover:bg-white/[0.05] focus-within:bg-white/[0.05]",
          isDragging && "glass-strong shadow-2xl",
          isCurrent && "bg-[color-mix(in_oklab,var(--mood-a)_14%,transparent)]",
          isNew && "ring-1 ring-[color-mix(in_oklab,var(--mood-b)_40%,transparent)]",
        )}
      >
        {/* Index / drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${track.title}. Use space then arrow keys to move.`}
          className="flex h-9 cursor-grab touch-none items-center justify-center rounded-lg text-fg-subtle active:cursor-grabbing"
        >
          <span className="font-mono text-xs tabular-nums group-hover:hidden group-focus-within:hidden">{index + 1}</span>
          <GripVertical className="hidden size-4 group-hover:block group-focus-within:block" aria-hidden />
        </button>

        {/* Cover + title */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onPlay}
            className="relative size-11 shrink-0 overflow-hidden rounded-xl"
            aria-label={`Play ${track.title}`}
          >
            <Cover src={track.image_url} seed={track.album} alt="" size={44} className="size-11" />
            <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition group-hover:opacity-100">
              <Play className="size-4 fill-white text-white" aria-hidden />
            </span>
          </button>
          <div className="min-w-0">
            <p className={cn("flex items-center gap-1.5 truncate text-[15px] font-medium", isCurrent && "text-[color-mix(in_oklab,var(--mood-b)_60%,white)]")}>
              <span className="truncate">{track.title}</span>
              {track.explicit ? (
                <span className="shrink-0 rounded bg-white/15 px-1 text-[9px] leading-4 font-bold text-fg-muted" title="Explicit">
                  E
                </span>
              ) : null}
              {isNew ? (
                <span className="shrink-0 rounded-full bg-[var(--mood-a)]/30 px-1.5 text-[9px] leading-4 font-semibold text-fg">NEW</span>
              ) : null}
            </p>
            <p className="truncate text-sm text-fg-subtle">
              {track.artists.join(", ")}
              <span className="sm:hidden"> · {formatDuration(track.duration_ms)}</span>
            </p>
          </div>
        </div>

        {/* Why (AI reason) */}
        <p className="hidden min-w-0 text-sm text-fg-subtle sm:block" title={track.reason ?? undefined}>
          <span className="line-clamp-2">{track.reason ?? track.album}</span>
        </p>

        <span className="hidden sm:block">
          <EnergyDots energy={track.energy} />
        </span>

        <span className="hidden text-right font-mono text-xs text-fg-subtle tabular-nums sm:block">
          {formatDuration(track.duration_ms)}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onReplace}
            disabled={replacing}
            className="grid size-8 place-items-center rounded-full text-fg-subtle transition hover:bg-white/10 hover:text-fg disabled:opacity-100"
            aria-label={`Replace ${track.title} with a similar song`}
            title="Swap for a similar song"
          >
            {replacing ? <LoaderCircle className="size-4 animate-spin text-[var(--mood-b)]" /> : <RefreshCw className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disableRemove}
            className="grid size-8 place-items-center rounded-full text-fg-subtle transition hover:bg-coral/15 hover:text-coral disabled:opacity-30"
            aria-label={`Remove ${track.title}`}
            title="Remove"
          >
            <X className="size-4" />
          </button>
        </div>
      </motion.div>
    </li>
  );
}

export function TrackList({ playlist }: { playlist: Playlist }) {
  const updateTracks = useUpdateTracks(playlist.id);
  const replace = useReplaceTrack(playlist.id);
  const { current, play } = usePlayer();
  const [replacingId, setReplacingId] = useState<string | null>(null);

  // Highlight tracks that appeared since the last render (refine / replace / add).
  const previousIds = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(playlist.tracks.map((t) => t.id));
    if (previousIds.current) {
      const fresh = new Set([...ids].filter((id) => !previousIds.current!.has(id)));
      if (fresh.size) {
        setNewIds(fresh);
        const timer = setTimeout(() => setNewIds(new Set()), 6000);
        previousIds.current = ids;
        return () => clearTimeout(timer);
      }
    }
    previousIds.current = ids;
  }, [playlist.tracks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (tracks: Track[], undo?: Track[], message?: string) =>
    updateTracks.mutate(tracks, {
      onSuccess: () => {
        if (undo && message) {
          toast(message, { action: { label: "Undo", onClick: () => updateTracks.mutate(undo) } });
        }
      },
      onError: (e) => toast.error(e.message),
    });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = playlist.tracks.findIndex((t) => t.id === active.id);
    const to = playlist.tracks.findIndex((t) => t.id === over.id);
    save(arrayMove(playlist.tracks, from, to));
  };

  return (
    <section aria-labelledby="tracks-heading">
      <div className="mb-2 hidden grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_auto_3rem_auto] gap-3 border-b border-line px-3 pb-3 text-[11px] tracking-wider text-fg-subtle uppercase sm:grid">
        <span>#</span>
        <span id="tracks-heading">Title</span>
        <span>Why it&apos;s here</span>
        <span>Energy</span>
        <span className="text-right">Time</span>
        <span className="w-[4.25rem]" />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={playlist.tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-0.5">
            {playlist.tracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                isCurrent={current?.id === track.id}
                isNew={newIds.has(track.id)}
                replacing={replacingId === track.id}
                disableRemove={playlist.tracks.length <= 1}
                onPlay={() => play(track, playlist.tracks)}
                onReplace={() => {
                  setReplacingId(track.id);
                  replace.mutate(track.id, {
                    onSuccess: (p) => {
                      const added = p.tracks[index];
                      toast.success(`Swapped in “${added?.title ?? "a new song"}”`);
                    },
                    onError: (e) => toast.error(e.message),
                    onSettled: () => setReplacingId(null),
                  });
                }}
                onRemove={() => {
                  const previous = playlist.tracks;
                  save(
                    previous.filter((t) => t.id !== track.id),
                    previous,
                    `Removed “${track.title}”`,
                  );
                }}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}
