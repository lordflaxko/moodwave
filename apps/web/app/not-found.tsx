import { Disc3 } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 pt-44 text-center">
      <Disc3 className="size-10 animate-[spin_6s_linear_infinite] text-fg-faint" aria-hidden />
      <p className="eyebrow mt-8">404</p>
      <h1 className="display mt-4 text-[clamp(3rem,8vw,5.5rem)]">
        This track <em>skipped.</em>
      </h1>
      <p className="mt-5 text-fg-muted">The page you&apos;re looking for isn&apos;t in the crate.</p>
      <Link href="/" className={buttonClasses("solid", "lg", "mt-9")}>
        Back to the start
      </Link>
    </div>
  );
}
