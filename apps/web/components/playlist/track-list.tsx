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
import { GripVertical, Play, RefreshCw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Cover } from "@/components/art/cover";
import { useReplaceTrack, useUpdateTracks } from "@/lib/api/hooks";
import { EASE, spring } from "@/lib/motion";
import { usePlayer } from "@/lib/store/player";
import type { Playlist, Track } from "@/lib/types";
import { cn, formatDuration } from "@/lib/utils";

function EnergyMeter({ energy }: { energy: number | null }) {
  if (energy == null) return <span className="w-14" />;
  return (
    <span className="flex w-14 items-center gap-2" role="img" aria-label={`Energy ${Math.round(energy * 100)} of 100`}>
      <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <span className="block h-full rounded-full bg-fg-muted" style={{ width: `${Math.max(8, energy * 100)}%` }} />
      </span>
    </span>
  );
}

function NowPlayingBars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-label="Now playing">
      {[0, 1, 2].map((b) => (
        <span key={b} className="block h-full w-[3px] origin-bottom animate-eq rounded-full bg-lilac" style={{ animationDelay: `${b * 0.15}s` }} />
      ))}
    </span>
  );
}

function TrackRow({
  track,
  index,
  isCurrent,
  isNew,
  dimmed,
  replacing,
  layoutEnabled,
  enterDelay,
  onPlay,
  onReplace,
  onRemove,
  disableRemove,
}: {
  track: Track;
  index: number;
  isCurrent: boolean;
  isNew: boolean;
  dimmed: boolean;
  replacing: boolean;
  layoutEnabled: boolean;
  enterDelay: number;
  onPlay: () => void;
  onReplace: () => void;
  onRemove: () => void;
  disableRemove: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });
  // Stagger only the entrance; later changes (spotlight dimming, reorders) respond instantly.
  const hasMounted = useRef(false);
  useEffect(() => {
    hasMounted.current = true;
  }, []);
  const delay = hasMounted.current ? 0 : enterDelay;

  return (
    // dnd-kit owns the <li> transform; motion animates an inner layer so the two never fight.
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("relative", isDragging && "z-20")}>
      <motion.div
        layout={layoutEnabled ? "position" : false}
        initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
        animate={{ opacity: dimmed ? 0.3 : 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, x: -24, filter: "blur(4px)", transition: { duration: 0.35, ease: EASE } }}
        transition={{
          ...spring.layout,
          opacity: { duration: 0.5, ease: EASE, delay },
          y: { duration: 0.6, ease: EASE, delay },
          filter: { duration: 0.5, delay },
        }}
        className={cn(
          "group relative grid grid-cols-[2rem_3.5rem_minmax(0,1fr)_auto] items-center gap-x-4 rounded-2xl px-2 py-2 sm:px-3",
          "md:grid-cols-[2rem_3.5rem_minmax(0,1.1fr)_minmax(0,1fr)_3.5rem_3rem_auto]",
          "transition-colors duration-300 hover:bg-white/[0.035] focus-within:bg-white/[0.035]",
          isDragging && "surface shadow-2xl",
          isCurrent && "bg-lilac/[0.07]",
        )}
      >
        {/* Index → drag handle on hover */}
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${track.title}. Press space, then use arrow keys.`}
          className="flex h-10 cursor-grab touch-none items-center justify-center rounded-lg text-fg-faint active:cursor-grabbing"
        >
          {isCurrent ? (
            <NowPlayingBars />
          ) : (
            <>
              <span className="font-mono text-[11px] tabular-nums group-hover:hidden group-focus-within:hidden">
                {String(index + 1).padStart(2, "0")}
              </span>
              <GripVertical className="hidden size-4 group-hover:block group-focus-within:block" aria-hidden />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onPlay}
          className="relative size-14 overflow-hidden rounded-xl shadow-[0_10px_24px_-12px_rgb(0_0_0/0.9)]"
          aria-label={`Play ${track.title}`}
        >
          <Cover src={track.image_url} seed={track.album} alt="" sizes="56px" className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
          <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <Play className="size-4 fill-white text-white" aria-hidden />
          </span>
        </button>

        <div className="min-w-0">
          <p className={cn("flex items-center gap-2 truncate text-[15.5px] font-medium", isCurrent && "text-lilac")}>
            <span className="truncate">{track.title}</span>
            {track.explicit ? (
              <span className="shrink-0 rounded-[4px] bg-white/10 px-1 font-mono text-[9px] leading-4 text-fg-subtle" title="Explicit">
                E
              </span>
            ) : null}
            {isNew ? (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="shrink-0 rounded-full bg-lilac/15 px-1.5 font-mono text-[9px] leading-4 tracking-wider text-lilac"
              >
                NEW
              </motion.span>
            ) : null}
          </p>
          <p className="truncate text-[13.5px] text-fg-subtle">
            {track.artists.join(", ")}
            <span className="text-fg-faint"> · {track.album}</span>
          </p>
          {track.reason ? (
            <p className="mt-0.5 truncate font-display text-[13px] font-light text-fg-faint italic md:hidden">{track.reason}</p>
          ) : null}
        </div>

        <p className="hidden min-w-0 font-display text-[14px] leading-snug font-light text-fg-subtle italic md:line-clamp-2" title={track.reason ?? undefined}>
          {track.reason}
        </p>

        <span className="hidden md:block">
          <EnergyMeter energy={track.energy} />
        </span>
        <span className="hidden text-right font-mono text-[11px] text-fg-subtle tabular-nums md:block">
          {formatDuration(track.duration_ms)}
        </span>

        <div className="flex items-center md:opacity-0 md:transition-opacity md:duration-300 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onReplace}
            disabled={replacing}
            className="grid size-9 place-items-center rounded-full text-fg-subtle transition hover:bg-white/[0.06] hover:text-fg"
            aria-label={`Swap ${track.title} for a similar song`}
            title="Swap for a similar song"
          >
            <RefreshCw className={cn("size-[15px]", replacing && "animate-spin text-lilac")} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disableRemove}
            className="grid size-9 place-items-center rounded-full text-fg-subtle transition hover:bg-rose/10 hover:text-rose disabled:opacity-30"
            aria-label={`Remove ${track.title}`}
            title="Remove"
          >
            <X className="size-4" />
          </button>
        </div>

        {replacing ? <span aria-hidden className="skeleton pointer-events-none absolute inset-0 rounded-2xl opacity-60" /> : null}
      </motion.div>
    </li>
  );
}

export function TrackList({
  playlist,
  spotlight,
  busy,
}: {
  playlist: Playlist;
  /** Artist to spotlight; other rows dim. */
  spotlight: string | null;
  /** A refine/regenerate is in flight: show a gentle shimmer over the list. */
  busy: boolean;
}) {
  const updateTracks = useUpdateTracks(playlist.id);
  const replace = useReplaceTrack(playlist.id);
  const { current, play } = usePlayer();
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Highlight songs that arrived since the last render (refine / replace / add).
  const previousIds = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(playlist.tracks.map((t) => t.id));
    const before = previousIds.current;
    previousIds.current = ids;
    if (!before) return;
    const fresh = new Set([...ids].filter((id) => !before.has(id)));
    if (!fresh.size) return;
    setNewIds(fresh);
    const timer = setTimeout(() => setNewIds(new Set()), 7000);
    return () => clearTimeout(timer);
  }, [playlist.tracks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const save = (tracks: Track[], undo?: Track[], message?: string) =>
    updateTracks.mutate(tracks, {
      onSuccess: () => {
        if (undo && message) toast(message, { action: { label: "Undo", onClick: () => updateTracks.mutate(undo) } });
      },
      onError: (e) => toast.error(e.message),
    });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    // Let dnd-kit's drop animation finish before re-enabling layout animation.
    setTimeout(() => setDragging(false), 250);
    if (!over || active.id === over.id) return;
    const from = playlist.tracks.findIndex((t) => t.id === active.id);
    const to = playlist.tracks.findIndex((t) => t.id === over.id);
    save(arrayMove(playlist.tracks, from, to));
  };

  return (
    <section aria-labelledby="tracks-heading" className="relative mt-16">
      <div className="mb-3 hidden grid-cols-[2rem_3.5rem_minmax(0,1.1fr)_minmax(0,1fr)_3.5rem_3rem_4.5rem] gap-x-4 px-3 md:grid">
        <span className="eyebrow text-[10px]">#</span>
        <span />
        <span id="tracks-heading" className="eyebrow text-[10px]">
          Tracklist
        </span>
        <span className="eyebrow text-[10px]">Why it&apos;s here</span>
        <span className="eyebrow text-[10px]">Energy</span>
        <span className="eyebrow text-right text-[10px]">Time</span>
        <span />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={playlist.tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ol className={cn("relative space-y-1 transition-opacity duration-500", busy && "opacity-60")}>
            <AnimatePresence initial>
              {playlist.tracks.map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  isCurrent={current?.id === track.id}
                  isNew={newIds.has(track.id)}
                  dimmed={Boolean(spotlight) && !track.artists.includes(spotlight!)}
                  replacing={replacingId === track.id}
                  layoutEnabled={!dragging}
                  enterDelay={Math.min(index, 24) * 0.035}
                  disableRemove={playlist.tracks.length <= 1}
                  onPlay={() => play(track, playlist.tracks)}
                  onReplace={() => {
                    setReplacingId(track.id);
                    replace.mutate(track.id, {
                      onSuccess: (p) => toast.success(`Swapped in “${p.tracks[index]?.title ?? "a new song"}”`),
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
            </AnimatePresence>
          </ol>
        </SortableContext>
      </DndContext>

      {busy ? <div aria-hidden className="skeleton pointer-events-none absolute inset-0 rounded-3xl opacity-40" /> : null}
    </section>
  );
}
