"use client";

import { ArrowUp, ChevronUp, Wand2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { REFINE_SUGGESTIONS } from "@/lib/prompts";
import { usePlayer } from "@/lib/store/player";
import type { Playlist } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RefineProps {
  playlist: Playlist;
  pending: boolean;
  pendingInstruction?: string;
  onRefine: (instruction: string) => void;
}

function Thinking() {
  return (
    <span className="flex items-center gap-1" aria-label="Refining">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-[var(--mood-b)]"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function Conversation({ playlist, pending, pendingInstruction }: Omit<RefineProps, "onRefine">) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [playlist.refinements.length, pending]);

  return (
    <div className="space-y-3 text-sm" aria-live="polite">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2">{playlist.prompt}</div>
      <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-line px-3.5 py-2 text-fg-muted">
        Built “{playlist.title}” with {playlist.stats.track_count} songs.
      </div>
      {playlist.refinements.map((turn) => (
        <div key={turn.id} className="space-y-3">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2">{turn.instruction}</div>
          <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-line px-3.5 py-2 text-fg-muted">
            {turn.summary}
            {turn.added || turn.removed ? (
              <span className="mt-1.5 flex gap-2 font-mono text-[11px]">
                {turn.added ? <span className="text-mint">+{turn.added}</span> : null}
                {turn.removed ? <span className="text-coral">−{turn.removed}</span> : null}
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {pending && pendingInstruction ? (
        <div className="space-y-3">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/10 px-3.5 py-2">{pendingInstruction}</div>
          <div className="w-fit rounded-2xl rounded-bl-md border border-line px-3.5 py-3">
            <Thinking />
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

function RefineInput({ pending, onRefine, compact }: { pending: boolean; onRefine: (s: string) => void; compact?: boolean }) {
  const [value, setValue] = useState("");
  const submit = (text: string) => {
    const instruction = text.trim();
    if (instruction.length < 2 || pending) return;
    onRefine(instruction);
    setValue("");
  };
  return (
    <div className="space-y-2.5">
      <div className={cn("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5", !compact && "flex-wrap")}>
        {REFINE_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => submit(s)}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition hover:border-line-strong hover:text-fg disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="flex items-center gap-2 rounded-full border border-line-strong bg-ink/60 py-1.5 pr-1.5 pl-4 focus-within:border-[var(--mood-b)]/60"
      >
        <label htmlFor={compact ? "refine-compact" : "refine"} className="sr-only">
          Tell the AI how to change the playlist
        </label>
        <input
          id={compact ? "refine-compact" : "refine"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={300}
          placeholder="Make it more…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={pending || value.trim().length < 2}
          className="mood-ring grid size-8 shrink-0 place-items-center rounded-full text-white transition disabled:opacity-40"
          aria-label="Send refinement"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** Desktop: sticky conversational panel. */
export function RefinePanel(props: RefineProps) {
  return (
    <section aria-labelledby="refine-heading" className="glass flex max-h-[min(36rem,70vh)] flex-col rounded-xl3 p-5">
      <h2 id="refine-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="size-4 text-[var(--mood-b)]" aria-hidden /> Refine with words
      </h2>
      <div className="mt-4 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        <Conversation {...props} />
      </div>
      <div className="mt-4">
        <RefineInput pending={props.pending} onRefine={props.onRefine} />
      </div>
    </section>
  );
}

/** Mobile/tablet: bottom bar that expands into a sheet with history. */
export function RefineBar(props: RefineProps) {
  const [open, setOpen] = useState(false);
  // Sit above the docked player when something is playing.
  const playerOpen = usePlayer((s) => Boolean(s.current));
  return (
    <div
      className={cn("fixed inset-x-0 z-40 px-3 pb-3 transition-[bottom] duration-300 lg:hidden", playerOpen ? "bottom-[6.25rem]" : "bottom-0")}
    >
      <div className="glass-strong mx-auto max-w-2xl rounded-3xl p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mb-2 flex w-full items-center justify-between px-1 text-xs text-fg-muted"
          aria-expanded={open}
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="size-3.5 text-[var(--mood-b)]" aria-hidden /> Refine with words
            {props.playlist.refinements.length
              ? ` · ${props.playlist.refinements.length} ${props.playlist.refinements.length === 1 ? "edit" : "edits"}`
              : ""}
          </span>
          <ChevronUp className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mb-3 max-h-[40vh] overflow-y-auto px-1">
                <Conversation {...props} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <RefineInput pending={props.pending} onRefine={props.onRefine} compact />
      </div>
    </div>
  );
}
