import { create } from "zustand";

import type { Track } from "@/lib/types";

interface PlayerState {
  queue: Track[];
  current: Track | null;
  play: (track: Track, queue?: Track[]) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
}

/** Global "now playing" state shared by track rows and the docked player. */
export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  current: null,
  play: (track, queue) => set({ current: track, queue: queue ?? get().queue }),
  next: () => {
    const { queue, current } = get();
    const index = queue.findIndex((t) => t.id === current?.id);
    if (index >= 0 && index < queue.length - 1) set({ current: queue[index + 1] });
  },
  previous: () => {
    const { queue, current } = get();
    const index = queue.findIndex((t) => t.id === current?.id);
    if (index > 0) set({ current: queue[index - 1] });
  },
  close: () => set({ current: null }),
}));
