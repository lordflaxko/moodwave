"use client";

import { ArrowUp, History } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { EASE } from "@/lib/motion";
import { REFINE_SUGGESTIONS } from "@/lib/moods";
import { usePlayer } from "@/lib/store/player";
import type { Playlist } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

function Session({ playlist }: { playlist: Playlist }) {
  return (
    <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1 text-sm">
      <p className="eyebrow">This session</p>
      <div className="space-y-3">
        <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2">{playlist.prompt}</div>
        <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-line px-3.5 py-2 text-fg-muted">
          Composed “{playlist.title}” with {playlist.stats.track_count} songs.
        </div>
        {playlist.refinements.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2">
              {turn.instruction}
            </div>
            <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-line px-3.5 py-2 text-fg-muted">
              {turn.summary}
              <span className="mt-1.5 flex items-center gap-3 font-mono text-[10px] tracking-wider uppercase">
                {turn.added ? <span className="text-moss">+{turn.added} in</span> : null}
                {turn.removed ? <span className="text-rose">−{turn.removed} out</span> : null}
                <span className="text-fg-faint">{relativeTime(turn.created_at)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Floating conversational refinement: "Make it more…". Portaled to <body> so it stays
 * fixed regardless of page transforms, and lifts above the player when music is playing.
 */
export function RefineComposer({
  playlist,
  pending,
  pendingInstruction,
  onRefine,
}: {
  playlist: Playlist;
  pending: boolean;
  pendingInstruction?: string;
  onRefine: (instruction: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const playerOpen = usePlayer((s) => Boolean(s.current));

  useEffect(() => setMounted(true), []);

  const submit = (text: string) => {
    const instruction = text.trim();
    if (instruction.length < 2 || pending) return;
    onRefine(instruction);
    setValue("");
  };

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: 0.6 }}
      className={cn(
        "fixed inset-x-0 z-40 px-3 transition-[bottom] duration-500 ease-[var(--ease-out-expo)] sm:px-5",
        playerOpen ? "bottom-[6.5rem]" : "bottom-4",
      )}
    >
      <div
        className={cn(
          "chrome mx-auto max-w-2xl rounded-[1.75rem] p-2 transition-[border-color] duration-500",
          focused && "border-lilac/35",
        )}
      >
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-1.5 pt-1 pb-2">
          <AnimatePresence mode="wait" initial={false}>
            {pending ? (
              <motion.p
                key="pending"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex h-8 items-center gap-2.5 px-2 text-[13px] text-fg-muted"
                aria-live="polite"
              >
                <span className="flex h-3 items-end gap-0.5" aria-hidden>
                  {[0, 1, 2].map((b) => (
                    <span key={b} className="block h-full w-0.5 origin-bottom animate-eq rounded-full bg-lilac" style={{ animationDelay: `${b * 0.15}s` }} />
                  ))}
                </span>
                Re-sequencing: <span className="truncate text-fg italic">“{pendingInstruction}”</span>
              </motion.p>
            ) : (
              <motion.div
                key="suggestions"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-1.5"
              >
                <span className="eyebrow shrink-0 pr-1 pl-1.5 text-[10px]">Make it more</span>
                {REFINE_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => submit(s.instruction)}
                    className="h-8 shrink-0 rounded-full border border-line-strong px-3 text-[13px] text-fg-muted transition-all duration-300 hover:-translate-y-px hover:border-fg-faint hover:text-fg"
                  >
                    {s.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
          className="flex items-center gap-2 rounded-[1.4rem] bg-ink/60 py-1.5 pr-1.5 pl-2"
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="relative grid size-9 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-white/[0.06] hover:text-fg"
                aria-label={`Session history, ${playlist.refinements.length} edits`}
              >
                <History className="size-4" />
                {playlist.refinements.length ? (
                  <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-lilac font-mono text-[9px] text-ink">
                    {playlist.refinements.length}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-[min(26rem,calc(100vw-2rem))]">
              <Session playlist={playlist} />
            </PopoverContent>
          </Popover>
          <label htmlFor="refine-input" className="sr-only">
            Tell the curator how to change this playlist
          </label>
          <input
            id="refine-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            maxLength={300}
            autoComplete="off"
            placeholder="Make it more… (e.g. upbeat, but keep the same artists)"
            className="min-w-0 flex-1 bg-transparent font-display text-[17px] font-light outline-none placeholder:text-fg-faint placeholder:italic"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.9 }}
            disabled={pending || value.trim().length < 2}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-lilac text-ink transition disabled:bg-white/[0.06] disabled:text-fg-faint"
            aria-label="Refine playlist"
          >
            <ArrowUp className="size-4" />
          </motion.button>
        </form>
      </div>
    </motion.div>,
    document.body,
  );
}
