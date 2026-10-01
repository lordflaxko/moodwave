"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const MESSAGES: Record<string, string> = {
  access_denied: "Spotify sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
  token_exchange_failed: "Spotify sign-in failed. Please try again.",
  not_allowlisted:
    "This Spotify app is in development mode and your account isn't on its allow-list yet. Try the demo instead.",
  spotify_error: "Spotify returned an error during sign-in.",
};

/** Surfaces OAuth callback errors (`/?auth_error=...`) as a toast, then cleans the URL. */
export function AuthErrorNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("auth_error");

  useEffect(() => {
    if (!code) return;
    toast.error(MESSAGES[code] ?? "Sign-in failed.", { duration: 8000 });
    router.replace("/", { scroll: false });
  }, [code, router]);

  return null;
}
