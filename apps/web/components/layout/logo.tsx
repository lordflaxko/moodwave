import { cn } from "@/lib/utils";

/** Wordmark: a small record with an offset label, then the name in Fraunces. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <circle cx="14" cy="14" r="13" fill="#1f1c24" stroke="rgb(242 239 233 / 0.18)" />
        <circle cx="14" cy="14" r="9.5" fill="none" stroke="rgb(242 239 233 / 0.08)" />
        <circle cx="14" cy="14" r="6.5" fill="none" stroke="rgb(242 239 233 / 0.08)" />
        <circle cx="14" cy="14" r="4" fill="var(--color-lilac)" />
        <circle cx="14" cy="14" r="1.1" fill="#0b0a0d" />
      </svg>
      <span className="font-display text-[19px] font-normal tracking-[-0.03em] italic">moodwave</span>
    </span>
  );
}

/** Simple Spotify-style glyph (three arcs), used only to label the sign-in action. */
export function SpotifyGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#1ed760" />
      <path
        d="M6.5 9.2c3.6-1.1 7.9-.8 11 1M7 12.4c3-.9 6.5-.6 9.1.9M7.6 15.4c2.4-.6 4.9-.4 7 .7"
        stroke="#0b0a0d"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
