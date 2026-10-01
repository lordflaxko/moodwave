"use client";

import Image from "next/image";
import { useState } from "react";

import { coverArt } from "@/lib/mood";
import { cn } from "@/lib/utils";

/**
 * Album artwork that fills its (positioned) parent. Uses real artwork when available and
 * falls back to a deterministic generated cover if the URL is missing or fails to load.
 */
export function Cover({
  src,
  seed,
  alt,
  sizes,
  className,
  priority,
}: {
  src: string | null | undefined;
  seed: string;
  alt: string;
  /** next/image `sizes`, e.g. "56px" or "(min-width: 768px) 40vw, 90vw" */
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const art = coverArt(seed);

  return (
    <div
      className={cn("relative aspect-square overflow-hidden bg-ink-4", className)}
      style={showImage ? undefined : { background: art.background }}
      role={showImage || !alt ? undefined : "img"}
      aria-label={showImage || !alt ? undefined : alt}
      aria-hidden={!alt || undefined}
    >
      {showImage ? (
        <Image
          src={src!}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : null}
      {/* Subtle sheen so covers read as physical objects */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.08),transparent_40%)]" />
    </div>
  );
}

/** Artist photograph with the editorial monochrome treatment (blooms to colour on hover). */
export function Portrait({
  src,
  name,
  sizes,
  className,
  lit,
  priority,
}: {
  src: string | null | undefined;
  name: string;
  sizes: string;
  className?: string;
  lit?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("portrait", lit && "is-lit", className)}>
      {src && !failed ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className="object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center font-display text-[min(3rem,40%)] text-fg-faint" aria-label={name}>
          {name.slice(0, 1)}
        </span>
      )}
    </div>
  );
}
