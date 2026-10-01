"use client";

import { useEffect } from "react";

import { moodColors } from "./mood";

/** Re-tints the whole app (aurora, buttons, accents) to a playlist's mood while mounted. */
export function useMoodTheme(energy: number | undefined, valence: number | undefined) {
  useEffect(() => {
    if (energy === undefined || valence === undefined) return;
    const root = document.documentElement;
    const { a, b } = moodColors(energy, valence);
    root.style.setProperty("--mood-a", a);
    root.style.setProperty("--mood-b", b);
    return () => {
      root.style.removeProperty("--mood-a");
      root.style.removeProperty("--mood-b");
    };
  }, [energy, valence]);
}
