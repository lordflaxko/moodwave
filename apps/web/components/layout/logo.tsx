import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="mood-ring relative grid size-7 place-items-center rounded-lg shadow-[0_6px_20px_-6px_var(--mood-a)]">
        <svg viewBox="0 0 20 20" className="size-4 text-white" aria-hidden>
          {[3, 7, 11, 15].map((x, i) => (
            <rect key={x} x={x} y={[7, 4, 6, 9][i]} width="2" height={[6, 12, 8, 3][i]} rx="1" fill="currentColor" />
          ))}
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">moodwave</span>
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
        stroke="#07070a"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
