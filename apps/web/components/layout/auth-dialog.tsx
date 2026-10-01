"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";

import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/primitives";
import { SpotifyGlyph } from "@/components/layout/logo";
import { useDemoLogin } from "@/lib/api/hooks";

interface AuthDialogState {
  open: boolean;
  onAuthed: (() => void) | null;
  show: (onAuthed?: () => void) => void;
  hide: () => void;
}

/** Opened when a signed-out visitor tries to generate and Spotify login is available. */
export const useAuthDialog = create<AuthDialogState>((set) => ({
  open: false,
  onAuthed: null,
  show: (onAuthed) => set({ open: true, onAuthed: onAuthed ?? null }),
  hide: () => set({ open: false, onAuthed: null }),
}));

export function AuthDialog() {
  const { open, onAuthed, hide } = useAuthDialog();
  const demo = useDemoLogin();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && hide()}
      title="Connect to start generating"
      description="Sign in with Spotify to save playlists to your account, or explore with the demo catalog."
    >
      <div className="flex flex-col gap-3">
        <a href="/api/auth/login" className={buttonClasses("solid", "lg", "w-full")}>
          <SpotifyGlyph className="size-5" />
          Continue with Spotify
        </a>
        <Button
          size="lg"
          className="w-full"
          loading={demo.isPending}
          onClick={() =>
            demo.mutate(undefined, {
              onSuccess: () => {
                const callback = onAuthed;
                hide();
                callback?.();
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <Sparkles className="size-4" />
          Try the demo instead
        </Button>
        <p className="pt-1 text-center text-xs text-fg-subtle">
          Moodwave only asks for permission to read your profile and top artists and to create playlists.
        </p>
      </div>
    </Dialog>
  );
}
