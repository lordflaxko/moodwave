import Link from "next/link";

import { Logo } from "@/components/layout/logo";

export function Footer() {
  return (
    <footer className="mt-40 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs font-display text-2xl leading-tight font-light text-fg-muted">
            Tell us a moment. <em className="text-fg">We&apos;ll find the soundtrack.</em>
          </p>
        </div>
        <div className="flex flex-col gap-6 sm:items-end">
          <nav aria-label="Footer" className="flex gap-6 text-sm text-fg-subtle">
            <Link href="/generate" className="hover:text-fg">Create</Link>
            <Link href="/library" className="hover:text-fg">Library</Link>
            <Link href="/about" className="hover:text-fg">How it works</Link>
          </nav>
          <p className="eyebrow text-fg-faint">Not affiliated with Spotify · Music data © respective owners</p>
        </div>
      </div>
    </footer>
  );
}
