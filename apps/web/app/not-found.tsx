import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-28 text-center">
      <p className="font-display text-8xl text-gradient italic">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">This track skipped</h1>
      <p className="mt-2 text-fg-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className={buttonClasses("primary", "md", "mt-6")}>
        Back home
      </Link>
    </div>
  );
}
