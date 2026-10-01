"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 pt-44 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="display mt-4 text-[clamp(3rem,8vw,5rem)]">
        The needle <em>slipped.</em>
      </h1>
      <p className="mt-5 text-fg-muted">An unexpected error occurred. Try again, and refresh if it keeps happening.</p>
      <Button variant="solid" size="lg" className="mt-9" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
