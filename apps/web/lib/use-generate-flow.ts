"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useAuthDialog } from "@/components/layout/auth-dialog";
import { api } from "@/lib/api/client";
import { keys, useConfig, useGenerate } from "@/lib/api/hooks";
import type { GenerateInput, User } from "@/lib/types";

/**
 * Generate a playlist from anywhere in the app:
 * makes sure there's a session (demo or Spotify), runs generation, then navigates
 * to the result. Signed-out visitors get the auth dialog when Spotify is configured,
 * or a demo session automatically when it isn't.
 */
export function useGenerateFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const generate = useGenerate();
  const { data: config } = useConfig();
  const showAuth = useAuthDialog((s) => s.show);
  // Covers the request plus the minimum display time, so the overlay doesn't flicker shut.
  const [busy, setBusy] = useState(false);

  // Keep the progress screen up long enough to read, even when the offline curator is instant.
  const MIN_OVERLAY_MS = 2400;

  const run = async (input: GenerateInput) => {
    const startedAt = Date.now();
    setBusy(true);
    try {
      const playlist = await generate.mutateAsync(input);
      const remaining = MIN_OVERLAY_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (playlist.notice) toast.warning(playlist.notice, { duration: 8000 });
      router.push(`/playlist/${playlist.id}`);
      window.scrollTo({ top: 0 });
    } catch (error) {
      if ((error as { status?: number }).status === 401) {
        qc.setQueryData(keys.me, null);
        showAuth(() => void run(input));
        return;
      }
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = async (input: GenerateInput) => {
    const prompt = input.prompt.trim();
    if (prompt.length < 3) {
      toast.error("Tell me a little more. A few words about the mood or moment is plenty.");
      return;
    }
    let me = qc.getQueryData<User | null>(keys.me);
    if (me === undefined) me = await qc.fetchQuery({ queryKey: keys.me, queryFn: () => api<User | null>("/auth/me") });
    if (!me) {
      if (config?.spotify_enabled) {
        showAuth(() => void run({ ...input, prompt }));
        return;
      }
      try {
        const user = await api<User>("/auth/demo", { method: "POST" });
        qc.setQueryData(keys.me, user);
      } catch (error) {
        toast.error((error as Error).message);
        return;
      }
    }
    await run({ ...input, prompt });
  };

  return { start, isPending: busy || generate.isPending, variables: generate.variables };
}
