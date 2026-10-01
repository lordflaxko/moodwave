"use client";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Mosaic } from "@/components/art/cover";
import { PromptComposer } from "@/components/prompt/prompt-composer";
import { Skeleton } from "@/components/ui/primitives";
import { useMe, usePlaylists } from "@/lib/api/hooks";
import { moodColors } from "@/lib/mood";
import { EXAMPLE_PROMPTS, type ExamplePrompt } from "@/lib/prompts";
import { cn, relativeTime } from "@/lib/utils";

const CATEGORIES: ExamplePrompt["category"][] = ["Focus", "Move", "Feel", "Moments"];

function RecentPlaylists() {
  const { data: me } = useMe();
  const { data, isLoading } = usePlaylists(Boolean(me));
  if (!me) return null;
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!data?.length) return null;
  return (
    <section aria-labelledby="recent-heading" className="mt-16">
      <div className="flex items-center justify-between">
        <h2 id="recent-heading" className="text-sm font-medium text-fg-muted">
          Jump back in
        </h2>
        <Link href="/library" className="text-sm text-fg-subtle hover:text-fg">
          View library
        </Link>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.slice(0, 4).map((p) => (
          <li key={p.id}>
            <Link
              href={`/playlist/${p.id}`}
              className="glass group flex items-center gap-3 rounded-2xl p-2.5 pr-3 transition hover:bg-white/[0.08]"
            >
              <Mosaic
                items={p.cover_images.map((src, i) => ({ src, seed: p.cover_seeds[i] ?? p.id }))}
                size={56}
                className="size-14 shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {p.track_count} songs · {relativeTime(p.created_at)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Studio() {
  const params = useSearchParams();
  const [prompt, setPrompt] = useState(params.get("prompt") ?? "");
  const [category, setCategory] = useState<ExamplePrompt["category"]>("Focus");

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-10 sm:pt-16">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <p className="text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">Studio</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
          What are we <span className="font-display font-normal text-gradient italic">listening to?</span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-fg-muted">
          Be as specific or as vague as you like: a mood, a place, an activity, a decade, a feeling you can&apos;t name.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10"
      >
        <PromptComposer value={prompt} onValueChange={setPrompt} variant="studio" autoFocus />
      </motion.div>

      <section aria-labelledby="ideas-heading" className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="ideas-heading" className="text-sm font-medium text-fg-muted">
            Need a spark?
          </h2>
          <div role="tablist" aria-label="Prompt categories" className="flex gap-1 rounded-full bg-white/[0.04] p-1">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "relative rounded-full px-3 py-1 text-xs transition-colors",
                  category === c ? "text-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                {category === c ? (
                  <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-white/10" />
                ) : null}
                <span className="relative">{c}</span>
              </button>
            ))}
          </div>
        </div>
        <ul role="tabpanel" className="mt-4 grid gap-2 sm:grid-cols-2">
          {EXAMPLE_PROMPTS.filter((p) => p.category === category).map((item) => {
            const { a } = moodColors(item.energy, item.valence);
            return (
              <motion.li key={item.prompt} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPrompt(item.prompt);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-line bg-white/[0.02] p-4 text-left transition hover:border-line-strong hover:bg-white/[0.05]"
                >
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: a, boxShadow: `0 0 12px ${a}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="mt-0.5 block text-sm text-fg-subtle">{item.prompt}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-fg-subtle transition group-hover:text-fg" aria-hidden />
                </button>
              </motion.li>
            );
          })}
        </ul>
      </section>

      <RecentPlaylists />
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <Studio />
    </Suspense>
  );
}
