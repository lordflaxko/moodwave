"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Collage } from "@/components/art/collage";
import type { AutoStart } from "@/components/composer/composer";
import { Hero } from "@/components/landing/hero";
import { Eyebrow, Reveal } from "@/components/ui/primitives";
import { useMe, usePlaylists } from "@/lib/api/hooks";
import { relativeTime } from "@/lib/utils";

function RecentPlaylists() {
  const { data: me } = useMe();
  const { data } = usePlaylists(Boolean(me));
  if (!me || !data?.length) return null;
  return (
    <Reveal as="section" className="mx-auto max-w-5xl px-5 pb-10" aria-labelledby="recent-heading">
      <div className="flex items-end justify-between border-b border-line pb-4">
        <Eyebrow>
          <span id="recent-heading">Pick up where you left off</span>
        </Eyebrow>
        <Link href="/library" className="flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg">
          Library <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ul className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.slice(0, 6).map((p) => (
          <li key={p.id}>
            <Link href={`/playlist/${p.id}`} className="group flex items-center gap-4">
              <Collage
                items={p.cover_images.map((src, i) => ({ src, seed: p.cover_seeds[i] ?? p.id }))}
                className="size-16 shrink-0 rounded-xl transition-transform duration-500 group-hover:scale-105"
              />
              <span className="min-w-0">
                <span className="block truncate font-display text-lg font-light">{p.title}</span>
                <span className="block truncate text-xs text-fg-subtle">
                  {p.track_count} songs · {relativeTime(p.created_at)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** `?prompt=…&auto=1` (from the Framer site) composes straight away; length and energy are optional. */
function readAutoStart(params: URLSearchParams): AutoStart | undefined {
  if (params.get("auto") !== "1" || !params.get("prompt")?.trim()) return undefined;
  const rawLength = params.get("length");
  const rawEnergy = params.get("energy");
  const length = rawLength === null ? NaN : Number(rawLength);
  const energy = rawEnergy === null ? NaN : Number(rawEnergy);
  return {
    length: Number.isFinite(length) ? Math.min(100, Math.max(15, Math.round(length))) : 25,
    energy: Number.isFinite(energy) && energy >= 0 && energy <= 1 ? energy : null,
  };
}

function Studio() {
  const params = useSearchParams();
  const router = useRouter();
  const [autoStart] = useState(() => readAutoStart(new URLSearchParams(params.toString())));

  // Drop the trigger so a refresh or back-navigation doesn't compose a second playlist.
  useEffect(() => {
    if (!autoStart || params.get("auto") !== "1") return;
    const next = new URLSearchParams(params.toString());
    for (const key of ["auto", "length", "energy"]) next.delete(key);
    router.replace(`/generate?${next.toString()}`, { scroll: false });
  }, [autoStart, params, router]);

  return (
    <>
      <Hero initialPrompt={params.get("prompt") ?? ""} compact autoStart={autoStart} />
      <RecentPlaylists />
    </>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh]" />}>
      <Studio />
    </Suspense>
  );
}
