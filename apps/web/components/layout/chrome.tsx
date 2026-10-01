"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { useConfig, useMe } from "@/lib/api/hooks";

/** Slow-moving aurora blobs tinted by the current mood colors. */
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-[30%] left-[10%] h-[70vh] w-[70vh] animate-aurora rounded-full bg-[var(--mood-a)] opacity-[0.22] blur-[120px] transition-colors duration-1000" />
      <div className="absolute top-[10%] -right-[15%] h-[60vh] w-[60vh] animate-aurora rounded-full bg-[var(--mood-b)] opacity-[0.16] blur-[120px] transition-colors duration-1000 [animation-delay:-6s]" />
      <div className="absolute bottom-[-30%] left-[30%] h-[60vh] w-[80vh] animate-aurora rounded-full bg-sky opacity-[0.07] blur-[140px] [animation-delay:-12s]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.025)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] bg-[size:64px_64px]" />
    </div>
  );
}

/** Explains which integrations are live, so a demo never feels "broken". */
export function DemoBanner() {
  const { data: config } = useConfig();
  const { data: me } = useMe();
  if (!config) return null;
  const demoCatalog = config.demo_mode || me?.is_demo;
  if (!demoCatalog && config.ai_enabled) return null;

  const parts = [
    demoCatalog ? "a curated sample catalog of 220+ real songs" : null,
    !config.ai_enabled ? "the offline heuristic curator (add an Anthropic key for Claude)" : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-2">
      <p className="flex items-start gap-2 rounded-2xl border border-amber/20 bg-amber/[0.06] px-4 py-2.5 text-xs text-amber/90 sm:items-center">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0 sm:mt-0" aria-hidden />
        <span>
          <strong className="font-semibold">Demo mode:</strong>{" "}
          <span className="hidden sm:inline">running on {parts.join(" and ")}. </span>
          <span className="sm:hidden">{demoCatalog ? "sample catalog" : "live Spotify"}{config.ai_enabled ? "" : " + offline curator"}. </span>
          <Link href="/about#setup" className="underline underline-offset-2 hover:text-amber">
            Connect real services
          </Link>
        </span>
      </p>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Logo className="text-fg" />
          <span className="hidden sm:inline">Describe a feeling. Hear it.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/generate" className="hover:text-fg">Create</Link>
          <Link href="/library" className="hover:text-fg">Library</Link>
          <Link href="/about" className="hover:text-fg">How it works</Link>
        </nav>
        <p className="text-xs">
          Not affiliated with Spotify. Music data © Spotify AB.
        </p>
      </div>
    </footer>
  );
}
