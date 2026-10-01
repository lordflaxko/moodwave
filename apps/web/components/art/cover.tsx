import Image from "next/image";

import { coverArt } from "@/lib/mood";
import { cn } from "@/lib/utils";

/**
 * Album artwork. Uses Spotify artwork when available, otherwise a deterministic
 * generated cover so demo-mode tracks still look like a real library.
 */
export function Cover({
  src,
  seed,
  alt,
  size,
  className,
  priority,
}: {
  src: string | null | undefined;
  seed: string;
  alt: string;
  size: number;
  className?: string;
  priority?: boolean;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        priority={priority}
        sizes={`${size}px`}
        className={cn("aspect-square object-cover", className)}
      />
    );
  }
  const art = coverArt(seed);
  return (
    <div
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn("relative aspect-square overflow-hidden", className)}
      style={{ background: art.background }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(255_255_255/0.18),transparent_45%)]" />
    </div>
  );
}

/** 2×2 mosaic used for playlist covers. */
export function Mosaic({
  items,
  size,
  className,
  priority,
}: {
  items: { src: string | null; seed: string }[];
  size: number;
  className?: string;
  priority?: boolean;
}) {
  const cells = [...items];
  while (cells.length < 4) cells.push({ src: null, seed: `empty-${cells.length}` });
  return (
    <div className={cn("grid aspect-square grid-cols-2 grid-rows-2 overflow-hidden", className)}>
      {cells.slice(0, 4).map((cell, i) => (
        <Cover key={i} src={cell.src} seed={cell.seed} alt="" size={Math.round(size / 2)} priority={priority} className="h-full w-full" />
      ))}
    </div>
  );
}
