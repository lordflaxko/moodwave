"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 pt-28 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went off-beat</h1>
      <p className="mt-2 text-fg-muted">An unexpected error occurred. Try again, and if it keeps happening, refresh the page.</p>
      <Button variant="primary" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
