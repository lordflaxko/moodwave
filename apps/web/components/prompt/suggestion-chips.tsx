"use client";

import { motion } from "motion/react";

import { moodColors } from "@/lib/mood";
import { EXAMPLE_PROMPTS, type ExamplePrompt } from "@/lib/prompts";
import { cn } from "@/lib/utils";

export function SuggestionChips({
  onPick,
  items = EXAMPLE_PROMPTS.slice(0, 6),
  className,
}: {
  onPick: (prompt: ExamplePrompt) => void;
  items?: ExamplePrompt[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap justify-center gap-2", className)} aria-label="Example prompts">
      {items.map((item, i) => {
        const { a } = moodColors(item.energy, item.valence);
        return (
          <motion.li
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.06 }}
          >
            <button
              type="button"
              onClick={() => onPick(item)}
              className="group flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3.5 py-1.5 text-sm text-fg-muted transition hover:border-line-strong hover:bg-white/[0.07] hover:text-fg"
            >
              <span
                aria-hidden
                className="size-2 rounded-full transition-transform group-hover:scale-125"
                style={{ background: a, boxShadow: `0 0 10px ${a}` }}
              />
              {item.label}
            </button>
          </motion.li>
        );
      })}
    </ul>
  );
}
